import { describe, expect, it } from 'vitest';
import { OrchestratorConfigSchema } from '../../shared/types';
import { EventBus } from '../core/EventBus';
import { FakeClock, NanoIdGenerator } from '../core/Clock';
import { MemoryStateStore } from '../core/MemoryStateStore';
import { IaRegistry } from './IaRegistry';

async function setup() {
  const store = new MemoryStateStore(); const bus = new EventBus(store, new FakeClock(), new NanoIdGenerator(), 5); await bus.hydrate();
  return { store, bus, ia: new IaRegistry(OrchestratorConfigSchema.parse({ USD_BRL: 5 }), bus) };
}

describe('IaRegistry', () => {
  it('defaults vêm do env e a escolha salva vira modelo/esforço da API', async () => {
    const { ia } = await setup();
    expect(ia.modelos().rubrica).toEqual({ modelo: 'gpt-6-luna', effort: null });
    expect(ia.modelos().triagem).toEqual({ modelo: 'simulado', effort: null });
    expect(ia.modelos().leitura_briefing).toEqual({ modelo: 'simulado', effort: null });
    expect(ia.modelos().feedback).toEqual({ modelo: 'gpt-6.1-terra', effort: 'medio' });
    await ia.salvarModelos({ ...ia.modelos(), feedback: { modelo: 'gpt-6.1-sol', effort: 'muito_alto' } });
    expect(ia.para('feedback')).toEqual({ modelo: 'gpt-6.1-sol', effort: 'xhigh' });
    expect(ia.para('rubrica')).toEqual({ modelo: 'gpt-6-luna' });
  });
  it('recusa modelo fora da situação e esforço não suportado', async () => {
    const { ia } = await setup();
    await expect(ia.salvarModelos({ ...ia.modelos(), triagem: { modelo: 'gpt-6.1-sol', effort: null } })).rejects.toThrow();
    await expect(ia.salvarModelos({ ...ia.modelos(), rubrica: { modelo: 'gpt-6-luna', effort: 'alto' } })).rejects.toThrow();
    // Decisions não escreve texto: não pode assumir rubrica nem feedback.
    await expect(ia.salvarModelos({ ...ia.modelos(), rubrica: { modelo: 'gpt-6-luna-decisions', effort: null } })).rejects.toThrow();
    await expect(ia.salvarModelos({ ...ia.modelos(), leitura_briefing: { modelo: 'jev-latest', effort: null } })).rejects.toThrow();
  });
  it('acumula chamadas, tokens e custo em dólar e real; Jev e Decisions sempre listados', async () => {
    const { ia, store, bus } = await setup();
    expect(ia.uso().itens.map(i => i.modelo)).toEqual(['jev-latest', 'gpt-6-luna-decisions', 'gpt-image-2', 'gpt-image-2.5-flare', 'gpt-image-2.5-sunburst']);
    await ia.registrar({ modelo: 'jev-latest', provedor: 'jev', tokensEntrada: 1000, usd: 0.000042 });
    await ia.registrar({ modelo: 'gpt-6-luna-decisions', tokensEntrada: 2_000_000 });
    await ia.registrar({ modelo: 'gpt-6.1-terra', tokensEntrada: 500, tokensSaida: 100 });
    const uso = ia.uso();
    expect(uso.itens.find(i => i.provedor === 'openai_decisions')).toMatchObject({ chamadas: 1, usd: 0.2, brl: 1 });
    expect(uso.itens.find(i => i.modelo === 'gpt-6.1-terra')).toMatchObject({ chamadas: 1, precificado: false });
    expect(uso.total.chamadas).toBe(3);
    expect(uso.total.brl).toBeCloseTo(uso.total.usd * 5);
    expect((await store.load()).ia.uso['jev:jev-latest']?.chamadas).toBe(1);
    expect(bus.snapshot().ia.usoDesde).not.toBeNull();
    expect((await ia.zerarUso()).total.chamadas).toBe(0);
  });
});
