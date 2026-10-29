import { ActorIdSchema, ListMarcasResponseSchema, LogoVarianteSchema, MarcaResponseSchema, IaModelosResponseSchema, IaModelosSchema, IaUsoResponseSchema, EmpresaInputSchema, EmpresaResponseSchema, ListEmpresasResponseSchema, TemplatesQuerySchema, ListTemplatesResponseSchema, TemplateResponseSchema, SaveTemplateRequestSchema } from '../shared/types';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import {
  CreateDemandaRequestSchema, DemandaParamsSchema, EmptyRequestSchema, EventsHeadersSchema,
  FillAcervoRequestSchema, HumanReviewRequestSchema, ListMessagesQuerySchema,
  OrchestratorConfigSchema, SkillIdSchema, TriagemRequestSchema, TriagemResponseSchema,
} from '../shared/types';
import type { Orchestrator, OrchestratorConfig } from '../shared/types';
import { eventsResponse } from './events';
import type { CloseStream } from './events';
import { decodePublicPath, readContainedFile, readSkill } from './files';
import { ApiFailure, bodyJson, domainFailure, validate } from './http';

const activeStreams = new WeakMap<Hono, Set<CloseStream>>();

export function closeAppStreams(app: Hono): void {
  for (const close of activeStreams.get(app) ?? []) close();
}

