import { describe, expect, expectTypeOf, it } from 'vitest';
import { loadConfig } from './config';
import {
  ACTION_TYPES, AcervoGridSchema, ApiErrorSchema, ArteMetaSchema, CreateDemandaRequestSchema,
  ESTADOS_DEMANDA, FeedbackHumanoSchema, GetConfigResponseSchema, InboxMessageSchema,
  LearningSchema, OrchestratorConfigSchema, PROCEDIMENTOS, SSE_EVENT_TYPES, SseEnvelopeSchema,
  TriagemSchema, TriagemRequestSchema, TriagemResponseSchema, SseEventSchema, TIPOS_TEMPLATE, TransicaoDemandaSchema, transicaoValida,
} from './types';
import type {
  AcervoGrid, Classificacao, Demanda, InboxMessage, Learning, PayloadOf, ReviewResult, SseEnvelope, SseEvent,
} from './types';

const ts = '2026-10-28T14:05:11Z';
const classificacao = {
  procedimento: 'botox', agenteDesignado: 'van_gogh', tipoTemplate: 'antes_depois_1',
  skillFile: 'brain/skills/botox.skill.md', confianca: 0.95,
} satisfies Classificacao;
const review = {
  aprovada: false, score: 0.5,
  itens: [{ id: 'R01', severidade: 'critico', resposta: 'nao', evidencia: 'Disclaimer cortado.' }],
  feedback: { resumo: 'Corrigir rodapé.', correcoes: [{ itemId: 'R01', instrucao: 'Reposicionar o disclaimer dentro da safe area.' }] },
} satisfies ReviewResult;
const demanda = {
  id: 'DEM-0001', origem: 'cliente', briefing: 'Arte sobre toxina botulínica.',
  estado: 'EM_REVISAO_DIRETOR', classificacao, criadorAtual: 'van_gogh', hop: 0,
  tentativaDiretor: 1, versaoAtual: 1, escalada: false,
  stagingPath: '_staging/DEM-0001__v1.png', ultimoReview: review,
  historico: [
    { de: 'CRIADA', para: 'CLASSIFICADA', ts },
    { de: 'CLASSIFICADA', para: 'EM_PRODUCAO', ts },
    { de: 'EM_PRODUCAO', para: 'EM_REVISAO_DIRETOR', ts },
  ],
  createdAt: ts, updatedAt: ts,
} satisfies Demanda;
const learning = {
  id: 'L03', createdAt: ts, procedimento: 'botox', template: 'antes_depois_1',
  fonte: 'awr_humano', demandaId: 'DEM-0001', regra: 'Nunca cobrir a região tratada com o selo.',
  motivoOriginal: 'O selo cobriu o resultado.', status: 'ativo',
} satisfies Learning;
const slots = PROCEDIMENTOS.flatMap(procedimento => TIPOS_TEMPLATE.map(tipoTemplate => ({
  procedimento, tipoTemplate, preenchido: false, arquivos: [],
})));
const grid = { slots, total: 12, preenchidos: 0, vazios: 12, emProducao: 0 } satisfies AcervoGrid;
const envelope = { id: 'msg-1', demandaId: 'DEM-0001', hop: 0, createdAt: ts };
const messages = [
  { ...envelope, action: 'DEMANDA_CLASSIFICADA', from: 'system', to: 'art_director', payload: { classificacao } },
  { ...envelope, action: 'PREENCHER_ACERVO', from: 'acervo_watcher', to: 'art_director', payload: { procedimento: 'botox', tipoTemplate: 'banco_imagem_1' } },
  { ...envelope, action: 'PRODUZIR_ARTE', from: 'art_director', to: 'van_gogh', payload: { procedimento: 'botox', tipoTemplate: 'antes_depois_1', skillFile: 'brain/skills/botox.skill.md', briefing: 'Arte para a clínica.' } },
  { ...envelope, action: 'ARTE_ENTREGUE', from: 'van_gogh', to: 'art_director', payload: { stagingPath: '_staging/DEM-0001__v1.png', versao: 1, promptUsado: 'Retrato editorial.', engine: 'mock' } },
  { ...envelope, action: 'AJUSTAR_ARTE', from: 'art_director', to: 'van_gogh', hop: 1, causationId: 'msg-0', payload: { feedbackDiretor: review.feedback, versaoAnterior: 1 } },
  { ...envelope, action: 'FEEDBACK_HUMANO', from: 'awr_human', to: 'art_director', payload: { decisao: 'ajustar', motivo: 'O selo cobriu o resultado.', revisor: 'AWR' } },
] as const satisfies readonly InboxMessage[];
const triagem = TriagemSchema.parse({
  id: 'TRI-test', texto: 'Botox para Royal Face', empresa: { id: 'royal_face_castanhal', nome: 'Royal Face Castanhal', cadastrada: true, confianca: 0.9 },
  procedimento: 'botox', procedimentoConfianca: 0.95, tipoTemplate: 'antes_depois_1', familiaArte: 'antes_depois', tipoTemplateConfianca: 0.8,
  provider: 'jev', modelo: 'jev-latest', latenciaMs: 280, tokens: { entrada: 100, saida: 20 }, custo: { usd: 0.0000042, brl: 0.0000231, cotacaoUsdBrl: 5.5 }, criadoEm: ts,
});
const events = [
  { type: 'agentes.pausa', payload: { pausados: ['van_gogh'] } },
  { type: 'actor.status', payload: { actorId: 'van_gogh', status: 'generating', demandaId: 'DEM-0001' } },
  { type: 'message.sent', payload: messages[0] },
  { type: 'demand.updated', payload: demanda },
  { type: 'review.result', payload: { demandaId: 'DEM-0001', versao: 1, tentativaDiretor: 1, review } },
  { type: 'acervo.updated', payload: grid },
  { type: 'brain.learning', payload: { skillFile: 'brain/skills/botox.skill.md', learning } },
  { type: 'log', payload: { level: 'warn', message: 'Revisão reprovada.', demandaId: 'DEM-0001', actorId: 'art_director' } },
  { type: 'triagem.started', payload: { triagemId: triagem.id, texto: triagem.texto, provider: 'jev', modelo: triagem.modelo } },
  { type: 'triagem.result', payload: triagem },
] satisfies SseEvent[];

