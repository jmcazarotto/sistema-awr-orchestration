import { describe, expect, it } from 'vitest';
import type { Demanda } from '../../shared/types';
import { duracao, posicaoNaFila, qualidadeLabel } from './producao';

const d = (id: string, etapa: string, solicitadoEm: string) => ({ id, updatedAt: solicitadoEm, producao: { etapa, solicitadoEm } }) as unknown as Demanda;
describe('producao', () => {
  it('calcula a posição na fila por solicitadoEm', () => {
    const ds = [d('DEM-0001', 'na_fila', '2026-01-01T00:00:02Z'), d('DEM-0002', 'na_fila', '2026-01-01T00:00:01Z'), d('DEM-0003', 'gerando', '2026-01-01T00:00:00Z')];
    expect(posicaoNaFila(ds, 'DEM-0002')).toBe(1);
    expect(posicaoNaFila(ds, 'DEM-0001')).toBe(2);
    expect(posicaoNaFila(ds, 'DEM-0003')).toBeNull();
  });
  it('traduz qualidade e duração', () => {
    expect(qualidadeLabel('xhigh')).toBe('Muito alta');
    expect(qualidadeLabel(null)).toBeNull();
    expect(duracao(75_000)).toBe('1min 15s');
    expect(duracao(4000)).toBe('4s');
  });
});