export function createApp(deps: { orchestrator: Orchestrator; config: OrchestratorConfig; brainDir: string; acervoDir: string }): Hono {
  const { orchestrator, brainDir, acervoDir } = deps;
  const app = new Hono();
  const streams = new Set<CloseStream>();
  activeStreams.set(app, streams);
  app.use('*', cors({ origin: 'http://localhost:5173', allowMethods: ['GET', 'POST', 'PUT', 'OPTIONS'], allowHeaders: ['Content-Type', 'Last-Event-ID'] }));
  app.onError((error, c) => {
    const failure = domainFailure(error);
    return c.json({ error: { code: failure?.code ?? 'INTERNAL_ERROR', message: failure?.message ?? 'Erro interno ao processar a solicitação.' } }, failure?.status ?? 500);
  });
  app.notFound(c => c.json({ error: { code: 'NOT_FOUND', message: 'Recurso não encontrado.' } }, 404));
  const demanda = (id: string) => {
    const resultado = orchestrator.getDemanda(id);
    if (!resultado) throw new ApiFailure(404, 'NOT_FOUND', 'Demanda não encontrada.');
    return resultado;
  };
  const aguardaAwr = (id: string) => {
    const resultado = demanda(id);
    if (resultado.estado !== 'AGUARDANDO_APROVACAO_AWR') throw new ApiFailure(409, 'INVALID_TRANSITION', 'A demanda não está aguardando aprovação AWR.');
    return resultado;
  };
  app.get('/api/empresas', async c => c.json(ListEmpresasResponseSchema.parse({ empresas: await orchestrator.empresas.list() })));
  app.get('/api/empresas/:id', async c => {
    const empresa = await orchestrator.empresas.get(c.req.param('id'));
    if (!empresa) throw new ApiFailure(404, 'NOT_FOUND', 'Empresa não encontrada.');
    return c.json(EmpresaResponseSchema.parse({ empresa }));
  });
  app.post('/api/empresas', async c => c.json(EmpresaResponseSchema.parse({ empresa: await orchestrator.empresas.upsert(validate(EmpresaInputSchema, await bodyJson(c))) })));
  app.post('/api/empresas/:id/logo', async c => {
    let form: FormData;
    try { form = await c.req.raw.formData(); }
    catch { throw new ApiFailure(400, 'VALIDATION_ERROR', 'Envie multipart/form-data com o campo arquivo.'); }
    const arquivo = form.get('arquivo');
    const mimes = ['image/png', 'image/jpeg', 'image/svg+xml', 'image/webp'];
    if (!(arquivo instanceof File) || !/\.(png|jpe?g|svg|webp)$/i.test(arquivo.name) || !mimes.includes(arquivo.type) || arquivo.size === 0 || arquivo.size > 2 * 1024 * 1024) {
      throw new ApiFailure(400, 'VALIDATION_ERROR', 'Logo deve ser PNG, JPG, SVG ou WebP de até 2 MB.');
    }
    const variante = LogoVarianteSchema.safeParse(form.get('variante') ?? 'principal');
    if (!variante.success) throw new ApiFailure(400, 'VALIDATION_ERROR', 'variante deve ser principal, claro ou escuro.');
    const principal = form.get('principal') ?? 'true';
    if (principal !== 'true' && principal !== 'false') throw new ApiFailure(400, 'VALIDATION_ERROR', 'principal deve ser true ou false.');
    return c.json(EmpresaResponseSchema.parse({ empresa: await orchestrator.empresas.setLogo(c.req.param('id'), { nome: arquivo.name, dados: Buffer.from(await arquivo.arrayBuffer()) }, variante.data, principal === 'true') }));
  });
  app.get('/api/templates', async c => {
    if (Object.values(c.req.queries()).some(values => values.length !== 1)) throw new ApiFailure(400, 'VALIDATION_ERROR', 'Query não aceita campos repetidos.');
    return c.json(ListTemplatesResponseSchema.parse({ templates: await orchestrator.templates.list(validate(TemplatesQuerySchema, c.req.query())) }));
  });
  app.get('/api/templates/:id', async c => {
    const template = await orchestrator.templates.get(c.req.param('id'));
    if (!template) throw new ApiFailure(404, 'NOT_FOUND', 'Template não encontrado.');
    return c.json(TemplateResponseSchema.parse({ template }));
  });
  app.put('/api/templates/:id', async c => c.json(TemplateResponseSchema.parse({ template: await orchestrator.templates.save(c.req.param('id'), validate(SaveTemplateRequestSchema, await bodyJson(c))) })));
  app.get('/api/agentes', c => c.json({ pausados: orchestrator.agentes.pausados() }));
  app.post('/api/agentes/:id/:acao{pausar|retomar}', async c => {
    const id = ActorIdSchema.safeParse(c.req.param('id'));
    if (!id.success || !['van_gogh', 'monalisa', 'art_director'].includes(id.data)) throw new ApiFailure(400, 'VALIDATION_ERROR', 'Agente inválido.');
    const acao = c.req.param('acao');
    return c.json({ pausados: acao === 'pausar' ? await orchestrator.agentes.pausar(id.data) : await orchestrator.agentes.retomar(id.data) });
  });
  app.get('/api/brain/marcas', async c => c.json(ListMarcasResponseSchema.parse({ marcas: (await orchestrator.marcas.list()).map(({ conteudo: _c, visualSystem: _v, ...resumo }) => resumo) })));
  app.get('/api/brain/marcas/:id', async c => {
    const marca = await orchestrator.marcas.get(c.req.param('id'));
    if (!marca) throw new ApiFailure(404, 'NOT_FOUND', 'Skill de marca não encontrada.');
    return c.json(MarcaResponseSchema.parse({ marca }));
  });
  app.get('/api/ia/modelos', c => c.json(IaModelosResponseSchema.parse({ modelos: orchestrator.ia.modelos() })));
  app.put('/api/ia/modelos', async c => c.json(IaModelosResponseSchema.parse({ modelos: await orchestrator.ia.salvarModelos(validate(IaModelosSchema, await bodyJson(c))) })));
  app.get('/api/ia/uso', c => c.json(IaUsoResponseSchema.parse(orchestrator.ia.uso())));
  app.post('/api/ia/uso/zerar', async c => c.json(IaUsoResponseSchema.parse(await orchestrator.ia.zerarUso())));
  app.post('/api/triagem', async c => {
    const { texto } = validate(TriagemRequestSchema, await bodyJson(c));
    return c.json(TriagemResponseSchema.parse({ triagem: await orchestrator.triar(texto) }));
  });
  app.post('/api/demandas', async c => c.json({ demanda: await orchestrator.submitDemand(validate(CreateDemandaRequestSchema, await bodyJson(c))) }, 201));
  app.get('/api/demandas', c => c.json({ demandas: orchestrator.listDemandas() }));
  app.get('/api/demandas/:id', c => {
    const { id } = validate(DemandaParamsSchema, c.req.param());
    return c.json({ demanda: demanda(id), messages: orchestrator.listMessages({ demandaId: id }) });
  });
  app.post('/api/demandas/:id/feedback', async c => {
    const { id } = validate(DemandaParamsSchema, c.req.param());
    const feedback = validate(HumanReviewRequestSchema, await bodyJson(c));
    const atual = aguardaAwr(id);
    if (feedback.decisao === 'ajustar' && atual.escalada && atual.motivoEscalada === 'hop_limit') {
      throw new ApiFailure(409, 'HOP_LIMIT', 'Limite de hops atingido. Faça o reset antes de solicitar ajuste.');
    }
    return c.json({ demanda: await orchestrator.humanReview(id, feedback) });
  });
  app.post('/api/demandas/:id/reset-hops', async c => {
    const { id } = validate(DemandaParamsSchema, c.req.param());
    validate(EmptyRequestSchema, await bodyJson(c, true));
    aguardaAwr(id);
    return c.json({ demanda: await orchestrator.resetHops(id) });
  });
  app.post('/api/demandas/:id/produzir', async c => {
    const { id } = validate(DemandaParamsSchema, c.req.param());
    validate(EmptyRequestSchema, await bodyJson(c, true));
    demanda(id);
    return c.json({ demanda: await orchestrator.produzir(id) });
  });
  app.get('/api/acervo', async c => c.json(await orchestrator.acervo.grid()));
  app.post('/api/acervo/fill', async c => {
    const filtros = validate(FillAcervoRequestSchema, await bodyJson(c, true));
    await orchestrator.acervo.fill(filtros.procedimento, filtros.tipoTemplate);
    return c.json({ accepted: true }, 202);
  });
  app.get('/api/messages', c => {
    const query = c.req.queries();
    if (Object.values(query).some(values => values.length !== 1)) throw new ApiFailure(400, 'VALIDATION_ERROR', 'Query não aceita campos repetidos.');
    return c.json({ messages: orchestrator.listMessages(validate(ListMessagesQuerySchema, c.req.query())) });
  });
  app.get('/api/events', c => {
    const cursor = c.req.header('last-event-id');
    const headers = validate(EventsHeadersSchema, cursor === undefined ? {} : { 'last-event-id': cursor });
    return eventsResponse(c, orchestrator.bus, headers['last-event-id'], streams);
  });
  app.get('/api/brain/skills', async c => {
    const skills = await Promise.all(SkillIdSchema.options.map(async id => {
      const { conteudo: _conteudo, rubrica: _rubrica, aprendizados: _aprendizados, ...resumo } = await readSkill(brainDir, id);
      return resumo;
    }));
    return c.json({ skills });
  });
  app.get('/api/brain/skills/:id', async c => {
    const parsed = SkillIdSchema.safeParse(c.req.param('id'));
    if (!parsed.success) throw new ApiFailure(404, 'NOT_FOUND', 'Skill não encontrada.');
    return c.json({ skill: await readSkill(brainDir, parsed.data) });
  });
  app.get('/api/config', c => c.json({ config: OrchestratorConfigSchema.parse(deps.config) }));
  app.get('/api/health', c => c.json({ status: 'ok', ts: new Date().toISOString() }));
  app.get('/acervo/*', async c => {
    const rawPath = new URL(c.req.url).pathname.slice('/acervo/'.length);
    const caminho = decodePublicPath(rawPath);
    const contentType = /\.png$/i.test(caminho) ? 'image/png' : /\.jpe?g$/i.test(caminho) ? 'image/jpeg' : /\.svg$/i.test(caminho) ? 'image/svg+xml' : /\.webp$/i.test(caminho) ? 'image/webp' : /\.meta\.json$/i.test(caminho) ? 'application/json; charset=utf-8' : undefined;
    if (!contentType) throw new ApiFailure(404, 'NOT_FOUND', 'Arquivo não público.');
    const bytes = await readContainedFile(acervoDir, caminho);
    return new Response(new Uint8Array(bytes), { headers: { 'Content-Type': contentType, 'Cache-Control': 'no-cache' } });
  });
  return app;
}