describe('máquina de estados — AGENTS.md §3', () => {
  const edges = new Set([
    'CRIADA>CLASSIFICADA', 'CLASSIFICADA>EM_PRODUCAO', 'EM_PRODUCAO>EM_REVISAO_DIRETOR',
    'EM_REVISAO_DIRETOR>EM_AJUSTE_IA', 'EM_AJUSTE_IA>EM_REVISAO_DIRETOR',
    'EM_REVISAO_DIRETOR>AGUARDANDO_APROVACAO_AWR',
    'AGUARDANDO_APROVACAO_AWR>APROVADA_SALVA_NO_ACERVO',
    'AGUARDANDO_APROVACAO_AWR>REPROVADA_HUMANO', 'REPROVADA_HUMANO>EM_PRODUCAO',
  ]);
  for (const de of ESTADOS_DEMANDA) {
    for (const para of ESTADOS_DEMANDA) {
      it(`${de} → ${para}`, () => {
        const valid = edges.has(`${de}>${para}`);
        expect(transicaoValida(de, para)).toBe(valid);
        expect(TransicaoDemandaSchema.safeParse({ de, para, ts }).success).toBe(valid);
      });
    }
  }
  it('registra a escalada operacional do §4, sem ampliar transicaoValida', () => {
    const transition = { de: 'EM_AJUSTE_IA', para: 'AGUARDANDO_APROVACAO_AWR', ts, motivo: 'hop_limit' };
    expect(TransicaoDemandaSchema.safeParse(transition).success).toBe(true);
    expect(transicaoValida('EM_AJUSTE_IA', 'AGUARDANDO_APROVACAO_AWR')).toBe(false);
    expect(TransicaoDemandaSchema.safeParse({ ...transition, motivo: 'director_attempts' }).success).toBe(false);
    expect(TransicaoDemandaSchema.safeParse({ ...transition, de: 'APROVADA_SALVA_NO_ACERVO' }).success).toBe(false);
  });
});

