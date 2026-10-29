import type { CriadorId, Demanda, EtapaProducao, InboxMessage } from '../../shared/types';
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
    // Etapas visíveis na UI (fila → planejando → gerando → compondo → entregue). Nova versão reinicia a trilha.
    const escolhido = this.images.modeloImagem(this.id);
    await this.bus.update(demanda.id, demand => {
      const anterior = demand.producao;
      const nova = !anterior || anterior.versao !== versao && anterior.etapa !== 'na_fila';
      demand.producao = { ...(anterior ?? { etapas: [] }), ...escolhido, versao, etapa: 'na_fila', etapas: nova ? [{ etapa: 'na_fila', em: message.createdAt }] : anterior?.etapas ?? [] };
      delete demand.producao.erro; delete demand.producao.custo;
    });
    const etapa = async (nome: EtapaProducao, detalhe?: string) => { await this.marcar(demanda.id, nome, detalhe); };
    let result: Awaited<ReturnType<ImageEngine['generate']>>;
    try { result = await this.images.generate(this.bus.getDemanda(demanda.id), versao, message.action === 'AJUSTAR_ARTE' ? message.payload.feedbackDiretor : undefined, etapa); }
    catch (error) {
      const motivo = error instanceof Error ? error.message : 'Falha desconhecida na geração';
      await this.bus.update(demanda.id, demand => { if (demand.producao) { demand.producao.etapa = 'erro'; demand.producao.erro = motivo; demand.producao.etapas.push({ etapa: 'erro', em: this.bus.clock.now().toISOString(), detalhe: motivo }); } });
      // Erro de domínio (4xx/502) é reconhecido no inbox: sem nova tentativa paga automática; o humano decide em "Tentar novamente".
      throw new OrchestratorError(error instanceof OrchestratorError && error.status < 500 ? error.code : 'UPSTREAM_ERROR', `Geração da arte falhou: ${motivo}`, error instanceof OrchestratorError && error.status < 500 ? error.status : 502);
    }
    const { custo } = result.imagem;
    await this.bus.update(demanda.id, demand => {
      demand.versaoAtual = versao; demand.stagingPath = result.path;
      if (demand.producao) { demand.producao.modelo = result.imagem.modelo; demand.producao.qualidade = result.imagem.qualidade; if (custo) demand.producao.custo = { ...custo, brl: custo.usd * this.images.usdBrl }; }
    });
    await this.bus.send(this.bus.envelope({ action: 'ARTE_ENTREGUE', from: this.id, to: 'art_director', demandaId: demanda.id, hop: demanda.hop,
      causationId: message.id, payload: { stagingPath: result.path, versao, promptUsado: result.meta.promptUsado, engine: result.meta.engine } }));
    await etapa('entregue', `Versão ${versao} enviada ao Diretor de Arte para revisão`);
  }
  private async marcar(id: string, etapa: EtapaProducao, detalhe?: string): Promise<Demanda> {
    return this.bus.update(id, demand => { if (demand.producao) { demand.producao.etapa = etapa; demand.producao.etapas.push({ etapa, em: this.bus.clock.now().toISOString(), ...(detalhe ? { detalhe } : {}) }); } });
  }
}
