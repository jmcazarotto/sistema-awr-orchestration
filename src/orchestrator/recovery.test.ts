import { describe, expect, it } from 'vitest';
import { fixture } from './test-support';
import { createOrchestratorWithDependencies } from './index';
import { createDemanda } from './core/demandaFactory';
import { transition } from './core/demandaState';
import type { EventBus } from './core/EventBus';
import { InboxMessageSchema } from '../shared/types';

describe('retomada e concorrência', () => {
  it('retoma despacho interrompido após a transição EM_PRODUCAO', async () => {
    const f = await fixture(); await f.app.stop();
    const state = await f.stateStore.load();
    const classificacao = { procedimento: 'botox' as const, tipoTemplate: 'banco_imagem_1' as const, agenteDesignado: 'van_gogh' as const, skillFile: 'skills/botox.skill.md', confianca: 1 };
    const demanda = createDemanda('DEM-0001', 'cliente', { briefing: 'Botox' }, f.clock.now().toISOString());
    demanda.classificacao = classificacao; demanda.criadorAtual = 'van_gogh';
    const message = InboxMessageSchema.parse({ id: 'interrupted-dispatch', demandaId: demanda.id, action: 'DEMANDA_CLASSIFICADA', from: 'system', to: 'art_director', hop: 0, createdAt: f.clock.now().toISOString(), payload: { classificacao } });
    transition(demanda, 'CLASSIFICADA', f.clock.now().toISOString()); transition(demanda, 'EM_PRODUCAO', f.clock.now().toISOString(), undefined, message.id);
    state.demandas[demanda.id] = demanda; state.sequence = 1; state.messages.push(message); state.pending.push(message.id); await f.stateStore.save(state);
    const app = createOrchestratorWithDependencies(f.config, { stateStore: f.stateStore, storage: f.storage, clock: f.clock, watchFiles: false });
    try {
      await app.start(); await (app.bus as EventBus).whenIdle(); expect(app.getDemanda(demanda.id)?.estado).toBe('AGUARDANDO_APROVACAO_AWR');
      const second = await app.submitDemand({ briefing: 'Fios de sustentação' }); expect(second.id).toBe('DEM-0002');
    } finally { await app.stop(); await f.close(); }
  });
  it('retoma revisão reprovada entre EM_AJUSTE_IA e envio, sem contar a revisão duas vezes', async () => {
    const f = await fixture({ MOCK_REJECT_RATE: 1 }, { rng: () => 0 });
    const demand = await f.app.submitDemand({ briefing: 'Botox antes e depois' }); await f.bus.whenIdle(); await f.app.stop();
    const state = await f.stateStore.load(); const original = state.demandas[demand.id]!;
    const firstDelivery = state.messages.find(message => message.demandaId === demand.id && message.action === 'ARTE_ENTREGUE' && message.payload.versao === 1)!;
    const index = original.historico.findIndex(entry => entry.para === 'EM_AJUSTE_IA');
    original.historico = original.historico.slice(0, index + 1); original.estado = 'EM_AJUSTE_IA'; original.versaoAtual = 1; original.hop = 0;
    original.tentativaDiretor = 1; original.stagingPath = `_staging/${demand.id}__v1.png`; original.escalada = false; delete original.motivoEscalada;
    state.messages = state.messages.slice(0, state.messages.indexOf(firstDelivery) + 1); state.pending = [firstDelivery.id]; state.processed = state.processed.filter(id => id !== firstDelivery.id);
    state.reviews = { [`${demand.id}:v1`]: state.reviews[`${demand.id}:v1`]! }; await f.stateStore.save(state);
    const app = createOrchestratorWithDependencies(f.config, { stateStore: f.stateStore, storage: f.storage, clock: f.clock, watchFiles: false, rng: () => 0 });
    try {
      await app.start(); await (app.bus as EventBus).whenIdle();
      expect(app.getDemanda(demand.id)).toMatchObject({ estado: 'AGUARDANDO_APROVACAO_AWR', tentativaDiretor: 3, versaoAtual: 3, motivoEscalada: 'director_attempts' });
    } finally { await app.stop(); await f.close(); }
  });
  it('retoma feedback humano após REPROVADA_HUMANO sem perder ajuste', async () => {
    const f = await fixture(); const demand = await f.app.submitDemand({ briefing: 'Botox' }); await f.bus.whenIdle(); await f.app.stop();
    const state = await f.stateStore.load(); const original = state.demandas[demand.id]!;
    const message = InboxMessageSchema.parse({ id: 'interrupted-feedback', demandaId: demand.id, action: 'FEEDBACK_HUMANO', from: 'awr_human', to: 'art_director', hop: 0, createdAt: f.clock.now().toISOString(), payload: { decisao: 'ajustar', motivo: 'O selo cobriu a região tratada', revisor: 'AWR' } });
    transition(original, 'REPROVADA_HUMANO', f.clock.now().toISOString(), undefined, message.id); original.tentativaDiretor = 0; delete state.best[demand.id];
    state.messages.push(message); state.pending = [message.id]; await f.stateStore.save(state);
    const app = createOrchestratorWithDependencies(f.config, { stateStore: f.stateStore, storage: f.storage, clock: f.clock, watchFiles: false });
    try {
      await app.start(); await (app.bus as EventBus).whenIdle(); expect(app.getDemanda(demand.id)).toMatchObject({ estado: 'AGUARDANDO_APROVACAO_AWR', tentativaDiretor: 1, versaoAtual: 2, hop: 1 });
      expect((await f.stateStore.load()).learningByMessage[message.id]?.id).toBe('L01');
    } finally { await app.stop(); await f.close(); }
  });
  it('dois cliques concorrentes só movem/aprovam uma vez e snapshots não vazam mutabilidade', async () => {
    const f = await fixture();
    try {
      const demand = await f.app.submitDemand({ briefing: 'Botox' }); await f.bus.whenIdle();
      const results = await Promise.allSettled([1, 2].map(() => f.app.humanReview(demand.id, { decisao: 'aprovar', revisor: 'AWR' })));
      expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
      expect(results.filter(result => result.status === 'rejected')).toHaveLength(1);
      const snapshot = f.app.getDemanda(demand.id)!; snapshot.briefing = 'mutable'; expect(f.app.getDemanda(demand.id)?.briefing).toBe('Botox');
      const publicConfig = f.app.config; publicConfig.MAX_HOPS = 99; expect(f.app.config.MAX_HOPS).toBe(5);
    } finally { await f.close(); }
  });
});