describe('envelopes de inbox', () => {
  it('cobre todas as actions do protocolo', () => {
    expect(messages.map(message => message.action)).toEqual([...ACTION_TYPES]);
  });
  for (const message of messages) {
    it(`valida ${message.action} e rejeita payload incompatível`, () => {
      expect(InboxMessageSchema.parse(message)).toEqual(message);
      expect(InboxMessageSchema.safeParse({ ...message, payload: {} }).success).toBe(false);
      expect(InboxMessageSchema.safeParse({ ...message, from: 'monalisa', to: 'monalisa' }).success).toBe(false);
    });
  }
  it('permite Monalisa somente nas rotas de criador', () => {
    expect(InboxMessageSchema.safeParse({ ...messages[2], to: 'monalisa' }).success).toBe(true);
    expect(InboxMessageSchema.safeParse({ ...messages[3], from: 'monalisa' }).success).toBe(true);
    expect(InboxMessageSchema.safeParse({ ...messages[4], to: 'monalisa' }).success).toBe(true);
  });
  it('rejeita hop negativo, ID malformado, timestamp inválido e ação desconhecida', () => {
    for (const override of [{ hop: -1 }, { hop: 0.5 }, { demandaId: '1' }, { createdAt: 'hoje' }, { action: 'APROVAR' }]) {
      expect(InboxMessageSchema.safeParse({ ...messages[0], ...override }).success).toBe(false);
    }
  });
  it('mantém discriminação estática e PayloadOf', () => {
    const parsed = InboxMessageSchema.parse(messages[0]);
    if (parsed.action === 'DEMANDA_CLASSIFICADA') {
      expectTypeOf(parsed.payload).toEqualTypeOf<PayloadOf<'DEMANDA_CLASSIFICADA'>>();
      expectTypeOf(parsed.from).toEqualTypeOf<'system'>();
    }
    expectTypeOf<InboxMessage<'ARTE_ENTREGUE'>['payload']['engine']>().toEqualTypeOf<'mock' | 'openai'>();
  });
});

describe('eventos SSE', () => {
  it('cobre todos os tipos do §5', () => {
    expect(events.map(event => event.type)).toEqual([...SSE_EVENT_TYPES]);
  });
  for (const event of events) {
    it(`valida evento e envelope ${event.type}`, () => {
      expect(SseEventSchema.parse(event)).toEqual(event);
      const wireEvent = { ...event, id: 'event-1', ts };
      expect(SseEnvelopeSchema.parse(wireEvent)).toEqual(wireEvent);
      expect(SseEnvelopeSchema.safeParse(event).success).toBe(false);
      expect(SseEnvelopeSchema.safeParse({ ...wireEvent, ts: 'ontem' }).success).toBe(false);
      expect(SseEventSchema.safeParse({ ...event, payload: {} }).success).toBe(false);
    });
  }
  it('suporta ator idle sem demanda e preserva narrowing no envelope', () => {
    expect(SseEventSchema.safeParse({ type: 'actor.status', payload: { actorId: 'monalisa', status: 'idle', demandaId: null } }).success).toBe(true);
    const parsed: SseEnvelope = SseEnvelopeSchema.parse({ ...events[2], id: 'event-2', ts });
    if (parsed.type === 'demand.updated') expectTypeOf(parsed.payload).toEqualTypeOf<Demanda>();
  });
});

