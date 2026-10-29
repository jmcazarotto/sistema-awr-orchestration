import { describe, expect, it } from 'vitest';
import { SIM_STEPS, TRAVEL_MS, WORK_MS, simView } from './simulation';

describe('simulação do painel', () => {
  it('cobre os fluxos do Van Gogh e da Monalisa e termina com a arte salva', () => {
    const agents = new Set(SIM_STEPS.map(s => s.agent));
    expect([...agents]).toEqual(['van_gogh', 'monalisa']);
    expect(SIM_STEPS.some(s => s.pulse?.from === 'acervo_watcher')).toBe(true);
    expect(SIM_STEPS.some(s => s.pulse?.to === 'van_gogh')).toBe(true);
    expect(SIM_STEPS.some(s => s.pulse?.to === 'monalisa')).toBe(true);
    expect(SIM_STEPS.every(s => s.ms > 0)).toBe(true);
  });
  it('bolinha dura 1s entre agentes, agentes processam ~2s e há pop-ups de aprovação, reprovação e conclusão', () => {
    expect(SIM_STEPS.filter(s => s.pulse).every(s => s.ms === TRAVEL_MS)).toBe(true);
    expect(SIM_STEPS.filter(s => !s.pulse && Object.keys(s.actors).length).every(s => s.ms === WORK_MS)).toBe(true);
    const toasts = SIM_STEPS.flatMap(s => s.toast ?? []);
    expect(toasts.filter(t => t === 'Arte concluída!')).toHaveLength(4);
    expect(toasts.filter(t => t === 'Arte reprovada · ajuste pedido')).toHaveLength(2);
    expect(toasts.filter(t => t === 'Arte aprovada pelo Diretor')).toHaveLength(4);
  });
  it('revezia aprovação de primeira e reprovação com devolução ao agente', () => {
    const byDemand = (d: string) => SIM_STEPS.filter(s => s.demand === d);
    expect(byDemand('SIM-0001').some(s => s.toast?.includes('reprovada'))).toBe(false);
    const rejected = byDemand('SIM-0002'); const i = rejected.findIndex(s => s.toast?.includes('reprovada'));
    expect(rejected[i]!.pulse).toEqual({ from: 'art_director', to: 'monalisa' });
    expect(rejected[i + 1]!.actors.monalisa).toBe('generating');
    expect(byDemand('SIM-0003').some(s => s.toast?.includes('reprovada'))).toBe(true);
    expect(byDemand('SIM-0004').some(s => s.toast?.includes('reprovada'))).toBe(false);
  });
  it('projeta o passo em atores e dá a volta no roteiro', () => {
    const v = simView(SIM_STEPS, 2, 7);
    expect(v.actors.van_gogh).toEqual({ status: 'generating', demandaId: 'SIM-0001' });
    expect(v.actors.monalisa).toEqual({ status: 'idle', demandaId: null });
    expect(simView(SIM_STEPS, SIM_STEPS.length, 0).step).toBe(1);
    expect(simView(SIM_STEPS, 1, 9).pulse).toEqual({ id: 'sim-9', from: 'art_director', to: 'van_gogh' });
  });
});
