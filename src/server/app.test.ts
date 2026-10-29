import { mkdir, rm, symlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ApiErrorSchema, CreateDemandaResponseSchema, GetAcervoResponseSchema, GetConfigResponseSchema,
  GetDemandaResponseSchema, GetSkillResponseSchema, HealthResponseSchema, ListDemandasResponseSchema,
  ListMessagesResponseSchema, ListSkillsResponseSchema,
} from '../shared/types';
import { createApp } from './app';
import { decodePublicPath } from './files';
import { criarDemanda, fixture, mensagem } from './test-support';

describe('adapter HTTP', () => {
  let f: Awaited<ReturnType<typeof fixture>>;
  beforeEach(async () => { f = await fixture(); });
  afterEach(async () => { vi.restoreAllMocks(); await f.cleanup(); });
  const post = (body?: unknown): RequestInit => ({ method: 'POST', ...(body === undefined ? {} : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }) });

  it('cria demanda com 201, usa schema para aparar texto e retorna DTO', async () => {
    const response = await f.app.request('/api/demandas', post({ briefing: '  Toxina botulínica  ', procedimento: 'botox' }));
    expect(response.status).toBe(201);
    expect(CreateDemandaResponseSchema.parse(await response.json()).demanda.id).toBe('DEM-0002');
    expect(f.orchestrator.submitDemand).toHaveBeenCalledWith({ briefing: 'Toxina botulínica', procedimento: 'botox' });
  });
  it.each([{}, { briefing: ' ' }, { briefing: 'x', procedimento: 'invalido' }, { briefing: 'x', origem: 'acervo' }, null])('valida criação %j', async body => {
    const response = await f.app.request('/api/demandas', post(body));
    expect(response.status).toBe(400);
    expect(ApiErrorSchema.parse(await response.json()).error.code).toBe('VALIDATION_ERROR');
    expect(f.orchestrator.submitDemand).not.toHaveBeenCalled();
  });
  it('retorna detalhes dos campos e trata JSON malformado/ausente', async () => {
    const invalid = await f.app.request('/api/demandas', post({ briefing: '', tipoTemplate: 'x' }));
    const erro = await invalid.text();
    expect(erro).toContain('briefing');
    expect(erro).toContain('tipoTemplate');
    for (const body of ['{', '']) {
      expect((await f.app.request('/api/demandas', { method: 'POST', body })).status).toBe(400);
    }
  });
  it('lista demandas e consulta demanda com mensagens filtradas', async () => {
    f.orchestrator.messages.push({ ...mensagem, id: 'msg-2', demandaId: 'DEM-0002' });
    expect(ListDemandasResponseSchema.parse(await (await f.app.request('/api/demandas')).json()).demandas).toHaveLength(1);
    const response = await f.app.request('/api/demandas/DEM-0001');
    const dto = GetDemandaResponseSchema.parse(await response.json());
    expect(dto.demanda.id).toBe('DEM-0001');
    expect(dto.messages.map(message => message.id)).toEqual(['msg-1']);
    f.orchestrator.demandas = [];
    expect(await (await f.app.request('/api/demandas')).json()).toEqual({ demandas: [] });
  });
  it.each(['GET', 'feedback', 'reset-hops'])('valida ID e inexistência em %s', async route => {
    const url = (id: string) => `/api/demandas/${id}${route === 'GET' ? '' : `/${route}`}`;
    const init = route === 'GET' ? {} : route === 'feedback' ? post({ decisao: 'aprovar', revisor: 'AWR' }) : post();
    expect((await f.app.request(url('invalido'), init)).status).toBe(400);
    expect((await f.app.request(url('DEM-9999'), init)).status).toBe(404);
  });
  it.each(['aprovar', 'ajustar'] as const)('encaminha feedback %s e impede duplo clique', async decisao => {
    const feedback = { decisao, revisor: 'AWR', ...(decisao === 'ajustar' ? { motivo: 'Ajustar selo' } : {}) };
    const response = await f.app.request('/api/demandas/DEM-0001/feedback', post(feedback));
    expect(response.status).toBe(200);
    expect(CreateDemandaResponseSchema.safeParse(await response.json()).success).toBe(true);
    expect(f.orchestrator.humanReview).toHaveBeenCalledWith('DEM-0001', feedback);
    expect((await f.app.request('/api/demandas/DEM-0001/feedback', post(feedback))).status).toBe(409);
    expect(f.orchestrator.humanReview).toHaveBeenCalledTimes(1);
  });
  it.each([{ decisao: 'ajustar', revisor: 'AWR' }, { decisao: 'ajustar', motivo: ' ', revisor: 'AWR' }, { decisao: 'aprovar' }, { decisao: 'aprovar', revisor: 'AWR', extra: true }])('valida feedback %j', async feedback => {
    expect((await f.app.request('/api/demandas/DEM-0001/feedback', post(feedback))).status).toBe(400);
  });
  it('bloqueia ajuste em hop_limit e permite aprovação', async () => {
    f.orchestrator.demandas[0] = criarDemanda({ escalada: true, motivoEscalada: 'hop_limit', hop: 5 });
    const response = await f.app.request('/api/demandas/DEM-0001/feedback', post({ decisao: 'ajustar', motivo: 'Texto', revisor: 'AWR' }));
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ error: { code: 'HOP_LIMIT' } });
    expect(f.orchestrator.humanReview).not.toHaveBeenCalled();
    expect((await f.app.request('/api/demandas/DEM-0001/feedback', post({ decisao: 'aprovar', revisor: 'AWR' }))).status).toBe(200);
  });
  it.each([undefined, {}])('reseta hops com body %j', async body => {
    f.orchestrator.demandas[0] = criarDemanda({ escalada: true, motivoEscalada: 'hop_limit', hop: 5 });
    const response = await f.app.request('/api/demandas/DEM-0001/reset-hops', post(body));
    expect(response.status).toBe(200);
    expect(CreateDemandaResponseSchema.parse(await response.json()).demanda).toMatchObject({ hop: 0, escalada: false });
    expect(f.orchestrator.resetHops).toHaveBeenCalledWith('DEM-0001');
  });
  it('valida reset e rejeita estado incompatível', async () => {
    expect((await f.app.request('/api/demandas/DEM-0001/reset-hops', post({ hop: 0 }))).status).toBe(400);
    f.orchestrator.demandas[0] = criarDemanda({ estado: 'EM_PRODUCAO' });
    const response = await f.app.request('/api/demandas/DEM-0001/reset-hops', post());
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ error: { code: 'INVALID_TRANSITION' } });
    expect(f.orchestrator.resetHops).not.toHaveBeenCalled();
  });
  it('retorna a grade sem wrapper', async () => {
    const response = await f.app.request('/api/acervo');
    expect(response.status).toBe(200);
    expect(GetAcervoResponseSchema.parse(await response.json())).toEqual(f.orchestrator.grade);
  });
  it.each([undefined, {}, { procedimento: 'botox' }, { tipoTemplate: 'banco_imagem_1' }, { procedimento: 'botox', tipoTemplate: 'banco_imagem_1' }])('preenche acervo com filtros %j', async body => {
    const response = await f.app.request('/api/acervo/fill', post(body));
    expect(response.status).toBe(202);
    expect(await response.json()).toEqual({ accepted: true });
    expect(f.orchestrator.acervo.fill).toHaveBeenCalledWith(body?.procedimento, body?.tipoTemplate);
  });
  it.each([{ procedimento: 'x' }, { tipoTemplate: 'x' }, { extra: true }, []].map(body => [body]))('rejeita fill %j', async body => {
    expect((await f.app.request('/api/acervo/fill', post(body))).status).toBe(400);
    expect(f.orchestrator.acervo.fill).not.toHaveBeenCalled();
  });
  it('consulta mensagens com e sem filtro e permite ID inexistente', async () => {
    for (const url of ['/api/messages', '/api/messages?demandaId=DEM-0001']) {
      const response = await f.app.request(url);
      expect(response.status).toBe(200);
      expect(ListMessagesResponseSchema.parse(await response.json()).messages).toHaveLength(1);
    }
    expect(await (await f.app.request('/api/messages?demandaId=DEM-9999')).json()).toEqual({ messages: [] });
  });
  it.each(['demandaId=x', 'extra=x', 'demandaId=DEM-0001&demandaId=DEM-0002'])('valida query de mensagens %s', async query => {
    expect((await f.app.request(`/api/messages?${query}`)).status).toBe(400);
  });
  it('lista e lê skills com front-matter, rubrica e aprendizados; relê cada request', async () => {
    const lista = ListSkillsResponseSchema.parse(await (await f.app.request('/api/brain/skills')).json());
    expect(lista.skills).toHaveLength(5);
    expect(lista.skills.find(skill => skill.id === 'template_composition')).not.toHaveProperty('procedimento');
    const response = await f.app.request('/api/brain/skills/botox');
    expect(response.status).toBe(200);
    const { skill } = GetSkillResponseSchema.parse(await response.json());
    expect(skill.rubrica.map(item => item.id)).toEqual(['R01', 'R02']);
    expect(skill.aprendizados.map(item => item.status)).toEqual(['ativo', 'exemplo', 'inativo']);
    expect(skill.aprendizados[0]).toMatchObject({ createdAt: '2026-10-28T14:02:00.000Z', motivoOriginal: 'O selo cobre o lábio.' });
    expect(skill.aprendizados[1]).toMatchObject({ escopo: 'global' });
    expect(skill.aprendizados[1]).not.toHaveProperty('demandaId');
    expect(skill.aprendizados[1]).not.toHaveProperty('template');
    await writeFile(join(f.brainDir, 'skills', 'procedimentos', 'botox.skill.md'), skill.conteudo.replace('versao: 1', 'versao: 2'));
    expect(GetSkillResponseSchema.parse(await (await f.app.request('/api/brain/skills/botox')).json()).skill.versao).toBe(2);
  });
  it.each(['invalida', '..%2f..%2fAGENTS.md', '%252e%252e', 'C:%5csegredo', '%2e%2e%5csegredo', 'botox.skill.md', '%00', '%E0%A4%A'])('rejeita skill fora da allowlist %s', async id => {
    expect((await f.app.request(`/api/brain/skills/${id}`)).status).toBe(404);
  });
  it('retorna 404 para skill suportada ausente', async () => {
    await rm(join(f.brainDir, 'skills', 'procedimentos', 'botox.skill.md'));
    expect((await f.app.request('/api/brain/skills/botox')).status).toBe(404);
  });
  it('expõe somente config pública e health sem acionar motor', async () => {
    const configComSegredo = { ...f.config, OPENAI_API_KEY: 'segredo-de-teste', JEV_API_KEY: 'outro-segredo' };
    const app = createApp({ orchestrator: f.orchestrator, config: configComSegredo, brainDir: f.brainDir, acervoDir: f.acervoDir });
    const response = await app.request('/api/config');
    expect(response.status).toBe(200);
    expect(GetConfigResponseSchema.parse(await response.json()).config).toEqual(f.config);
    const health = HealthResponseSchema.parse(await (await app.request('/api/health')).json());
    expect(health.status).toBe('ok');
    expect(f.orchestrator.submitDemand).not.toHaveBeenCalled();
  });
  it('trata 404 global, CORS e erros sem vazar detalhes', async () => {
    const missing = await f.app.request('/inexistente');
    expect(missing.status).toBe(404);
    expect(ApiErrorSchema.parse(await missing.json()).error.code).toBe('NOT_FOUND');
    const cors = await f.app.request('/api/health', { headers: { Origin: 'http://localhost:5173' } });
    expect(cors.headers.get('Access-Control-Allow-Origin')).toBe('http://localhost:5173');
    f.orchestrator.submitDemand.mockRejectedValue(new Error('stack prompt OPENAI_API_KEY=segredo'));
    const response = await f.app.request('/api/demandas', post({ briefing: 'Texto' }));
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: { code: 'INTERNAL_ERROR', message: 'Erro interno ao processar a solicitação.' } });
  });
  it.each([['INVALID_TRANSITION', 409], ['HOP_LIMIT', 409], ['NOT_FOUND', 404]] as const)('mapeia código de domínio %s com mensagem pública', async (code, status) => {
    f.orchestrator.humanReview.mockRejectedValue(Object.assign(new Error('segredo'), { code }));
    const response = await f.app.request('/api/demandas/DEM-0001/feedback', post({ decisao: 'aprovar', revisor: 'AWR' }));
    expect(response.status).toBe(status);
    expect(ApiErrorSchema.parse(await response.json()).error.code).toBe(code);
  });

  it.each([['botox/final.png', 'image/png'], ['_staging/DEM-0001__v1.png', 'image/png'], ['_staging/DEM-0001__v1.meta.json', 'application/json; charset=utf-8'], ['botox/ref.jpg', 'image/jpeg']])('serve bytes e content-type de %s', async (path, type) => {
    await writeFile(join(f.acervoDir, path!), 'conteudo-teste');
    const response = await f.app.request(`/acervo/${path}`);
    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe(type);
    expect(response.headers.get('Cache-Control')).toBe('no-cache');
    expect(await response.text()).toBe('conteudo-teste');
  });
  it.each(['botox/ausente.png', 'state.json', 'arquivo.md', 'botox'])('não expõe arquivo ausente ou não público %s', async path => {
    expect((await f.app.request(`/acervo/${path}`)).status).toBe(404);
  });
  it.each(['..%2fsegredo.png', '%2e%2e%2fsegredo.png', '%252e%252e%252fsegredo.png', 'botox%5c..%5csegredo.png', 'C:%5csegredo.png', '%2f%2fservidor%2fsegredo.png', '%00.png', '%E0%A4%A', 'botox//final.png', 'botox/..%2ffinal.png'])('barra path inseguro %s', async path => {
    expect((await f.app.request(`/acervo/${path}`)).status).toBe(400);
  });
  it('barra segmentos literais e requests que o URL parser normalizou continuam sem expor arquivo', async () => {
    expect(() => decodePublicPath('../segredo.png')).toThrow();
    expect(() => decodePublicPath('botox\\segredo.png')).toThrow();
    expect((await f.app.request('/acervo/../segredo.png')).status).toBe(404);
  });
  it('barra junction/symlink que sai da raiz e diretório com extensão PNG', async () => {
    const externo = join(f.raiz, 'acervo-externo');
    await mkdir(externo);
    await writeFile(join(externo, 'segredo.png'), 'segredo');
    await symlink(externo, join(f.acervoDir, 'escape'), process.platform === 'win32' ? 'junction' : 'dir');
    const response = await f.app.request('/acervo/escape/segredo.png');
    expect(response.status).toBe(400);
    expect(await response.text()).not.toContain('segredo');
    await mkdir(join(f.acervoDir, 'pasta.png'));
    expect((await f.app.request('/acervo/pasta.png')).status).toBe(404);
  });
});