describe('acervo e metadados', () => {
  it('exige 12 slots únicos e contadores consistentes', () => {
    expect(AcervoGridSchema.parse(grid)).toEqual(grid);
    expect(AcervoGridSchema.safeParse({ ...grid, slots: slots.slice(1) }).success).toBe(false);
    expect(AcervoGridSchema.safeParse({ ...grid, slots: Array.from({ length: 12 }, () => slots[0]) }).success).toBe(false);
    expect(AcervoGridSchema.safeParse({ ...grid, preenchidos: 1 }).success).toBe(false);
    expect(AcervoGridSchema.safeParse({ ...grid, emProducao: 1 }).success).toBe(false);
    expect(AcervoGridSchema.safeParse({ ...grid, slots: slots.map((slot, index) => index === 0 ? { ...slot, preenchido: true } : slot) }).success).toBe(false);
  });
  it('valida os metadados de Van Gogh e a extensão de Monalisa', () => {
    const meta = {
      demandaId: 'DEM-0001', versao: 1, procedimento: 'botox', tipoTemplate: 'antes_depois_1',
      engine: 'mock', promptUsado: 'Retrato editorial.', textos: { headline: 'Cuidado natural', cta: 'Agende', disclaimer: 'Imagem ilustrativa.' },
      aprendizadosAplicados: ['G01'], ajustesCompliance: [], geradoEm: ts,
    };
    expect(ArteMetaSchema.safeParse({ ...meta, ator: 'van_gogh' }).success).toBe(true);
    const monalisa = { ...meta, ator: 'monalisa', origem: 'acervo', coerenciaColecao: { referenciasConsideradas: [], headlinesEvitadas: [] } };
    expect(ArteMetaSchema.safeParse(monalisa).success).toBe(true);
    expect(ArteMetaSchema.safeParse({ ...monalisa, coerenciaColecao: undefined }).success).toBe(false);
  });
  it('distingue aprendizado de Skill e memória', () => {
    expect(LearningSchema.parse(learning)).toEqual(learning);
    expect(LearningSchema.safeParse({ ...learning, template: undefined, escopo: 'global', id: 'G01' }).success).toBe(true);
    expect(LearningSchema.safeParse({ ...learning, template: undefined, escopo: 'cliente:royal_face', id: 'C01', status: 'exemplo' }).success).toBe(true);
    expect(LearningSchema.safeParse({ ...learning, template: undefined }).success).toBe(false);
    expect(LearningSchema.safeParse({ ...learning, escopo: 'global' }).success).toBe(false);
  });
});

describe('requests e erros HTTP', () => {
  it('permite briefing sem procedimento/template para inferência', () => {
    expect(CreateDemandaRequestSchema.parse({ briefing: '  Quero arte sobre lábios.  ' })).toEqual({ briefing: 'Quero arte sobre lábios.' });
    expect(CreateDemandaRequestSchema.safeParse({ briefing: ' ' }).success).toBe(false);
    expect(CreateDemandaRequestSchema.safeParse({ briefing: 'Arte', procedimento: 'labios' }).success).toBe(false);
    expect(CreateDemandaRequestSchema.safeParse({ briefing: 'Arte', origem: 'acervo' }).success).toBe(false);
  });
  it('exige motivo para solicitar ajuste e identifica o revisor', () => {
    expect(FeedbackHumanoSchema.safeParse({ decisao: 'aprovar', revisor: 'AWR' }).success).toBe(true);
    expect(FeedbackHumanoSchema.safeParse({ decisao: 'ajustar', motivo: ' ', revisor: 'AWR' }).success).toBe(false);
    expect(FeedbackHumanoSchema.safeParse({ decisao: 'ajustar', revisor: 'AWR' }).success).toBe(false);
    expect(FeedbackHumanoSchema.safeParse({ decisao: 'aprovar', revisor: '' }).success).toBe(false);
  });
  it('valida o erro público uniforme', () => {
    expect(ApiErrorSchema.parse({ error: { code: 'HOP_LIMIT', message: 'Resete os hops para ajustar.' } }).error.code).toBe('HOP_LIMIT');
    expect(ApiErrorSchema.safeParse({ error: 'falha' }).success).toBe(false);
  });
});

