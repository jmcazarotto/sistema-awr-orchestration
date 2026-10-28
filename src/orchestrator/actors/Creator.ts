import type { CriadorId, InboxMessage } from '../../shared/types';
import type { BrainLoader } from '../brain/BrainLoader';
import type { EventBus } from '../core/EventBus';
import type { ImageEngine } from '../services/ImageEngine';
import { OrchestratorError } from '../core/errors';

export class Creator {
  constructor(readonly id: CriadorId, private readonly bus: EventBus, private readonly brain: BrainLoader, private readonly images: ImageEngine) {}
  async handle(message: InboxMessage): Promise<void> {
    if (message.action !== 'PRODUZIR_ARTE' && message.action !== 'AJUSTAR_ARTE') throw new OrchestratorError('INVALID_TRANSITION', 'Ação incompatível com criador');
    const demanda = this.bus.getDemanda(message.demandaId);
    if (!['EM_PRODUCAO', 'EM_AJUSTE_IA'].includes(demanda.estado)) return; // Ordem antiga após uma entrega já aceita.
    if (demanda.criadorAtual !== this.id || (this.id === 'monalisa' && demanda.origem !== 'acervo')) throw new OrchestratorError('INVALID_TRANSITION', 'Criador incompatível com a origem da demanda');
    await this.brain.loadAgent(this.id);
    this.bus.status(this.id, 'generating', demanda.id);
    const versao = message.action === 'AJUSTAR_ARTE' ? message.payload.versaoAnterior + 1 : 1;
    // Uma cobrança pode reencaminhar uma ordem cujo PNG já foi concluído.
    if (demanda.versaoAtual > versao) return;
    if (demanda.versaoAtual === versao && this.bus.snapshot().messages.some(value => value.demandaId === demanda.id && value.action === 'ARTE_ENTREGUE' && value.payload.versao === versao)) return;
    const result = await this.images.generate(demanda, versao, message.action === 'AJUSTAR_ARTE' ? message.payload.feedbackDiretor : undefined);
    await this.bus.update(demanda.id, demand => { demand.versaoAtual = versao; demand.stagingPath = result.path; });
    await this.bus.send(this.bus.envelope({ action: 'ARTE_ENTREGUE', from: this.id, to: 'art_director', demandaId: demanda.id, hop: demanda.hop,
      causationId: message.id, payload: { stagingPath: result.path, versao, promptUsado: result.meta.promptUsado, engine: result.meta.engine } }));
  }
}
