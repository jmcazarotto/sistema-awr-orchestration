import { DemandaIdSchema, FeedbackHumanoSchema, FillAcervoRequestSchema, MessagesFilterSchema, OrchestratorConfigSchema, SubmitDemandInputSchema } from '../shared/types';
import type { Demanda, FeedbackHumano, Orchestrator, OrchestratorConfig, SubmitDemandInput } from '../shared/types';
import { EventBus } from './core/EventBus';
import { FileStateStore } from './core/FileStateStore';
import { FsAcervoStorage } from './core/FsAcervoStorage';
import { NanoIdGenerator, SystemClock } from './core/Clock';
import type { AcervoStorage, Clock, IdGenerator, StateStore } from './core/interfaces';
import { allocateId, createDemanda } from './core/demandaFactory';
import { OrchestratorError } from './core/errors';
import { BrainLoader } from './brain/BrainLoader';
import { AiClient } from './services/AiClient';
import { TriagemService } from './services/TriagemService';
import { JevClient } from './services/JevClient';
import { FastClassifier } from './services/FastClassifier';
import { ImageEngine } from './services/ImageEngine';
import { VisionReviewer } from './services/VisionReviewer';
import type { ReviewerOptions } from './services/VisionReviewer';
import { AcervoWatcher } from './services/AcervoWatcher';
import { ArtDirector } from './actors/ArtDirector';
import { VanGogh } from './actors/VanGogh';
import { Monalisa } from './actors/Monalisa';
import { extractBriefingText } from './services/briefingText';

export { BrainLoader } from './brain/BrainLoader';
export { EventBus } from './core/EventBus';
export { OrchestratorError } from './core/errors';
export { FileStateStore } from './core/FileStateStore';
export { MemoryStateStore } from './core/MemoryStateStore';
export { FsAcervoStorage } from './core/FsAcervoStorage';
export { MemoryAcervoStorage } from './core/MemoryAcervoStorage';
export { FakeClock, SystemClock, NanoIdGenerator } from './core/Clock';
export type { StateStore, AcervoStorage, Clock, IdGenerator } from './core/interfaces';