describe('loadConfig', () => {
  it('aplica exatamente os defaults de .env.example', () => {
    expect(loadConfig({})).toEqual({
      IMAGE_ENGINE_MODE: 'mock', AI_MODE: 'mock', CLASSIFIER_PROVIDER: 'openai', MOCK_REJECT_RATE: 0.35,
      JEV_BASE_URL: 'https://api.typesafe.ai', JEV_MODEL: 'jev-latest', JEV_PRICE_INPUT_USD_PER_MTOK: 0.042, JEV_PRICE_OUTPUT_USD_PER_MTOK: 0, USD_BRL: 5.5,
      CLASSIFIER_MODEL: 'gpt-6-luna-decisions', BRIEFING_MODEL: 'gpt-6-luna', IMAGE_MODEL: 'gpt-image-2', REVIEW_MODEL: 'gpt-6-luna',
      FEEDBACK_MODEL: 'gpt-6.1-terra', IMAGE_SIZE: '1080x1350', MAX_HOPS: 5, MAX_DIRECTOR_ATTEMPTS: 3,
      DIRECTOR_TICK_MS: 15000, PRODUCTION_TIMEOUT_MS: 120000, PRODUCAO_MANUAL_VAN_GOGH: true, ACERVO_HEARTBEAT_MS: 30000,
      ACERVO_AUTOFILL: true, PORT: 8787, ACERVO_DIR: './acervo', BRAIN_DIR: './brain', DATA_DIR: './data',
    });
  });
  it('coage números e false sem ler nem alterar env externa', () => {
    const env = Object.freeze({ PORT: '9000', MAX_HOPS: '0', MOCK_REJECT_RATE: '0', ACERVO_AUTOFILL: 'false', AI_MODE: 'openai', CLASSIFIER_PROVIDER: 'jev', IMAGE_SIZE: '1080x1920' });
    const config = loadConfig(env);
    expect(config).toMatchObject({ PORT: 9000, MAX_HOPS: 0, MOCK_REJECT_RATE: 0, ACERVO_AUTOFILL: false, AI_MODE: 'openai', CLASSIFIER_PROVIDER: 'jev', IMAGE_SIZE: '1080x1920' });
    expect(OrchestratorConfigSchema.parse(config)).toEqual(config);
    expect(env.PORT).toBe('9000');
    expect(loadConfig({ ACERVO_AUTOFILL: 'true' }).ACERVO_AUTOFILL).toBe(true);
  });
  it('descarta credenciais e envs alheias também na resposta pública', () => {
    const config = loadConfig({ OPENAI_API_KEY: 'test-only', JEV_API_KEY: 'test-only', PATH: 'test-only' });
    expect(config).not.toHaveProperty('OPENAI_API_KEY');
    expect(config).not.toHaveProperty('JEV_API_KEY');
    expect(config).not.toHaveProperty('PATH');
    expect(GetConfigResponseSchema.parse({ config: { ...config, OPENAI_API_KEY: 'test-only' } }).config).toEqual(config);
  });
  it.each([
    { PORT: '' }, { PORT: '0' }, { PORT: '65536' }, { MAX_HOPS: '-1' }, { MAX_HOPS: '1.5' },
    { MAX_DIRECTOR_ATTEMPTS: '0' }, { DIRECTOR_TICK_MS: '0' }, { PRODUCTION_TIMEOUT_MS: 'abc' },
    { ACERVO_HEARTBEAT_MS: '-10' }, { MOCK_REJECT_RATE: '1.01' }, { MOCK_REJECT_RATE: '-0.1' },
    { ACERVO_AUTOFILL: '0' }, { ACERVO_AUTOFILL: 'yes' }, { AI_MODE: 'real' },
    { CLASSIFIER_PROVIDER: 'other' }, { IMAGE_SIZE: '1024x1024' }, { IMAGE_MODEL: ' ' }, { BRAIN_DIR: '' },
  ])('rejeita configuração inválida %j', env => {
    expect(() => loadConfig(env)).toThrow();
  });
});

it('valida triagem, limites e preços/cotação por env', () => {
  expect(TriagemResponseSchema.parse({ triagem })).toEqual({ triagem });
  for (const override of [{ latenciaMs: -1 }, { procedimento: 'outro' }, { tokens: { entrada: -1, saida: 0 } }, { custo: { usd: -1, brl: 0, cotacaoUsdBrl: 5 } }]) expect(TriagemSchema.safeParse({ ...triagem, ...override }).success).toBe(false);
  for (const texto of ['', 'ab', 'x'.repeat(4001)]) expect(TriagemRequestSchema.safeParse({ texto }).success).toBe(false);
  expect(TriagemRequestSchema.safeParse({ texto: 'botox', extra: true }).success).toBe(false);
  expect(loadConfig({ JEV_PRICE_INPUT_USD_PER_MTOK: '1.2', JEV_PRICE_OUTPUT_USD_PER_MTOK: '0.3', USD_BRL: '5.8' })).toMatchObject({ JEV_PRICE_INPUT_USD_PER_MTOK: 1.2, JEV_PRICE_OUTPUT_USD_PER_MTOK: 0.3, USD_BRL: 5.8 });
  for (const env of [{ USD_BRL: '0' }, { JEV_PRICE_INPUT_USD_PER_MTOK: '-1' }, { JEV_PRICE_OUTPUT_USD_PER_MTOK: '' }]) expect(() => loadConfig(env)).toThrow();
});
