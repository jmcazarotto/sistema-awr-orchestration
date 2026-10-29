import { DemandaSchema, InboxMessageSchema, SseEnvelopeSchema, SSE_HISTORY_LIMIT } from '../../shared/types';
import type { ActorId, ActorStatus, Demanda, EstadoDemanda, InboxMessage, SseEnvelope, SseEvent } from '../../shared/types';
import type { Clock, DemandMutation, EngineState, IdGenerator, MessageHandler, StateStore } from './interfaces';
import { emptyState } from './interfaces';
import { transition } from './demandaState';
import { OrchestratorError } from './errors';

export class EventBus {
  private state: EngineState = emptyState();
  private writes: Promise<unknown> = Promise.resolve();
  private readonly handlers = new Map<ActorId, MessageHandler>();
  private readonly tails = new Map<ActorId, Promise<void>>();
  private readonly jobs = new Map<string, Promise<void>>();
  private readonly listeners = new Set<(event: SseEnvelope) => void>();
  private readonly events: SseEnvelope[] = [];
  private eventId = 0;
  private readonly epoch: string;
  private running = false;
  constructor(private readonly store: StateStore, readonly clock: Clock, readonly ids: IdGenerator, readonly maxHops: number) { this.epoch = ids.next(); }
  async hydrate(): Promise<void> { this.state = await this.store.load(); this.running = true; }
  register(actor: ActorId, handler: MessageHandler): void { this.handlers.set(actor, handler); }
  snapshot(): EngineState { return structuredClone(this.state); }
  getDemanda(id: string): Demanda {
    const demanda = this.state.demandas[id];
    if (!demanda) throw new OrchestratorError('NOT_FOUND', 'Demanda não encontrada', 404);
    return structuredClone(demanda);
  }
  async transaction<T>(mutate: (state: EngineState) => T): Promise<T> {
    const next = this.writes.then(async () => {
      const state = structuredClone(this.state); const result = mutate(state);
      await this.store.save(state); this.state = state; return result;
    });
    this.writes = next.catch(() => undefined); return next;
  }
  async update(id: string, mutate: DemandMutation, para?: EstadoDemanda, motivo?: string, messageId?: string): Promise<Demanda> {
    const demanda = await this.transaction(state => {
      const demand = state.demandas[id];
      if (!demand) throw new OrchestratorError('NOT_FOUND', 'Demanda não encontrada', 404);
      mutate(demand, state);
      if (para) transition(demand, para, this.clock.now().toISOString(), motivo, messageId);
      else demand.updatedAt = this.clock.now().toISOString();
      state.demandas[id] = DemandaSchema.parse(demand); return structuredClone(demand);
    });
    this.emit({ type: 'demand.updated', payload: demanda }); return demanda;
  }
  emit(event: SseEvent): void {
    const envelope = SseEnvelopeSchema.parse({ ...event, id: `${this.epoch}:${++this.eventId}`, ts: this.clock.now().toISOString() });
    this.events.push(envelope); if (this.events.length > SSE_HISTORY_LIMIT) this.events.shift();
    for (const listener of this.listeners) { try { listener(structuredClone(envelope)); } catch { /* Consumidores isolados do motor. */ } }
  }
  log(level: 'info' | 'warn' | 'error', message: string, demandaId?: string, actorId?: ActorId): void {
    this.emit({ type: 'log', payload: { level, message, demandaId, actorId } });
  }
  status(actorId: ActorId, status: ActorStatus, demandaId: string | null): void { this.emit({ type: 'actor.status', payload: { actorId, status, demandaId } }); }
  subscribe(listener: (event: SseEnvelope) => void): () => void { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; }
  history(n: number): SseEnvelope[] { const count = Math.floor(n); return structuredClone(count > 0 ? this.events.slice(-count) : []); }
  envelope(message: Omit<InboxMessage, 'id' | 'createdAt'>): InboxMessage {
    return InboxMessageSchema.parse({ ...message, id: this.ids.next(), createdAt: this.clock.now().toISOString() });
  }
  async send(value: unknown): Promise<void> {
    if (!this.running) throw new OrchestratorError('INTERNAL_ERROR', 'Orquestrador não iniciado', 500);
    const message = InboxMessageSchema.parse(value);
    const accepted = await this.transaction(state => {
      if (state.processed.includes(message.id) || state.pending.includes(message.id)) return false;
      const demand = state.demandas[message.demandaId];
      if (!demand && message.action !== 'PREENCHER_ACERVO') throw new OrchestratorError('NOT_FOUND', 'Demanda não encontrada', 404);
      if (demand && message.hop <= this.maxHops) {
        const expected: Partial<Record<InboxMessage['action'], readonly EstadoDemanda[]>> = {
          DEMANDA_CLASSIFICADA: ['CLASSIFICADA', 'EM_PRODUCAO'], PRODUZIR_ARTE: ['EM_PRODUCAO'],
          ARTE_ENTREGUE: ['EM_PRODUCAO', 'EM_AJUSTE_IA', 'EM_REVISAO_DIRETOR'],
          AJUSTAR_ARTE: ['EM_PRODUCAO', 'EM_AJUSTE_IA'], FEEDBACK_HUMANO: ['AGUARDANDO_APROVACAO_AWR'],
        };
        if (expected[message.action] && !expected[message.action]!.includes(demand.estado)) throw new OrchestratorError('INVALID_TRANSITION', `Ação ${message.action} incompatível com ${demand.estado}`);
        if (message.action === 'AJUSTAR_ARTE') {
          const prior = state.messages.findLast(value => value.action === 'AJUSTAR_ARTE' && value.demandaId === demand.id && value.hop <= this.maxHops && value.payload.versaoAnterior === message.payload.versaoAnterior);
          const repeated = prior && message.causationId === prior.id;
          if (message.hop !== demand.hop + 1 && !(repeated && message.hop === demand.hop)) throw new OrchestratorError('INVALID_TRANSITION', 'Devolução exige incremento de hop');
          demand.hop = message.hop; demand.updatedAt = this.clock.now().toISOString();
        } else if (message.hop !== demand.hop && message.action !== 'PREENCHER_ACERVO') throw new OrchestratorError('INVALID_TRANSITION', 'Mensagem de avanço deve herdar o hop atual');
      }
      state.messages.push(message); state.pending.push(message.id); return true;
    });
    if (!accepted) return;
    this.emit({ type: 'message.sent', payload: message });
    if (message.action === 'AJUSTAR_ARTE' && message.hop <= this.maxHops) this.emit({ type: 'demand.updated', payload: this.getDemanda(message.demandaId) });
    if (await this.enforceHopLimit(message)) return;
    this.enqueue(message);
  }
  private async enforceHopLimit(message: InboxMessage): Promise<boolean> {
    if (message.hop <= this.maxHops) return false;
    const demanda = this.getDemanda(message.demandaId);
    if (demanda.estado !== 'APROVADA_SALVA_NO_ACERVO') {
      await this.update(demanda.id, d => { d.escalada = true; d.motivoEscalada = 'hop_limit'; }, demanda.estado === 'AGUARDANDO_APROVACAO_AWR' ? undefined : 'AGUARDANDO_APROVACAO_AWR', 'hop_limit', message.id);
    }
    await this.ack(message.id); this.log('warn', 'Devolução recusada: limite de hops excedido', message.demandaId); return true;
  }
  pausados(): ActorId[] { return [...this.state.pausados]; }
  /** Pausa/retoma um ator: pausado, nada novo sai da fila dele (as mensagens continuam pendentes e persistidas). */
  async definirPausa(actor: ActorId, pausado: boolean): Promise<ActorId[]> {
    await this.transaction(state => { state.pausados = pausado ? [...new Set([...state.pausados, actor])] : state.pausados.filter(id => id !== actor); });
    this.emit({ type: 'agentes.pausa', payload: { pausados: this.pausados() } });
    this.log('info', pausado ? `Agente pausado: ${actor} (a fila fica aguardando)` : `Agente retomado: ${actor}`, undefined, actor);
    if (!pausado) await this.resume();
    return this.pausados();
  }
  private enqueue(message: InboxMessage): void {
    if (this.jobs.has(message.id)) return;
    // Ator pausado: a mensagem fica pendente; retomar() reenfileira via resume().
    if (this.state.pausados.includes(message.to)) return;
    const job = (this.tails.get(message.to) ?? Promise.resolve()).then(async () => {
      if (this.state.processed.includes(message.id)) return;
      const handler = this.handlers.get(message.to);
      if (!handler) throw new Error(`Ator sem inbox: ${message.to}`);
      this.status(message.to, 'thinking', message.demandaId);
      try { await handler(message); await this.ack(message.id); }
      catch (error) {
        // Erros de domínio são rejeições definitivas; falhas de I/O ficam retomáveis.
        if (error instanceof OrchestratorError && error.status !== 500) await this.ack(message.id);
        throw error;
      }
      finally { this.status(message.to, 'idle', null); }
    });
    this.jobs.set(message.id, job);
    const handled = job.catch(error => { this.log('error', `Falha no inbox (${message.action}): ${error instanceof OrchestratorError ? error.message : 'processamento interrompido; consulte a configuração e tente novamente'}`, message.demandaId, message.to); });
    this.tails.set(message.to, handled);
    void handled.then(() => { this.jobs.delete(message.id); });
  }
  private async ack(id: string): Promise<void> {
    await this.transaction(state => { state.pending = state.pending.filter(value => value !== id); if (!state.processed.includes(id)) state.processed.push(id); });
  }
  async sendAndWait(message: InboxMessage): Promise<void> { await this.send(message); await this.jobs.get(message.id); }
  async resume(): Promise<void> {
    for (const message of this.state.messages) if (this.state.pending.includes(message.id) && !(await this.enforceHopLimit(message))) this.enqueue(message);
  }
  async whenIdle(): Promise<void> {
    while (this.jobs.size) await Promise.allSettled([...this.jobs.values()]);
    await this.writes;
  }
  async stop(): Promise<void> { await this.whenIdle(); this.running = false; }
}
