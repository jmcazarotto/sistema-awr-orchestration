import type { Demanda, EtapaProducao } from '../../shared/types';

export const ETAPAS_PASSOS = ['na_fila', 'planejando', 'gerando', 'compondo', 'entregue'] as const satisfies readonly EtapaProducao[];
export const ETAPAS_ATIVAS: readonly EtapaProducao[] = ['na_fila', 'planejando', 'gerando', 'compondo'];
const QUALIDADE: Record<string, string> = { low: 'Baixa', medium: 'Média', high: 'Alta', xhigh: 'Muito alta', max: 'Máxima' };
export const qualidadeLabel = (q: string | null | undefined) => q ? QUALIDADE[q] ?? q : null;

/** Posição (1-based) na fila de produção, ordenada por solicitadoEm; null se a demanda não está 'na_fila'. */
export function posicaoNaFila(demandas: readonly Demanda[], id: string): number | null {
  const fila = demandas.filter(d => d.producao?.etapa === 'na_fila').sort((a, b) => (a.producao!.solicitadoEm ?? a.updatedAt).localeCompare(b.producao!.solicitadoEm ?? b.updatedAt));
  const i = fila.findIndex(d => d.id === id);
  return i < 0 ? null : i + 1;
}
export const duracao = (ms: number) => { const s = Math.max(0, Math.floor(ms / 1000)); return s < 60 ? `${s}s` : `${Math.floor(s / 60)}min ${String(s % 60).padStart(2, '0')}s`; };