export interface OrchestratorDependencies extends ReviewerOptions {
  stateStore?: StateStore; storage?: AcervoStorage; clock?: Clock; ids?: IdGenerator;
  watchFiles?: boolean; apiKey?: string; jevApiKey?: string; fetch?: typeof fetch;
}
export function createOrchestrator(config: OrchestratorConfig): Orchestrator { return createOrchestratorWithDependencies(config); }
/** Ponto de composição para testes e adapters Fase 2; a interface pública permanece Orchestrator. */
export function createOrchestratorWithDependencies(input: OrchestratorConfig, dependencies: OrchestratorDependencies = {}): Orchestrator {
  const config = OrchestratorConfigSchema.parse(input);
  const clock = dependencies.clock ?? new SystemClock();
  const storage = dependencies.storage ?? new FsAcervoStorage(config.ACERVO_DIR);
  const bus = new EventBus(dependencies.stateStore ?? new FileStateStore(config.DATA_DIR), clock, dependencies.ids ?? new NanoIdGenerator(), config.MAX_HOPS);
  const ai = config.AI_MODE === 'openai' || config.IMAGE_ENGINE_MODE === 'openai' ? new AiClient(config, bus, dependencies.apiKey ?? process.env.OPENAI_API_KEY) : undefined;
  const brain = new BrainLoader(config.BRAIN_DIR, clock, bus, config.AI_MODE === 'openai' ? ai : undefined);
  const jevKey = dependencies.jevApiKey ?? process.env.JEV_API_KEY;
  const triagem = new TriagemService(config, bus, jevKey ? new JevClient(config, jevKey, { fetch: dependencies.fetch }) : undefined);
  const classifier = new FastClassifier(config, ai, triagem);
  const images = new ImageEngine(config, storage, brain, clock, ai);
  const reviewer = new VisionReviewer(config, storage, brain, ai, dependencies);
  const watcher = new AcervoWatcher(config, bus, storage, dependencies.watchFiles);
  const director = new ArtDirector(config, bus, brain, classifier, reviewer, storage, () => watcher.grid());
  const vanGogh = new VanGogh(bus, brain, images); const monalisa = new Monalisa(bus, brain, images);
  bus.register('art_director', message => director.handle(message));
  bus.register('van_gogh', message => vanGogh.handle(message));
  bus.register('monalisa', message => monalisa.handle(message));
  let started = false; let startup: Promise<void> | undefined; let cancelDirector: (() => void) | undefined;
  const requireStarted = () => { if (!started) throw new OrchestratorError('INTERNAL_ERROR', 'Orquestrador não iniciado', 500); };
  async function classify(demanda: Demanda, input: SubmitDemandInput): Promise<Demanda> {
    let classification;
    try { classification = await classifier.classify(input); }
    catch (error) { bus.log('error', error instanceof Error && error.message.includes('Jev') ? error.message : 'Falha na classificação de demanda', demanda.id); throw error; }
    const classified = await bus.update(demanda.id, demand => { demand.classificacao = classification; demand.criadorAtual = 'van_gogh'; if (input.clinicaNome) demand.clinicaNome = input.clinicaNome; }, 'CLASSIFICADA');
    await bus.send(bus.envelope({ action: 'DEMANDA_CLASSIFICADA', from: 'system', to: 'art_director', demandaId: demanda.id, hop: classified.hop, payload: { classificacao: classification } }));
    return bus.getDemanda(demanda.id);
  }
  async function recover(): Promise<void> {
    const state = bus.snapshot();
    for (const demanda of Object.values(state.demandas)) {
      if (state.messages.some(message => message.demandaId === demanda.id && state.pending.includes(message.id))) continue;
      if (demanda.estado === 'CRIADA' && demanda.origem === 'cliente') { await classify(demanda, state.inputs[demanda.id] ?? { briefing: demanda.briefing }); continue; }
      if (demanda.estado === 'CLASSIFICADA' && demanda.origem === 'cliente' && demanda.classificacao) {
        await bus.send(bus.envelope({ action: 'DEMANDA_CLASSIFICADA', from: 'system', to: 'art_director', demandaId: demanda.id, hop: demanda.hop, payload: { classificacao: demanda.classificacao } })); continue;
      }
      if (demanda.origem === 'acervo' && ['CRIADA', 'CLASSIFICADA', 'EM_PRODUCAO'].includes(demanda.estado)) {
        const fill = state.messages.findLast(message => message.demandaId === demanda.id && message.action === 'PREENCHER_ACERVO');
        if (fill && (!demanda.classificacao || demanda.versaoAtual === 0)) { await bus.send(bus.envelope({ ...fill, causationId: fill.id })); continue; }
      }
      if (demanda.estado === 'REPROVADA_HUMANO') {
        const feedback = state.messages.findLast(message => message.demandaId === demanda.id && message.action === 'FEEDBACK_HUMANO' && message.payload.decisao === 'ajustar');
        // A transição guarda a id original para continuar sem reaplicar aprendizado.
        if (feedback) { await bus.transaction(current => { current.processed = current.processed.filter(id => id !== feedback.id); if (!current.pending.includes(feedback.id)) current.pending.push(feedback.id); }); await bus.resume(); continue; }
      }
      if (['EM_PRODUCAO', 'EM_AJUSTE_IA', 'EM_REVISAO_DIRETOR', 'REPROVADA_HUMANO'].includes(demanda.estado)) {
        const lastOrder = state.messages.findLast(message => message.demandaId === demanda.id && (message.action === 'PRODUZIR_ARTE' || message.action === 'AJUSTAR_ARTE' || message.action === 'ARTE_ENTREGUE'));
        if (lastOrder) await bus.send(bus.envelope({ ...lastOrder, causationId: lastOrder.id }));
      }
    }
  }
  return {
    bus, get config() { return structuredClone(config); },
    async start() {
      if (startup) return startup;
      if (started) return;
      startup = (async () => {
        await storage.initialize(); await bus.hydrate();
        await Promise.all(['art_director', 'van_gogh', 'monalisa'].map(actor => brain.loadAgent(actor as 'art_director' | 'van_gogh' | 'monalisa')));
        started = true; await bus.resume(); await recover(); await watcher.start();
        cancelDirector = clock.setInterval(() => director.tick().catch(() => bus.log('error', 'Falha no scheduler do Diretor')), config.DIRECTOR_TICK_MS);
      })();
      try { await startup; } catch (error) { started = false; await watcher.stop(); await bus.stop(); throw error; } finally { startup = undefined; }
    },
    async stop() { if (startup) await startup; cancelDirector?.(); cancelDirector = undefined; await watcher.stop(); await bus.stop(); started = false; },
    async triar(texto) { requireStarted(); return triagem.triar(texto); },
    async submitDemand(value) {
      requireStarted(); const input = extractBriefingText(SubmitDemandInputSchema.parse(value));
      const demanda = await bus.transaction(state => { const demand = createDemanda(allocateId(state), 'cliente', input, clock.now().toISOString()); state.demandas[demand.id] = demand; state.inputs[demand.id] = input; return structuredClone(demand); });
      bus.emit({ type: 'demand.updated', payload: demanda }); return classify(demanda, input);
    },
    async humanReview(id: string, input: FeedbackHumano) {
      requireStarted(); DemandaIdSchema.parse(id); const feedback = FeedbackHumanoSchema.parse(input); const demanda = bus.getDemanda(id);
      if (demanda.estado !== 'AGUARDANDO_APROVACAO_AWR') throw new OrchestratorError('INVALID_TRANSITION', 'A demanda não aguarda aprovação AWR');
      if (feedback.decisao === 'ajustar' && demanda.motivoEscalada === 'hop_limit') throw new OrchestratorError('HOP_LIMIT', 'Reinicie os hops antes de solicitar outro ajuste');
      await bus.sendAndWait(bus.envelope({ action: 'FEEDBACK_HUMANO', from: 'awr_human', to: 'art_director', demandaId: id, hop: demanda.hop, payload: feedback }));
      return bus.getDemanda(id);
    },
    async resetHops(id) {
      requireStarted(); DemandaIdSchema.parse(id);
      return bus.update(id, demand => {
        if (demand.estado !== 'AGUARDANDO_APROVACAO_AWR') throw new OrchestratorError('INVALID_TRANSITION', 'A demanda não aguarda aprovação AWR');
        demand.hop = 0; if (demand.motivoEscalada === 'hop_limit') { demand.escalada = false; delete demand.motivoEscalada; }
      });
    },
    listDemandas: () => Object.values(bus.snapshot().demandas),
    getDemanda: id => bus.snapshot().demandas[id],
    listMessages: filtro => { const filter = MessagesFilterSchema.parse(filtro ?? {}); return bus.snapshot().messages.filter(message => !filter.demandaId || message.demandaId === filter.demandaId); },
    acervo: { grid: () => watcher.grid(), fill: (procedimento, tipoTemplate) => { requireStarted(); FillAcervoRequestSchema.parse({ procedimento, tipoTemplate }); return watcher.fill(procedimento, tipoTemplate); } },
  };
}
