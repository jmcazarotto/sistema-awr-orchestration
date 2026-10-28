import { PROCEDIMENTOS, TIPOS_TEMPLATE } from '../../shared/types';
import type { AcervoGrid, AcervoSlot, OrchestratorConfig, Procedimento, TipoTemplate } from '../../shared/types';
import type { AcervoStorage } from '../core/interfaces';
import type { EventBus } from '../core/EventBus';
import { allocateId } from '../core/demandaFactory';

export class AcervoWatcher {
  private cancelHeartbeat?: () => void;
  private closeWatch?: () => Promise<void>;
  private scans: Promise<void> = Promise.resolve();
  private changes: Promise<void> = Promise.resolve();
  private stopped = true;
  constructor(private readonly config: OrchestratorConfig, private readonly bus: EventBus, private readonly storage: AcervoStorage, private readonly watchFiles = true) {}
  async grid(): Promise<AcervoGrid> {
    const files = await this.storage.list(); const state = this.bus.snapshot();
    const slots: AcervoSlot[] = PROCEDIMENTOS.flatMap(procedimento => TIPOS_TEMPLATE.map(tipoTemplate => {
      const arquivos = files.filter(path => new RegExp(`^${procedimento}/${procedimento}__${tipoTemplate}__.*\\.png$`).test(path));
      const demand = Object.values(state.demandas).find(value => value.estado !== 'APROVADA_SALVA_NO_ACERVO' && value.classificacao?.procedimento === procedimento && value.classificacao.tipoTemplate === tipoTemplate);
      const reservation = state.messages.find(value => value.action === 'PREENCHER_ACERVO' && state.pending.includes(value.id) && value.payload.procedimento === procedimento && value.payload.tipoTemplate === tipoTemplate);
      return { procedimento, tipoTemplate, arquivos, preenchido: arquivos.length > 0, ...(demand || reservation ? { demandaAbertaId: demand?.id ?? reservation?.demandaId } : {}) };
    }));
    const preenchidos = slots.filter(slot => slot.preenchido).length;
    return { slots, total: 12, preenchidos, vazios: 12 - preenchidos, emProducao: slots.filter(slot => slot.demandaAbertaId).length };
  }
  fill(procedimento?: Procedimento, tipoTemplate?: TipoTemplate): Promise<void> {
    const work = this.scans.then(async () => {
      const grid = await this.grid();
      for (const slot of grid.slots) {
        if (slot.preenchido || slot.demandaAbertaId || (procedimento && slot.procedimento !== procedimento) || (tipoTemplate && slot.tipoTemplate !== tipoTemplate)) continue;
        const demandaId = await this.bus.transaction(state => allocateId(state));
        await this.bus.send(this.bus.envelope({ action: 'PREENCHER_ACERVO', from: 'acervo_watcher', to: 'art_director', demandaId, hop: 0, payload: { procedimento: slot.procedimento, tipoTemplate: slot.tipoTemplate } }));
      }
      this.bus.emit({ type: 'acervo.updated', payload: await this.grid() });
    });
    this.scans = work.catch(() => undefined); return work;
  }
  async heartbeat(): Promise<void> { if (!this.stopped && this.config.ACERVO_AUTOFILL) await this.fill(); }
  async start(): Promise<void> {
    if (!this.stopped) return;
    this.stopped = false;
    this.cancelHeartbeat = this.bus.clock.setInterval(() => this.heartbeat().catch(() => this.bus.log('error', 'Falha na varredura de acervo')), this.config.ACERVO_HEARTBEAT_MS);
    if (this.watchFiles && this.storage.watch) this.closeWatch = await this.storage.watch(() => { this.changes = this.changes.then(() => this.changed()); }, () => this.bus.log('error', 'Falha no monitor de arquivos do acervo'));
    await this.heartbeat();
  }
  private async changed(): Promise<void> {
    if (this.stopped) return;
    try { this.bus.emit({ type: 'acervo.updated', payload: await this.grid() }); await this.heartbeat(); }
    catch { this.bus.log('error', 'Falha ao atualizar grade do acervo'); }
  }
  async stop(): Promise<void> { this.stopped = true; this.cancelHeartbeat?.(); await this.closeWatch?.(); await this.changes; await this.scans; this.cancelHeartbeat = undefined; this.closeWatch = undefined; }
}
