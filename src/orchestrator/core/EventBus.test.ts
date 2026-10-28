import { describe, expect, it } from 'vitest';
import { createDemanda } from './demandaFactory';
import { transition } from './demandaState';
import { EventBus } from './EventBus';
import { FakeClock, NanoIdGenerator } from './Clock';
import { MemoryStateStore } from './MemoryStateStore';
import { SseEnvelopeSchema } from '../../shared/types';

async function setup(maxHops = 5) {
  const clock = new FakeClock(); const store = new MemoryStateStore(); const bus = new EventBus(store, clock, new NanoIdGenerator(), maxHops);
  await bus.hydrate();
  await bus.transaction(state => { state.demandas['DEM-0001'] = createDemanda('DEM-0001', 'cliente', { briefing: 'botox' }, clock.now().toISOString()); });
  return { bus, clock, store };
}
describe('máquina de estados e EventBus', () => {
  it('rejeita transições inválidas sem mutar estado ou histórico', async () => {
    const { bus } = await setup();
    await expect(bus.update('DEM-0001', () => undefined, 'APROVADA_SALVA_NO_ACERVO')).rejects.toMatchObject({ code: 'INVALID_TRANSITION', status: 409 });
    expect(bus.getDemanda('DEM-0001').historico).toEqual([]);
    const demanda = bus.getDemanda('DEM-0001');
    transition(demanda, 'CLASSIFICADA', new Date().toISOString()); expect(demanda.historico).toHaveLength(1);
  });
  it('valida envelopes, aplica idempotência persistente e mantém mailbox serial', async () => {
    const { bus, store, clock } = await setup();
    let active = 0; let peak = 0; const processed: string[] = [];
    bus.register('art_director', async message => { active++; peak = Math.max(peak, active); await Promise.resolve(); processed.push(message.id); active--; });
    const messages = Array.from({ length: 12 }, () => bus.envelope({ action: 'PREENCHER_ACERVO', from: 'acervo_watcher', to: 'art_director', demandaId: 'DEM-0001', hop: 0, payload: { procedimento: 'botox', tipoTemplate: 'banco_imagem_1' } }));
    await Promise.all([...messages, messages[0]!].map(message => bus.send(message))); await bus.whenIdle();
    expect(processed).toHaveLength(12); expect(peak).toBe(1); expect(bus.snapshot().messages).toHaveLength(12);
    await bus.send(messages[0]!); expect(processed).toHaveLength(12);
    const restored = new EventBus(store, clock, new NanoIdGenerator(), 5); await restored.hydrate();
    await restored.send(messages[0]!); expect(restored.snapshot().messages).toHaveLength(12);
    await expect(bus.send({ ...messages[0]!, id: 'invalid', from: 'system' })).rejects.toThrow();
    await bus.stop(); await restored.stop();
  });
  it('limite de hop não entrega ordem e escala sem reabrir terminal', async () => {
    const { bus } = await setup(0); let delivered = false;
    bus.register('van_gogh', async () => { delivered = true; });
    await bus.send(bus.envelope({ action: 'AJUSTAR_ARTE', from: 'art_director', to: 'van_gogh', demandaId: 'DEM-0001', hop: 1, payload: { versaoAnterior: 1, feedbackDiretor: { resumo: 'Corrigir', correcoes: [] } } }));
    await bus.whenIdle(); expect(delivered).toBe(false);
    expect(bus.getDemanda('DEM-0001')).toMatchObject({ estado: 'AGUARDANDO_APROVACAO_AWR', escalada: true, motivoEscalada: 'hop_limit' });
    await bus.update('DEM-0001', () => undefined, 'APROVADA_SALVA_NO_ACERVO');
    await bus.send(bus.envelope({ action: 'AJUSTAR_ARTE', from: 'art_director', to: 'van_gogh', demandaId: 'DEM-0001', hop: 2, payload: { versaoAnterior: 1, feedbackDiretor: { resumo: 'Corrigir', correcoes: [] } } }));
    expect(bus.getDemanda('DEM-0001').estado).toBe('APROVADA_SALVA_NO_ACERVO'); await bus.stop();
  });
  it('retomada de mensagem pendente também aplica o limite de hops', async () => {
    const { bus, store, clock } = await setup(0);
    const message = bus.envelope({ action: 'AJUSTAR_ARTE', from: 'art_director', to: 'van_gogh', demandaId: 'DEM-0001', hop: 1, payload: { versaoAnterior: 1, feedbackDiretor: { resumo: 'Corrigir', correcoes: [] } } });
    await bus.transaction(state => { state.messages.push(message); state.pending.push(message.id); }); await bus.stop();
    const restored = new EventBus(store, clock, new NanoIdGenerator(), 0); await restored.hydrate();
    let calls = 0; restored.register('van_gogh', async () => { calls++; }); await restored.resume(); await restored.whenIdle();
    expect(calls).toBe(0); expect(restored.getDemanda('DEM-0001').motivoEscalada).toBe('hop_limit'); await restored.stop();
  });
  it('retém 1000 eventos, snapshots são isolados e listeners com erro não interrompem', async () => {
    const { bus } = await setup(); const delivered: string[] = [];
    bus.subscribe(() => { throw new Error('consumer'); }); const unsubscribe = bus.subscribe(event => { delivered.push(event.id); event.type = 'log'; });
    for (let i = 0; i < 1005; i++) bus.log('info', `Mensagem ${i}`);
    expect(delivered).toHaveLength(1005); expect(new Set(delivered).size).toBe(1005);
    expect(bus.history(10000)).toHaveLength(1000); expect(bus.history(0)).toEqual([]);
    bus.history(1).forEach(event => SseEnvelopeSchema.parse(event));
    const snapshot = bus.snapshot(); snapshot.demandas['DEM-0001']!.briefing = 'mutated'; expect(bus.getDemanda('DEM-0001').briefing).toBe('botox');
    unsubscribe(); bus.log('info', 'final'); expect(delivered).toHaveLength(1005); await bus.stop();
  });
});
