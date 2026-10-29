import { ArteMetaSchema, ClassificacaoSchema, skillPath } from '../../shared/types';
import type { AcervoGrid, Demanda, InboxMessage, OrchestratorConfig } from '../../shared/types';
import type { BrainLoader } from '../brain/BrainLoader';
import type { EventBus } from '../core/EventBus';
import type { AcervoStorage } from '../core/interfaces';
import { createDemanda } from '../core/demandaFactory';
import { OrchestratorError } from '../core/errors';
import type { FastClassifier } from '../services/FastClassifier';
import type { VisionReviewer } from '../services/VisionReviewer';
import { metaPath } from '../services/ImageEngine';

export class ArtDirector {
  constructor(private readonly config: OrchestratorConfig, private readonly bus: EventBus, private readonly brain: BrainLoader,
    private readonly classifier: FastClassifier, private readonly reviewer: VisionReviewer, private readonly storage: AcervoStorage,
    private readonly grid: () => Promise<AcervoGrid>, private readonly modeloImagem: () => { modelo: string; qualidade: string | null } = () => ({ modelo: 'simulado', qualidade: null })) {}
  async handle(message: InboxMessage): Promise<void> {
    await this.brain.loadAgent('art_director');
    switch (message.action) {
      case 'DEMANDA_CLASSIFICADA': await this.dispatch(message); break;
      case 'PREENCHER_ACERVO': await this.fill(message); break;
      case 'ARTE_ENTREGUE': await this.review(message); break;
      case 'FEEDBACK_HUMANO': await this.humanReview(message); break;
      default: throw new OrchestratorError('INVALID_TRANSITION', 'Ação incompatível com Diretor de Arte');
    }
  }
  private async dispatch(message: InboxMessage<'DEMANDA_CLASSIFICADA'>): Promise<void> {
    let demanda = this.bus.getDemanda(message.demandaId);
    if (demanda.estado === 'EM_PRODUCAO' && demanda.versaoAtual === 0) { await this.produce(demanda, message.id); return; }
    if (demanda.estado !== 'CLASSIFICADA') return;
    let classificacao = message.payload.classificacao;
    if (classificacao.confianca < 0.6) {
      classificacao = await this.classifier.classify(this.bus.snapshot().inputs[demanda.id] ?? { briefing: demanda.briefing });
      this.bus.log('info', 'Triagem com baixa confiança revisada pelo Diretor', demanda.id, 'art_director');
    }
    await this.brain.loadSkill(classificacao.procedimento);
    // Demanda de cliente espera o clique em "Produzir" (AGENTS.md §3): fica CLASSIFICADA com produção 'aguardando'.
    if (classificacao.agenteDesignado === 'van_gogh' && this.config.PRODUCAO_MANUAL_VAN_GOGH) {
      if (demanda.producao?.etapa === 'aguardando') return;
      const agora = this.bus.clock.now().toISOString(); const final = classificacao;
      await this.bus.update(demanda.id, demand => { demand.classificacao = final; demand.criadorAtual = 'van_gogh'; demand.producao = { ...this.modeloImagem(), etapa: 'aguardando', versao: 0, etapas: [{ etapa: 'aguardando', em: agora }] }; }, undefined, undefined, message.id);
      this.bus.log('info', 'Demanda classificada para o Van Gogh; aguardando o clique em Produzir', demanda.id, 'art_director');
      return;
    }
    demanda = await this.bus.update(demanda.id, demand => { demand.classificacao = classificacao; demand.criadorAtual = classificacao.agenteDesignado; if (classificacao.agenteDesignado === 'monalisa') demand.origem = 'acervo'; }, 'EM_PRODUCAO', undefined, message.id);
    await this.produce(demanda, message.id);
  }
  private async produce(demanda: Demanda, causationId?: string): Promise<void> {
    const classification = demanda.classificacao;
    if (!classification || !demanda.criadorAtual) throw new Error('Demanda sem classificação');
    await this.bus.send(this.bus.envelope({ action: 'PRODUZIR_ARTE', from: 'art_director', to: demanda.criadorAtual, demandaId: demanda.id,
      hop: demanda.hop, causationId, payload: { procedimento: classification.procedimento, tipoTemplate: classification.tipoTemplate, skillFile: classification.skillFile, briefing: demanda.briefing } }));
  }
  private async fill(message: InboxMessage<'PREENCHER_ACERVO'>): Promise<void> {
    const { procedimento, tipoTemplate } = message.payload;
    const slot = (await this.grid()).slots.find(value => value.procedimento === procedimento && value.tipoTemplate === tipoTemplate);
    if (slot?.preenchido || (slot?.demandaAbertaId && slot.demandaAbertaId !== message.demandaId)) return;
    const existing = this.bus.snapshot().demandas[message.demandaId];
    if (existing && !['CRIADA', 'CLASSIFICADA', 'EM_PRODUCAO'].includes(existing.estado)) return;
    const classification = ClassificacaoSchema.parse({ procedimento, tipoTemplate, agenteDesignado: 'monalisa', skillFile: skillPath(procedimento), confianca: 1 });
    if (!existing) await this.bus.transaction(state => { state.demandas[message.demandaId] = createDemanda(message.demandaId, 'acervo', { briefing: 'Peça de acervo institucional AWR — genérica, reutilizável' }, this.bus.clock.now().toISOString()); });
    if (!existing || existing.estado === 'CRIADA') await this.bus.update(message.demandaId, demand => { demand.classificacao = classification; demand.criadorAtual = 'monalisa'; }, 'CLASSIFICADA', undefined, message.id);
    const demanda = this.bus.getDemanda(message.demandaId).estado === 'CLASSIFICADA'
      ? await this.bus.update(message.demandaId, () => undefined, 'EM_PRODUCAO', undefined, message.id)
      : this.bus.getDemanda(message.demandaId);
    await this.produce(demanda, message.id);
  }
  private async review(message: InboxMessage<'ARTE_ENTREGUE'>): Promise<void> {
    let demanda = this.bus.getDemanda(message.demandaId);
    if (!['EM_PRODUCAO', 'EM_AJUSTE_IA', 'EM_REVISAO_DIRETOR'].includes(demanda.estado) || message.payload.versao !== demanda.versaoAtual) return;
    if (message.from !== demanda.criadorAtual) throw new OrchestratorError('INVALID_TRANSITION', 'Entrega de criador incompatível');
    const reviewKey = `${demanda.id}:v${message.payload.versao}`;
    const recorded = this.bus.snapshot().reviews[reviewKey];
    if (recorded && demanda.estado === 'EM_AJUSTE_IA') { await this.adjust(demanda, recorded.review.feedback, message.id); return; }
    if (demanda.estado !== 'EM_REVISAO_DIRETOR') demanda = await this.bus.update(demanda.id, () => undefined, 'EM_REVISAO_DIRETOR', undefined, message.id);
    this.bus.status('art_director', 'reviewing', demanda.id);
    const review = recorded?.review ?? await this.reviewer.review(demanda, message.payload.stagingPath, message.payload.versao);
    if (!recorded) demanda = await this.bus.update(demanda.id, (demand, state) => {
      demand.ultimoReview = review; demand.tentativaDiretor++;
      state.reviews[reviewKey] = { review, tentativa: demand.tentativaDiretor }; delete state.reminders[demand.id];
      const best = state.best[demand.id];
      if (!best || review.score > best.review.score) state.best[demand.id] = { path: message.payload.stagingPath, versao: message.payload.versao, review };
    });
    this.bus.emit({ type: 'review.result', payload: { demandaId: demanda.id, versao: message.payload.versao, tentativaDiretor: demanda.tentativaDiretor, review } });
    if (review.aprovada) {
      await this.bus.update(demanda.id, demand => { demand.escalada = false; delete demand.motivoEscalada; }, 'AGUARDANDO_APROVACAO_AWR', undefined, message.id);
    } else if (demanda.tentativaDiretor >= this.config.MAX_DIRECTOR_ATTEMPTS) {
      const best = this.bus.snapshot().best[demanda.id];
      await this.bus.update(demanda.id, demand => { demand.escalada = true; demand.motivoEscalada = 'director_attempts'; if (best) { demand.stagingPath = best.path; demand.ultimoReview = best.review; } }, 'AGUARDANDO_APROVACAO_AWR', undefined, message.id);
      this.bus.log('warn', `Limite de revisões atingido; melhor versão ${best?.versao ?? message.payload.versao} encaminhada à AWR`, demanda.id, 'art_director');
    } else {
      demanda = await this.bus.update(demanda.id, () => undefined, 'EM_AJUSTE_IA', undefined, message.id);
      await this.adjust(demanda, review.feedback, message.id);
    }
  }
  private async adjust(demanda: Demanda, feedback: NonNullable<Demanda['ultimoReview']>['feedback'], causationId: string): Promise<void> {
    if (!demanda.criadorAtual) throw new Error('Demanda sem criador');
    const snapshot = this.bus.snapshot();
    const existing = snapshot.messages.find(message => message.demandaId === demanda.id && message.action === 'AJUSTAR_ARTE' && message.payload.versaoAnterior === demanda.versaoAtual && message.hop <= this.config.MAX_HOPS && (message.causationId === causationId || snapshot.pending.includes(message.id)));
    if (existing) return;
    // A atualização de hop acontece no mesmo commit de persistência da ordem (EventBus).
    const hop = demanda.hop + 1;
    await this.bus.send(this.bus.envelope({ action: 'AJUSTAR_ARTE', from: 'art_director', to: demanda.criadorAtual, demandaId: demanda.id, hop,
      causationId, payload: { feedbackDiretor: feedback, versaoAnterior: demanda.versaoAtual } }));
  }
  private async humanReview(message: InboxMessage<'FEEDBACK_HUMANO'>): Promise<void> {
    let demanda = this.bus.getDemanda(message.demandaId);
    const continuing = demanda.historico.some(entry => entry.messageId === message.id && entry.para === 'REPROVADA_HUMANO');
    if (continuing && !['REPROVADA_HUMANO', 'EM_PRODUCAO'].includes(demanda.estado)) return;
    if (demanda.estado === 'APROVADA_SALVA_NO_ACERVO' && demanda.historico.some(entry => entry.messageId === message.id && entry.para === 'APROVADA_SALVA_NO_ACERVO')) return;
    if (demanda.estado !== 'AGUARDANDO_APROVACAO_AWR' && !continuing) throw new OrchestratorError('INVALID_TRANSITION', 'A demanda não aguarda aprovação AWR');
    const classification = demanda.classificacao;
    if (!classification || !demanda.stagingPath) throw new OrchestratorError('INVALID_TRANSITION', 'A demanda não tem arte para revisar');
    if (message.payload.decisao === 'aprovar') {
      const finalPath = `${classification.procedimento}/${classification.procedimento}__${classification.tipoTemplate}__${demanda.id}.png`;
      // Pode haver restart entre os dois movimentos; confirmar destino torna a retomada idempotente.
      const files = await this.storage.list();
      if (!files.includes(finalPath)) await this.storage.move(demanda.stagingPath, finalPath);
      if (!files.includes(metaPath(finalPath))) await this.storage.move(metaPath(demanda.stagingPath), metaPath(finalPath));
      ArteMetaSchema.parse(JSON.parse((await this.storage.read(metaPath(finalPath))).toString('utf8')));
      await this.bus.update(demanda.id, demand => { demand.finalPath = finalPath; }, 'APROVADA_SALVA_NO_ACERVO', undefined, message.id);
      this.bus.emit({ type: 'acervo.updated', payload: await this.grid() });
      return;
    }
    if (demanda.motivoEscalada === 'hop_limit') throw new OrchestratorError('HOP_LIMIT', 'Reinicie os hops antes de solicitar outro ajuste');
    let learning = this.bus.snapshot().learningByMessage[message.id];
    if (!learning) {
      const context = await this.brain.loadSkill(classification.procedimento);
      const alreadyLinked = new Set(Object.values(this.bus.snapshot().learningByMessage).map(value => `${value.procedimento}:${value.id}`));
      learning = context.aprendizados.find(value => value.demandaId === demanda.id && value.motivoOriginal === message.payload.motivo && !alreadyLinked.has(`${value.procedimento}:${value.id}`));
      if (!learning) {
        const regra = await this.brain.distillLearning(message.payload.motivo, classification.tipoTemplate);
        learning = await this.brain.appendLearning({ procedimento: classification.procedimento, template: classification.tipoTemplate, regra, motivoOriginal: message.payload.motivo, demandaId: demanda.id });
      }
      const savedLearning = learning;
      await this.bus.transaction(state => { state.learningByMessage[message.id] = savedLearning; });
    }
    if (!continuing) demanda = await this.bus.update(demanda.id, (demand, state) => { demand.tentativaDiretor = 0; demand.escalada = false; delete demand.motivoEscalada; delete state.best[demand.id]; delete state.reminders[demand.id]; }, 'REPROVADA_HUMANO', undefined, message.id);
    if (demanda.estado === 'REPROVADA_HUMANO') demanda = await this.bus.update(demanda.id, () => undefined, 'EM_PRODUCAO', undefined, message.id);
    if (demanda.estado === 'EM_PRODUCAO') await this.adjust(demanda, { resumo: message.payload.motivo, correcoes: [{ itemId: learning.id, instrucao: learning.regra }] }, message.id);
  }
  async tick(): Promise<void> {
    for (const demanda of Object.values(this.bus.snapshot().demandas)) {
      // Erro de geração espera o humano; imagem real (OpenAI) pode levar minutos na fila → prazo maior antes de cobrar.
      if (demanda.producao?.etapa === 'erro') continue;
      if (demanda.criadorAtual && this.bus.pausados().includes(demanda.criadorAtual)) continue; // pausado: espera retomar
      const prazo = demanda.producao && demanda.producao.modelo !== 'simulado' ? Math.max(this.config.PRODUCTION_TIMEOUT_MS, 600000) : this.config.PRODUCTION_TIMEOUT_MS;
      if (!['EM_PRODUCAO', 'EM_AJUSTE_IA'].includes(demanda.estado) || this.bus.clock.now().getTime() - Date.parse(demanda.updatedAt) < prazo) continue;
      const count = this.bus.snapshot().reminders[demanda.id] ?? 0;
      if (count >= 2) continue;
      await this.bus.transaction(state => { state.reminders[demanda.id] = count + 1; });
      if (count === 1) { this.bus.log('error', 'Produção sem resposta após uma cobrança', demanda.id, 'art_director'); continue; }
      const order = this.bus.snapshot().messages.findLast(value => value.demandaId === demanda.id && (value.action === 'PRODUZIR_ARTE' || value.action === 'AJUSTAR_ARTE'));
      if (order) { this.bus.log('warn', 'Produção atrasada; reenviando ordem uma vez', demanda.id, 'art_director'); await this.bus.send(this.bus.envelope({ ...order, causationId: order.id })); }
    }
  }
}
