import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { AcervoGridSchema, ArteMetaSchema } from '../shared/types';
import { fixture } from './test-support';
import { metaPath } from './services/ImageEngine';

describe('integração headless em mock', () => {
  it('demanda → Diretor → humano aprovar → arquivo final e meta', async () => {
    const f = await fixture();
    try {
      const created = await f.app.submitDemand({ briefing: 'Toxina botulínica, foto institucional', clinicaNome: 'Clínica Exemplo' });
      expect(created.classificacao?.procedimento).toBe('botox'); await f.bus.whenIdle();
      expect(f.app.getDemanda(created.id)?.estado).toBe('AGUARDANDO_APROVACAO_AWR');
      const result = await f.app.humanReview(created.id, { decisao: 'aprovar', revisor: 'AWR' });
      expect(result.estado).toBe('APROVADA_SALVA_NO_ACERVO');
      expect(result.finalPath).toBe(`botox/botox__banco_imagem_2__${created.id}.png`);
      expect((await f.storage.read(result.finalPath!)).length).toBeGreaterThan(100);
      expect(ArteMetaSchema.parse(JSON.parse((await f.storage.read(metaPath(result.finalPath!))).toString())).demandaId).toBe(created.id);
      expect((await f.app.acervo.grid()).preenchidos).toBe(1);
      await expect(f.app.humanReview(created.id, { decisao: 'aprovar', revisor: 'AWR' })).rejects.toMatchObject({ code: 'INVALID_TRANSITION' });
    } finally { await f.close(); }
  });
  it('reprovações forçadas respeitam taxa e escalam na terceira; melhor versão segue à AWR', async () => {
    const f = await fixture({ MOCK_REJECT_RATE: 1 }, { rng: () => 0 });
    try {
      const demand = await f.app.submitDemand({ briefing: 'Preenchimento labial antes e depois' }); await f.bus.whenIdle();
      expect(f.app.getDemanda(demand.id)).toMatchObject({ estado: 'AGUARDANDO_APROVACAO_AWR', tentativaDiretor: 3, versaoAtual: 3, hop: 2, escalada: true, motivoEscalada: 'director_attempts', stagingPath: `_staging/${demand.id}__v1.png`, ultimoReview: { aprovada: false } });
      expect(f.app.listMessages({ demandaId: demand.id }).filter(message => message.action === 'AJUSTAR_ARTE')).toHaveLength(2);
      await f.app.resetHops(demand.id); expect(f.app.getDemanda(demand.id)?.motivoEscalada).toBe('director_attempts');
      const final = await f.app.humanReview(demand.id, { decisao: 'aprovar', revisor: 'AWR' });
      const meta = ArteMetaSchema.parse(JSON.parse((await f.storage.read(metaPath(final.finalPath!))).toString())); expect(meta.versao).toBe(1);
    } finally { await f.close(); }
  }, 15000);
  it('seleciona por maior score, mesmo quando a melhor imagem não é a última', async () => {
    const values = [0, 0, 0, 0, 0, 1, 0, 0, 0]; let index = 0;
    const f = await fixture({ MOCK_REJECT_RATE: 1 }, { rng: () => values[index++] ?? 0 });
    try {
      const demand = await f.app.submitDemand({ briefing: 'Botox' }); await f.bus.whenIdle();
      expect(f.app.getDemanda(demand.id)).toMatchObject({ versaoAtual: 3, stagingPath: `_staging/${demand.id}__v2.png`, escalada: true });
    } finally { await f.close(); }
  });
  it('ajuste humano grava regra ativa, reinicia tentativa e produz próxima versão com hop+1', async () => {
    const f = await fixture();
    try {
      const demand = await f.app.submitDemand({ briefing: 'Botox antes e depois' }); await f.bus.whenIdle();
      const response = await f.app.humanReview(demand.id, { decisao: 'ajustar', motivo: 'O selo cobriu a região tratada', revisor: 'AWR' });
      expect(response.hop).toBe(1); await f.bus.whenIdle();
      expect(f.app.getDemanda(demand.id)).toMatchObject({ estado: 'AGUARDANDO_APROVACAO_AWR', versaoAtual: 2, tentativaDiretor: 1, hop: 1 });
      expect(await readFile(join(f.config.BRAIN_DIR, 'skills/procedimentos/botox.skill.md'), 'utf8')).toContain('### L01');
      const meta = ArteMetaSchema.parse(JSON.parse((await f.storage.read(`_staging/${demand.id}__v2.meta.json`)).toString())); expect(meta.aprendizadosAplicados).toContain('L01');
      const review = f.app.getDemanda(demand.id)?.ultimoReview; expect(review?.itens.some(item => item.id === 'L01')).toBe(true);
      expect((await f.storage.read(`_staging/${demand.id}__v1.png`)).equals(await f.storage.read(`_staging/${demand.id}__v2.png`))).toBe(false);
    } finally { await f.close(); }
  });
  it('hop_limit bloqueia ajuste até reset e ainda permite aprovação', async () => {
    const f = await fixture({ MAX_HOPS: 0, MOCK_REJECT_RATE: 1 }, { rng: () => 0 });
    try {
      const demand = await f.app.submitDemand({ briefing: 'Fios de sustentação, antes e depois' }); await f.bus.whenIdle();
      expect(f.app.getDemanda(demand.id)).toMatchObject({ estado: 'AGUARDANDO_APROVACAO_AWR', motivoEscalada: 'hop_limit', versaoAtual: 1 });
      await expect(f.app.humanReview(demand.id, { decisao: 'ajustar', motivo: 'Corrigir', revisor: 'AWR' })).rejects.toMatchObject({ code: 'HOP_LIMIT', status: 409 });
      await f.app.resetHops(demand.id); expect(f.app.getDemanda(demand.id)?.escalada).toBe(false);
      // Nova tentativa humana excede o orçamento zero e torna a escalar, sem gerar PNG extra.
      await f.app.humanReview(demand.id, { decisao: 'ajustar', motivo: 'O selo cobre o rosto', revisor: 'AWR' }); await f.bus.whenIdle();
      expect(f.app.getDemanda(demand.id)?.motivoEscalada).toBe('hop_limit');
      expect((await f.app.humanReview(demand.id, { decisao: 'aprovar', revisor: 'AWR' })).estado).toBe('APROVADA_SALVA_NO_ACERVO');
    } finally { await f.close(); }
  });
  it('Watcher + Monalisa preenchem 12 slots com dedupe; só aprovação humana preenche slot final', async () => {
    const f = await fixture({ ACERVO_AUTOFILL: true });
    try {
      await Promise.all([f.app.acervo.fill(), f.app.acervo.fill()]); await f.bus.whenIdle();
      const demandas = f.app.listDemandas(); expect(demandas).toHaveLength(12);
      expect(demandas.every(demand => demand.criadorAtual === 'monalisa' && demand.estado === 'AGUARDANDO_APROVACAO_AWR')).toBe(true);
      expect((await f.app.acervo.grid()).preenchidos).toBe(0); expect((await f.app.acervo.grid()).emProducao).toBe(12);
      for (const demanda of demandas) await f.app.humanReview(demanda.id, { decisao: 'aprovar', revisor: 'AWR' });
      expect(AcervoGridSchema.parse(await f.app.acervo.grid())).toMatchObject({ preenchidos: 12, vazios: 0, emProducao: 0 });
      await f.clock.advance(f.config.ACERVO_HEARTBEAT_MS); await f.bus.whenIdle(); expect(f.app.listDemandas()).toHaveLength(12);
    } finally { await f.close(); }
    expect(f.clock.timerCount).toBe(0);
  }, 30000);
  it('scheduler reenvia uma vez e registra erro na segunda cobrança', async () => {
    const f = await fixture({ DIRECTOR_TICK_MS: 100, PRODUCTION_TIMEOUT_MS: 100 });
    try {
      f.bus.register('van_gogh', async () => { throw new Error('Falha de produção simulada'); });
      const demand = await f.app.submitDemand({ briefing: 'Botox' }); await f.bus.whenIdle();
      await f.clock.advance(100); await f.bus.whenIdle();
      expect(f.app.listMessages({ demandaId: demand.id }).filter(message => message.action === 'PRODUZIR_ARTE')).toHaveLength(2);
      await f.clock.advance(500); await f.bus.whenIdle();
      expect(f.app.listMessages({ demandaId: demand.id }).filter(message => message.action === 'PRODUZIR_ARTE')).toHaveLength(2);
      expect(f.bus.history(100).some(event => event.type === 'log' && event.payload.level === 'error' && event.payload.message.includes('após uma cobrança'))).toBe(true);
    } finally { await f.close(); }
  });
  it('Monalisa considera metas da coleção, evita repetir headline/CTA e não usa clínica', async () => {
    const f = await fixture();
    try {
      await f.app.acervo.fill('botox', 'antes_depois_1'); await f.bus.whenIdle(); const first = f.app.listDemandas()[0]!;
      await f.app.humanReview(first.id, { decisao: 'aprovar', revisor: 'AWR' });
      await f.app.acervo.fill('botox', 'antes_depois_2'); await f.bus.whenIdle(); const second = f.app.listDemandas()[1]!;
      const meta = ArteMetaSchema.parse(JSON.parse((await f.storage.read(metaPath(second.stagingPath!))).toString()));
      const firstMeta = ArteMetaSchema.parse(JSON.parse((await f.storage.read(metaPath(f.app.getDemanda(first.id)!.finalPath!))).toString()));
      expect(meta.textos.headline).not.toBe(firstMeta.textos.headline); expect(meta.textos.cta).not.toBe(firstMeta.textos.cta);
      expect(meta.ator).toBe('monalisa');
      if (meta.ator === 'monalisa') expect(meta.coerenciaColecao.referenciasConsideradas).toContain(f.app.getDemanda(first.id)!.finalPath);
      expect(second.clinicaNome).toBeUndefined(); expect(meta.promptUsado).toContain('CLINIC: \n');
    } finally { await f.close(); }
  });
  it('extrai campos do briefing e registra substituição de texto proibido', async () => {
    const f = await fixture();
    try {
      const demand = await f.app.submitDemand({ procedimento: 'botox', briefing: 'Toxina botulínica\nHeadline: Resultado garantido\nCTA: Agende sua avaliação\nClínica: Exemplo & Filhos' }); await f.bus.whenIdle();
      expect(f.app.getDemanda(demand.id)?.clinicaNome).toBe('Exemplo & Filhos');
      const meta = ArteMetaSchema.parse(JSON.parse((await f.storage.read(metaPath(f.app.getDemanda(demand.id)!.stagingPath!))).toString()));
      expect(meta.textos.headline).not.toContain('garantido'); expect(meta.ajustesCompliance.length).toBeGreaterThan(0);
    } finally { await f.close(); }
  });
});
