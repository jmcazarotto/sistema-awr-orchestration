import { z } from 'zod';

// Contratos de domínio e transporte. Não importar server, web ou orchestrator aqui.
export const PROCEDIMENTOS = ['preenchimento_labial', 'botox', 'fios_sustentacao'] as const;
export const ProcedimentoSchema = z.enum(PROCEDIMENTOS);
export type Procedimento = z.infer<typeof ProcedimentoSchema>;
export const PROCEDIMENTO_LABELS = {
  preenchimento_labial: 'Preenchimento Labial',
  botox: 'Toxina Botulínica (Botox)',
  fios_sustentacao: 'Fios de Sustentação',
} as const satisfies Record<Procedimento, string>;

export const TIPOS_TEMPLATE = ['antes_depois_1', 'antes_depois_2', 'banco_imagem_1', 'banco_imagem_2'] as const;
export const TipoTemplateSchema = z.enum(TIPOS_TEMPLATE);
export type TipoTemplate = z.infer<typeof TipoTemplateSchema>;
export const ACTOR_IDS = ['art_director', 'van_gogh', 'monalisa'] as const;
export const ActorIdSchema = z.enum(ACTOR_IDS);
export type ActorId = z.infer<typeof ActorIdSchema>;
export const CriadorIdSchema = z.enum(['van_gogh', 'monalisa']);
export type CriadorId = z.infer<typeof CriadorIdSchema>;
export const ACTOR_STATUSES = ['idle', 'thinking', 'generating', 'reviewing'] as const;
export const ActorStatusSchema = z.enum(ACTOR_STATUSES);
export type ActorStatus = z.infer<typeof ActorStatusSchema>;
export const ACTION_TYPES = [
  'DEMANDA_CLASSIFICADA', 'PREENCHER_ACERVO', 'PRODUZIR_ARTE',
  'ARTE_ENTREGUE', 'AJUSTAR_ARTE', 'FEEDBACK_HUMANO',
] as const;
export const ActionTypeSchema = z.enum(ACTION_TYPES);
export type ActionType = z.infer<typeof ActionTypeSchema>;
export const ESTADOS_DEMANDA = [
  'CRIADA', 'CLASSIFICADA', 'EM_PRODUCAO', 'EM_REVISAO_DIRETOR', 'EM_AJUSTE_IA',
  'AGUARDANDO_APROVACAO_AWR', 'REPROVADA_HUMANO', 'APROVADA_SALVA_NO_ACERVO',
] as const;
export const EstadoDemandaSchema = z.enum(ESTADOS_DEMANDA);
export type EstadoDemanda = z.infer<typeof EstadoDemandaSchema>;

/** Somente AGENTS.md §3. A escalada por hop_limit (§4) é tratada pelo bus, sem entregar a ordem. */
export const TRANSICOES_VALIDAS = {
  CRIADA: ['CLASSIFICADA'],
  CLASSIFICADA: ['EM_PRODUCAO'],
  EM_PRODUCAO: ['EM_REVISAO_DIRETOR'],
  EM_REVISAO_DIRETOR: ['EM_AJUSTE_IA', 'AGUARDANDO_APROVACAO_AWR'],
  EM_AJUSTE_IA: ['EM_REVISAO_DIRETOR'],
  AGUARDANDO_APROVACAO_AWR: ['APROVADA_SALVA_NO_ACERVO', 'REPROVADA_HUMANO'],
  REPROVADA_HUMANO: ['EM_PRODUCAO'],
  APROVADA_SALVA_NO_ACERVO: [],
} as const satisfies Record<EstadoDemanda, readonly EstadoDemanda[]>;

export function transicaoValida(de: EstadoDemanda, para: EstadoDemanda): boolean {
  const destinos: readonly EstadoDemanda[] = TRANSICOES_VALIDAS[de];
  return destinos.includes(para);
}

export const DemandaIdSchema = z.string().regex(/^DEM-\d{4,}$/, 'ID esperado: DEM-0001');
export const TimestampSchema = z.iso.datetime({ offset: true });
const TextoSchema = z.string().trim().min(1);
const ContadorSchema = z.number().int().nonnegative();
export const EngineModeSchema = z.enum(['mock', 'openai']);
export type EngineMode = z.infer<typeof EngineModeSchema>;
export const OrigemDemandaSchema = z.enum(['cliente', 'acervo']);
export type OrigemDemanda = z.infer<typeof OrigemDemandaSchema>;
export const MotivoEscaladaSchema = z.enum(['hop_limit', 'director_attempts']);
export type MotivoEscalada = z.infer<typeof MotivoEscaladaSchema>;

export const ClassificacaoSchema = z.object({
  procedimento: ProcedimentoSchema,
  agenteDesignado: CriadorIdSchema,
  tipoTemplate: TipoTemplateSchema,
  skillFile: TextoSchema,
  confianca: z.number().min(0).max(1),
});
export type Classificacao = z.infer<typeof ClassificacaoSchema>;

/** Triagem por texto livre (caixa única): empresa + procedimento + tipo de arte, com métricas do classificador. */
export const FAMILIAS_ARTE = ['antes_depois', 'banco_imagem'] as const;
export const FamiliaArteSchema = z.enum(FAMILIAS_ARTE);
export type FamiliaArte = z.infer<typeof FamiliaArteSchema>;
export const TriagemProviderSchema = z.enum(['jev', 'openai', 'mock']);
export type TriagemProvider = z.infer<typeof TriagemProviderSchema>;
export const TriagemEmpresaSchema = z.object({
  /** id do cliente em brain/clientes.json; null quando o texto cita uma empresa não cadastrada ou nenhuma. */
  id: z.string().min(1).nullable(),
  /** Nome para exibição (cadastrado ou extraído do texto); null quando não identificada. */
  nome: z.string().min(1).nullable(),
  cadastrada: z.boolean(),
  confianca: z.number().min(0).max(1),
  /** Rede/franqueadora cadastrada (ex.: Royal Face). */
  rede: z.object({ id: z.string().min(1), nome: z.string().min(1) }).nullable().default(null),
  /** Unidade citada no texto (`nome` = cidade/rótulo da unidade, ex.: "Maringá"); `cadastrada=false` quando a rede é conhecida mas a unidade ainda não está em brain/clientes.json. */
  unidade: z.object({ id: z.string().min(1).nullable(), nome: z.string().min(1), cadastrada: z.boolean() }).nullable().default(null),
  /** cadastro = nome citado literalmente (confiança 1) · ia = escolhido pelo classificador · extracao = nome próprio não cadastrado. */
  metodo: z.enum(['cadastro', 'ia', 'extracao', 'nenhum']).default('nenhum'),
});
/** Informação do texto da demanda que vai para o agente criador como briefing da arte final. */
export const BRIEFING_TIPOS = ['preco', 'promocao', 'chamada_cta', 'headline', 'texto_literal', 'tom_estilo', 'publico', 'prazo_data', 'data_entrega', 'contato', 'outro_briefing'] as const;
export const BriefingTipoSchema = z.enum(BRIEFING_TIPOS);
export type BriefingTipo = z.infer<typeof BriefingTipoSchema>;
export const BriefingItemSchema = z.object({
  /** Trecho original do texto. */
  texto: z.string().min(1),
  tipo: BriefingTipoSchema,
  /** Valor normalizado quando reconhecido (ex.: "6x de R$ 99,90"). */
  valor: z.string().min(1).optional(),
  confianca: z.number().min(0).max(1),
  metodo: z.enum(['regra', 'ia', 'heuristica']),
});
export type BriefingItem = z.infer<typeof BriefingItemSchema>;

export const TriagemSchema = z.object({
  id: z.string().min(1),
  texto: z.string().min(1),
  empresa: TriagemEmpresaSchema,
  procedimento: ProcedimentoSchema,
  procedimentoConfianca: z.number().min(0).max(1),
  tipoTemplate: TipoTemplateSchema,
  familiaArte: FamiliaArteSchema,
  tipoTemplateConfianca: z.number().min(0).max(1),
  /** Agente de arte: van_gogh = demanda de cliente/unidade · monalisa = abastecimento rotineiro do acervo. */
  agente: CriadorIdSchema.default('van_gogh'),
  agenteConfianca: z.number().min(0).max(1).default(0),
  /** Por que esse agente (regra aplicada ou classificador). */
  agenteMotivo: z.string().default(''),
  /** true quando o agente foi decidido por regra (sinal explícito no texto); a distribuição abaixo continua sendo a do classificador. */
  agenteRegra: z.boolean().default(false),
  /** Probabilidade de cada opção segundo o classificador (soma ≈ 1 por pergunta). Os campos *Confianca acima são a certeza do modelo na escolha. */
  /** Briefing da arte extraído do texto (vai para o Van Gogh/Monalisa). */
  briefing: z.array(BriefingItemSchema).default([]),
  probabilidades: z.object({
    procedimento: z.record(z.string(), z.number().min(0).max(1)),
    tipoTemplate: z.record(z.string(), z.number().min(0).max(1)),
    agente: z.record(z.string(), z.number().min(0).max(1)),
    empresa: z.record(z.string(), z.number().min(0).max(1)).optional(),
  }).optional(),
  provider: TriagemProviderSchema,
  modelo: z.string().min(1),
  /** Latência REAL da chamada ao classificador (não inclui atrasos cosméticos da UI). */
  latenciaMs: z.number().nonnegative(),
  tokens: z.object({ entrada: z.number().int().nonnegative(), saida: z.number().int().nonnegative() }),
  custo: z.object({ usd: z.number().nonnegative(), brl: z.number().nonnegative(), cotacaoUsdBrl: z.number().positive() }),
  criadoEm: z.iso.datetime(),
});
export type Triagem = z.infer<typeof TriagemSchema>;

export const SeveridadeSchema = z.enum(['critico', 'normal']);
export type Severidade = z.infer<typeof SeveridadeSchema>;
export const RubricaIdSchema = z.string().regex(/^[RLGC]\d{2,}$/);
export const RubricaItemSchema = z.object({
  id: RubricaIdSchema,
  severidade: SeveridadeSchema,
  pergunta: TextoSchema,
});
export type RubricaItem = z.infer<typeof RubricaItemSchema>;
export const ReviewItemSchema = z.object({
  id: RubricaIdSchema,
  severidade: SeveridadeSchema,
  resposta: z.enum(['sim', 'nao']),
  evidencia: TextoSchema,
});
export type ReviewItem = z.infer<typeof ReviewItemSchema>;
export const FeedbackDiretorSchema = z.object({
  resumo: z.string(),
  correcoes: z.array(z.object({ itemId: RubricaIdSchema, instrucao: TextoSchema })).max(3),
});
export type FeedbackDiretor = z.infer<typeof FeedbackDiretorSchema>;
export const ReviewResultSchema = z.object({
  aprovada: z.boolean(),
  score: z.number().min(0).max(1),
  itens: z.array(ReviewItemSchema).min(1),
  feedback: FeedbackDiretorSchema,
});
export type ReviewResult = z.infer<typeof ReviewResultSchema>;

/** Ajuste humano exige motivo; o estado/hop da demanda é validado pelo motor (409). */
export const FeedbackHumanoSchema = z.discriminatedUnion('decisao', [
  z.object({ decisao: z.literal('aprovar'), motivo: TextoSchema.optional(), revisor: TextoSchema }),
  z.object({ decisao: z.literal('ajustar'), motivo: TextoSchema, revisor: TextoSchema }),
]);
export type FeedbackHumano = z.infer<typeof FeedbackHumanoSchema>;

const envelopeFields = {
  id: TextoSchema,
  demandaId: DemandaIdSchema,
  hop: ContadorSchema,
  createdAt: TimestampSchema,
  causationId: TextoSchema.optional(),
};
export const DemandaClassificadaPayloadSchema = z.object({ classificacao: ClassificacaoSchema });
export const PreencherAcervoPayloadSchema = z.object({ procedimento: ProcedimentoSchema, tipoTemplate: TipoTemplateSchema });
export const ProduzirArtePayloadSchema = z.object({
  procedimento: ProcedimentoSchema,
  tipoTemplate: TipoTemplateSchema,
  skillFile: TextoSchema,
  briefing: TextoSchema,
});
export const ArteEntreguePayloadSchema = z.object({
  stagingPath: TextoSchema,
  versao: z.number().int().positive(),
  promptUsado: TextoSchema,
  engine: EngineModeSchema,
});
export const AjustarArtePayloadSchema = z.object({
  feedbackDiretor: FeedbackDiretorSchema,
  versaoAnterior: z.number().int().positive(),
});
/** Rotas from/to também são validadas, conforme AGENTS.md §2. */
export const InboxMessageSchema = z.discriminatedUnion('action', [
  z.object({ ...envelopeFields, action: z.literal('DEMANDA_CLASSIFICADA'), from: z.literal('system'), to: z.literal('art_director'), payload: DemandaClassificadaPayloadSchema }),
  z.object({ ...envelopeFields, action: z.literal('PREENCHER_ACERVO'), from: z.literal('acervo_watcher'), to: z.literal('art_director'), payload: PreencherAcervoPayloadSchema }),
  z.object({ ...envelopeFields, action: z.literal('PRODUZIR_ARTE'), from: z.literal('art_director'), to: CriadorIdSchema, payload: ProduzirArtePayloadSchema }),
  z.object({ ...envelopeFields, action: z.literal('ARTE_ENTREGUE'), from: CriadorIdSchema, to: z.literal('art_director'), payload: ArteEntreguePayloadSchema }),
  z.object({ ...envelopeFields, action: z.literal('AJUSTAR_ARTE'), from: z.literal('art_director'), to: CriadorIdSchema, payload: AjustarArtePayloadSchema }),
  z.object({ ...envelopeFields, action: z.literal('FEEDBACK_HUMANO'), from: z.literal('awr_human'), to: z.literal('art_director'), payload: FeedbackHumanoSchema }),
]);
type InboxMessageUnion = z.infer<typeof InboxMessageSchema>;
export type InboxMessage<A extends ActionType = ActionType> = Extract<InboxMessageUnion, { action: A }>;
export type PayloadOf<A extends ActionType> = InboxMessage<A>['payload'];

/** Horários do Markdown podem ter precisão de minuto; o parser normaliza para ISO-8601. */
export const LearningSchema = z.object({
  id: z.string().regex(/^[LGC]\d{2,}$/),
  createdAt: TimestampSchema,
  procedimento: ProcedimentoSchema.optional(),
  template: TipoTemplateSchema.optional(),
  escopo: z.union([
    z.literal('global'),
    z.templateLiteral(['procedimento:', ProcedimentoSchema]),
    z.templateLiteral(['template:', TipoTemplateSchema]),
    z.string().regex(/^cliente:[a-z0-9_]+$/),
  ]).optional(),
  fonte: z.enum(['awr_humano', 'diretor_arte', 'seed']),
  demandaId: DemandaIdSchema.optional(),
  regra: TextoSchema,
  motivoOriginal: TextoSchema,
  status: z.enum(['ativo', 'inativo', 'exemplo']),
  severidade: SeveridadeSchema.optional(),
}).refine(value => (value.template !== undefined) !== (value.escopo !== undefined), {
  message: 'Informar exatamente um de template (Skill) ou escopo (memória)',
});
export type Learning = z.infer<typeof LearningSchema>;

const arteMetaFields = {
  demandaId: DemandaIdSchema,
  versao: z.number().int().positive(),
  procedimento: ProcedimentoSchema,
  tipoTemplate: TipoTemplateSchema,
  engine: EngineModeSchema,
  promptUsado: TextoSchema,
  textos: z.object({ headline: z.string(), cta: z.string(), disclaimer: TextoSchema }),
  aprendizadosAplicados: z.array(z.string().regex(/^[LGC]\d{2,}$/)),
  ajustesCompliance: z.array(TextoSchema),
  ilustrativo: z.boolean().optional(),
  geradoEm: TimestampSchema,
};
export const ArteMetaSchema = z.discriminatedUnion('ator', [
  z.object({ ...arteMetaFields, ator: z.literal('van_gogh'), origem: z.literal('cliente').optional() }),
  z.object({
    ...arteMetaFields,
    ator: z.literal('monalisa'),
    origem: z.literal('acervo'),
    coerenciaColecao: z.object({ referenciasConsideradas: z.array(TextoSchema), headlinesEvitadas: z.array(TextoSchema) }),
  }),
]);
export type ArteMeta = z.infer<typeof ArteMetaSchema>;

/** O motivo hop_limit identifica a exceção operacional explícita do §4 à tabela do §3. */
export const TransicaoDemandaSchema = z.object({
  de: EstadoDemandaSchema,
  para: EstadoDemandaSchema,
  ts: TimestampSchema,
  motivo: TextoSchema.optional(),
  messageId: TextoSchema.optional(),
}).refine(value => transicaoValida(value.de, value.para)
  || (value.motivo === 'hop_limit' && value.para === 'AGUARDANDO_APROVACAO_AWR'
    && value.de !== 'APROVADA_SALVA_NO_ACERVO' && value.de !== 'AGUARDANDO_APROVACAO_AWR'), {
  message: 'Transição de demanda inválida',
});
export type TransicaoDemanda = z.infer<typeof TransicaoDemandaSchema>;
export const DemandaSchema = z.object({
  id: DemandaIdSchema,
  origem: OrigemDemandaSchema,
  briefing: TextoSchema,
  clinicaNome: TextoSchema.optional(),
  headline: TextoSchema.optional(),
  cta: TextoSchema.optional(),
  estado: EstadoDemandaSchema,
  classificacao: ClassificacaoSchema.nullable(),
  criadorAtual: CriadorIdSchema.nullable(),
  hop: ContadorSchema,
  tentativaDiretor: ContadorSchema,
  versaoAtual: ContadorSchema,
  stagingPath: TextoSchema.optional(),
  escalada: z.boolean(),
  motivoEscalada: MotivoEscaladaSchema.optional(),
  ultimoReview: ReviewResultSchema.optional(),
  historico: z.array(TransicaoDemandaSchema),
  createdAt: TimestampSchema,
  updatedAt: TimestampSchema,
  finalPath: TextoSchema.optional(),
});
export type Demanda = z.infer<typeof DemandaSchema>;

export const AcervoSlotSchema = z.object({
  procedimento: ProcedimentoSchema,
  tipoTemplate: TipoTemplateSchema,
  preenchido: z.boolean(),
  arquivos: z.array(TextoSchema),
  demandaAbertaId: DemandaIdSchema.optional(),
}).refine(slot => slot.preenchido === (slot.arquivos.length > 0), { message: 'preenchido deve refletir arquivos' });
export type AcervoSlot = z.infer<typeof AcervoSlotSchema>;
export const AcervoGridSchema = z.object({
  slots: z.array(AcervoSlotSchema).length(12),
  total: z.literal(12),
  preenchidos: ContadorSchema.max(12),
  vazios: ContadorSchema.max(12),
  emProducao: ContadorSchema.max(12),
}).refine(grid => new Set(grid.slots.map(slot => `${slot.procedimento}:${slot.tipoTemplate}`)).size === 12
  && grid.preenchidos === grid.slots.filter(slot => slot.preenchido).length
  && grid.vazios === 12 - grid.preenchidos
  && grid.emProducao === grid.slots.filter(slot => slot.demandaAbertaId !== undefined).length, {
  message: 'Grade deve conter os 12 pares únicos e contadores consistentes',
});
export type AcervoGrid = z.infer<typeof AcervoGridSchema>;

export const SSE_EVENT_TYPES = ['actor.status', 'message.sent', 'demand.updated', 'review.result', 'acervo.updated', 'brain.learning', 'log', 'triagem.started', 'triagem.result'] as const;
export const SSE_HEARTBEAT_MS = 15000;
export const SSE_RETRY_MS = 3000;
export const SSE_HISTORY_LIMIT = 1000;
const sseOptions = [
  z.object({ type: z.literal('actor.status'), payload: z.object({ actorId: ActorIdSchema, status: ActorStatusSchema, demandaId: DemandaIdSchema.nullable() }) }),
  z.object({ type: z.literal('message.sent'), payload: InboxMessageSchema }),
  z.object({ type: z.literal('demand.updated'), payload: DemandaSchema }),
  z.object({ type: z.literal('review.result'), payload: z.object({ demandaId: DemandaIdSchema, versao: z.number().int().positive(), tentativaDiretor: z.number().int().positive(), review: ReviewResultSchema }) }),
  z.object({ type: z.literal('acervo.updated'), payload: AcervoGridSchema }),
  z.object({ type: z.literal('brain.learning'), payload: z.object({ skillFile: TextoSchema, learning: LearningSchema }) }),
  z.object({ type: z.literal('log'), payload: z.object({ level: z.enum(['info', 'warn', 'error']), message: TextoSchema, demandaId: DemandaIdSchema.optional(), actorId: ActorIdSchema.optional() }) }),
  z.object({ type: z.literal('triagem.started'), payload: z.object({ triagemId: TextoSchema, texto: TextoSchema, provider: TriagemProviderSchema, modelo: TextoSchema }) }),
  z.object({ type: z.literal('triagem.result'), payload: TriagemSchema }),
] as const;
export const SseEventSchema = z.discriminatedUnion('type', sseOptions);
export type SseEvent = z.infer<typeof SseEventSchema>;
/** O JSON de data: inclui type/payload e os campos de replay id/ts. */
const sseEnvelopeFields = { id: TextoSchema, ts: TimestampSchema };
export const SseEnvelopeSchema = z.discriminatedUnion('type', [
  sseOptions[0].extend(sseEnvelopeFields),
  sseOptions[1].extend(sseEnvelopeFields),
  sseOptions[2].extend(sseEnvelopeFields),
  sseOptions[3].extend(sseEnvelopeFields),
  sseOptions[4].extend(sseEnvelopeFields),
  sseOptions[5].extend(sseEnvelopeFields),
  sseOptions[6].extend(sseEnvelopeFields),
  sseOptions[7].extend(sseEnvelopeFields),
  sseOptions[8].extend(sseEnvelopeFields),
]);
export type SseEnvelope = z.infer<typeof SseEnvelopeSchema>;

/** Configuração pública; chaves de API nunca fazem parte deste objeto. */
export const OrchestratorConfigSchema = z.object({
  IMAGE_ENGINE_MODE: EngineModeSchema.default('mock'),
  AI_MODE: EngineModeSchema.default('mock'),
  CLASSIFIER_PROVIDER: z.enum(['openai', 'jev']).default('openai'),
  MOCK_REJECT_RATE: z.number().min(0).max(1).default(0.35),
  /** Classificador Jev (TypeSafe AI). A chave JEV_API_KEY NUNCA entra aqui: é lida só pelo motor via env/dependência. */
  JEV_BASE_URL: TextoSchema.default('https://api.typesafe.ai'),
  JEV_MODEL: TextoSchema.default('jev-latest'),
  /** Preço em USD por 1 milhão de tokens (configurável; verifique o contrato da conta). */
  JEV_PRICE_INPUT_USD_PER_MTOK: z.number().nonnegative().default(0.042),
  JEV_PRICE_OUTPUT_USD_PER_MTOK: z.number().nonnegative().default(0),
  /** Cotação usada para exibir custos em reais. */
  USD_BRL: z.number().positive().default(5.5),
  CLASSIFIER_MODEL: TextoSchema.default('gpt-6-luna-decisions'),
  IMAGE_MODEL: TextoSchema.default('gpt-image-2'),
  REVIEW_MODEL: TextoSchema.default('gpt-6-luna-decisions'),
  FEEDBACK_MODEL: TextoSchema.default('gpt-6.1-terra'),
  IMAGE_SIZE: z.enum(['1080x1350', '1080x1920']).default('1080x1350'),
  MAX_HOPS: ContadorSchema.default(5),
  MAX_DIRECTOR_ATTEMPTS: z.number().int().positive().default(3),
  DIRECTOR_TICK_MS: z.number().int().positive().default(15000),
  PRODUCTION_TIMEOUT_MS: z.number().int().positive().default(120000),
  ACERVO_HEARTBEAT_MS: z.number().int().positive().default(30000),
  ACERVO_AUTOFILL: z.boolean().default(true),
  PORT: z.number().int().min(1).max(65535).default(8787),
  ACERVO_DIR: TextoSchema.default('./acervo'),
  BRAIN_DIR: TextoSchema.default('./brain'),
  DATA_DIR: TextoSchema.default('./data'),
});
export type OrchestratorConfig = z.infer<typeof OrchestratorConfigSchema>;

// HTTP: responses têm wrappers explícitos; o motor retorna os valores de domínio.
export const SubmitDemandInputSchema = z.strictObject({
  procedimento: ProcedimentoSchema.optional(),
  tipoTemplate: TipoTemplateSchema.optional(),
  briefing: TextoSchema,
  clinicaNome: TextoSchema.optional(),
  headline: TextoSchema.optional(),
  cta: TextoSchema.optional(),
});
export type SubmitDemandInput = z.infer<typeof SubmitDemandInputSchema>;
export const CreateDemandaRequestSchema = SubmitDemandInputSchema;
export type CreateDemandaRequest = z.infer<typeof CreateDemandaRequestSchema>;
export const CreateDemandaResponseSchema = z.object({ demanda: DemandaSchema });
export type CreateDemandaResponse = z.infer<typeof CreateDemandaResponseSchema>;
export const ListDemandasResponseSchema = z.object({ demandas: z.array(DemandaSchema) });
export type ListDemandasResponse = z.infer<typeof ListDemandasResponseSchema>;
export const GetDemandaResponseSchema = z.object({ demanda: DemandaSchema, messages: z.array(InboxMessageSchema) });
export type GetDemandaResponse = z.infer<typeof GetDemandaResponseSchema>;
// .strict() em cada variante impede que revisor/decisao válidos escondam campos desconhecidos.
export const HumanReviewRequestSchema = z.discriminatedUnion('decisao', [
  FeedbackHumanoSchema.options[0].strict(),
  FeedbackHumanoSchema.options[1].strict(),
]);
export type HumanReviewRequest = z.infer<typeof HumanReviewRequestSchema>;
export const HumanReviewResponseSchema = CreateDemandaResponseSchema;
export type HumanReviewResponse = z.infer<typeof HumanReviewResponseSchema>;
export const ResetHopsResponseSchema = CreateDemandaResponseSchema;
export type ResetHopsResponse = z.infer<typeof ResetHopsResponseSchema>;
export const TriagemRequestSchema = z.strictObject({ texto: z.string().trim().min(3).max(4000) });
export type TriagemRequest = z.infer<typeof TriagemRequestSchema>;
export const TriagemResponseSchema = z.object({ triagem: TriagemSchema });
export type TriagemResponse = z.infer<typeof TriagemResponseSchema>;
export const GetAcervoResponseSchema = AcervoGridSchema;
export type GetAcervoResponse = z.infer<typeof GetAcervoResponseSchema>;
export const FillAcervoRequestSchema = z.strictObject({ procedimento: ProcedimentoSchema.optional(), tipoTemplate: TipoTemplateSchema.optional() });
export type FillAcervoRequest = z.infer<typeof FillAcervoRequestSchema>;
export const FillAcervoResponseSchema = z.object({ accepted: z.literal(true) });
export type FillAcervoResponse = z.infer<typeof FillAcervoResponseSchema>;
export const MessagesFilterSchema = z.strictObject({ demandaId: DemandaIdSchema.optional() });
export type MessagesFilter = z.infer<typeof MessagesFilterSchema>;
export const ListMessagesQuerySchema = MessagesFilterSchema;
export type ListMessagesQuery = z.infer<typeof ListMessagesQuerySchema>;
export const ListMessagesResponseSchema = z.object({ messages: z.array(InboxMessageSchema) });
export type ListMessagesResponse = z.infer<typeof ListMessagesResponseSchema>;
export const DemandaParamsSchema = z.strictObject({ id: DemandaIdSchema });
export type DemandaParams = z.infer<typeof DemandaParamsSchema>;
export const SkillIdSchema = z.enum([...PROCEDIMENTOS, 'template_composition']);
export type SkillId = z.infer<typeof SkillIdSchema>;
export const SkillParamsSchema = z.strictObject({ id: SkillIdSchema });
export type SkillParams = z.infer<typeof SkillParamsSchema>;
export const SkillSummarySchema = z.object({
  id: SkillIdSchema,
  label: TextoSchema,
  skillFile: TextoSchema,
  procedimento: ProcedimentoSchema.optional(),
  versao: z.number().int().positive(),
  atualizadoEm: z.iso.date(),
});
export type SkillSummary = z.infer<typeof SkillSummarySchema>;
export const SkillDetailSchema = SkillSummarySchema.extend({ conteudo: z.string(), rubrica: z.array(RubricaItemSchema), aprendizados: z.array(LearningSchema) });
export type SkillDetail = z.infer<typeof SkillDetailSchema>;
export const ListSkillsResponseSchema = z.object({ skills: z.array(SkillSummarySchema) });
export type ListSkillsResponse = z.infer<typeof ListSkillsResponseSchema>;
export const GetSkillResponseSchema = z.object({ skill: SkillDetailSchema });
export type GetSkillResponse = z.infer<typeof GetSkillResponseSchema>;
export const GetConfigResponseSchema = z.object({ config: OrchestratorConfigSchema });
export type GetConfigResponse = z.infer<typeof GetConfigResponseSchema>;
export const HealthResponseSchema = z.object({ status: z.literal('ok'), ts: TimestampSchema });
export type HealthResponse = z.infer<typeof HealthResponseSchema>;
export const API_ERROR_CODES = ['VALIDATION_ERROR', 'NOT_FOUND', 'INVALID_TRANSITION', 'HOP_LIMIT', 'UPSTREAM_ERROR', 'INTERNAL_ERROR'] as const;
export const ApiErrorCodeSchema = z.enum(API_ERROR_CODES);
export type ApiErrorCode = z.infer<typeof ApiErrorCodeSchema>;
export const ApiErrorSchema = z.object({ error: z.object({ code: ApiErrorCodeSchema, message: TextoSchema }) });
export type ApiError = z.infer<typeof ApiErrorSchema>;
export const EventsHeadersSchema = z.object({ 'last-event-id': TextoSchema.optional() });
export type EventsHeaders = z.infer<typeof EventsHeadersSchema>;
export const EmptyRequestSchema = z.strictObject({});
export type EmptyRequest = z.infer<typeof EmptyRequestSchema>;

/* ───────── Empresas (clientes) e Templates por empresa ───────── */
export const EmpresaIdSchema = z.string().regex(/^[a-z0-9_]+$/);
export const UnidadeEmpresaSchema = z.object({
  id: EmpresaIdSchema, nome: z.string().trim().min(1), cidade: z.string().trim().min(1),
  uf: z.string().trim().length(2).optional(), aliases: z.array(z.string().trim().min(1)).default([]),
});
export type UnidadeEmpresa = z.infer<typeof UnidadeEmpresaSchema>;
/** Cliente AWR (rede/franquia ou independente). Fonte: brain/clientes.json. */
export const EmpresaSchema = z.object({
  id: EmpresaIdSchema,
  nome: z.string().trim().min(1),
  tipo: z.enum(['franquia', 'independente']).default('independente'),
  aliases: z.array(z.string().trim().min(1)).default([]),
  unidades: z.array(UnidadeEmpresaSchema).default([]),
  /** Procedimentos que a empresa vende (subconjunto dos literais oficiais). */
  procedimentos: z.array(ProcedimentoSchema).default([...PROCEDIMENTOS]),
  /** Caminho público da logo (servido em /acervo/*), ex.: "_marcas/royal_face/logo.svg". */
  logo: z.string().min(1).nullable().default(null),
  /** Paleta da marca (hex). */
  cores: z.object({ primaria: z.string(), secundaria: z.string(), texto: z.string() })
    .default({ primaria: '#c9a45c', secundaria: '#3f3d3b', texto: '#ffffff' }),
});
export type Empresa = z.infer<typeof EmpresaSchema>;
export const EmpresaInputSchema = EmpresaSchema.omit({ logo: true }).extend({ logo: z.string().min(1).nullable().optional() });
export type EmpresaInput = z.infer<typeof EmpresaInputSchema>;

/** Tipos de elemento posicionáveis no editor de template (canvas 2D). */
export const ELEMENTO_TIPOS = ['foto_antes', 'foto_depois', 'foto_principal', 'titulo', 'subtitulo', 'destaque', 'preco', 'logo', 'texto', 'forma'] as const;
export const ElementoTipoSchema = z.enum(ELEMENTO_TIPOS);
export type ElementoTipo = z.infer<typeof ElementoTipoSchema>;
export const ElementoEstiloSchema = z.object({
  fonte: z.enum(['serif_display', 'sans_black', 'sans']).default('sans'),
  tamanho: z.number().positive().default(48),
  peso: z.number().int().min(100).max(900).default(700),
  italico: z.boolean().default(false),
  cor: z.string().default('#ffffff'),
  alinhamento: z.enum(['esquerda', 'centro', 'direita']).default('centro'),
  /** Fundo do elemento (cor ou gradiente CSS-like "linear:#a,#b"); null = transparente. */
  fundo: z.string().nullable().default(null),
  raio: z.number().nonnegative().default(0),
  borda: z.object({ cor: z.string(), largura: z.number().nonnegative() }).nullable().default(null),
  sombra: z.boolean().default(false),
  opacidade: z.number().min(0).max(1).default(1),
  caixaAlta: z.boolean().default(false),
});
export type ElementoEstilo = z.infer<typeof ElementoEstiloSchema>;
/** Coordenadas em px do canvas do template (origem no canto superior esquerdo). */
export const ElementoTemplateSchema = z.object({
  id: z.string().min(1),
  tipo: ElementoTipoSchema,
  rotulo: z.string().min(1),
  x: z.number(), y: z.number(), w: z.number().positive(), h: z.number().positive(),
  rotacao: z.number().default(0),
  z: z.number().int().default(0),
  bloqueado: z.boolean().default(false),
  /** Texto placeholder (títulos/preço) — pode conter {{procedimento}}, {{preco}}, {{parcelas}}. */
  conteudo: z.string().default(''),
  estilo: ElementoEstiloSchema.default(ElementoEstiloSchema.parse({})),
});
export type ElementoTemplate = z.infer<typeof ElementoTemplateSchema>;
export const TemplateArteSchema = z.object({
  /** ex.: "royal_face__preenchimento_labial__antes_depois_1" */
  id: z.string().regex(/^[a-z0-9_]+$/),
  empresaId: EmpresaIdSchema,
  procedimento: ProcedimentoSchema,
  familia: FamiliaArteSchema,
  /** Slot oficial do template (antes_depois_1|2, banco_imagem_1|2) — 2 por família. */
  tipoTemplate: TipoTemplateSchema,
  nome: z.string().trim().min(1),
  canvas: z.object({ largura: z.number().int().positive(), altura: z.number().int().positive() }).default({ largura: 1080, altura: 1350 }),
  /** Fundo do canvas: cor sólida ou "linear:#topo,#base". */
  fundo: z.string().default('linear:#3f3d3b,#8a6f4e'),
  elementos: z.array(ElementoTemplateSchema),
  atualizadoEm: z.iso.datetime(),
}).refine(t => t.tipoTemplate.startsWith(t.familia), 'tipoTemplate não pertence à família');
export type TemplateArte = z.infer<typeof TemplateArteSchema>;
export const templateId = (empresaId: string, procedimento: Procedimento, tipoTemplate: TipoTemplate) => `${empresaId}__${procedimento}__${tipoTemplate}`;

export const ListEmpresasResponseSchema = z.object({ empresas: z.array(EmpresaSchema) });
export const EmpresaResponseSchema = z.object({ empresa: EmpresaSchema });
export const TemplatesQuerySchema = z.object({ empresaId: EmpresaIdSchema.optional(), procedimento: ProcedimentoSchema.optional(), familia: FamiliaArteSchema.optional() });
export type TemplatesQuery = z.infer<typeof TemplatesQuerySchema>;
export const ListTemplatesResponseSchema = z.object({ templates: z.array(TemplateArteSchema) });
export const TemplateResponseSchema = z.object({ template: TemplateArteSchema });
/** PUT /api/templates/:id — atualizadoEm é definido pelo servidor. */
export const SaveTemplateRequestSchema = z.object({ nome: z.string().trim().min(1), fundo: z.string(), elementos: z.array(ElementoTemplateSchema) });
export type SaveTemplateRequest = z.infer<typeof SaveTemplateRequestSchema>;

export interface EventBusPublic {
  /** Listener síncrono; erros do consumidor não devem interromper o motor. */
  subscribe(listener: (event: SseEnvelope) => void): () => void;
  /** Últimos n eventos, em ordem de publicação. */
  history(n: number): SseEnvelope[];
}

/** API headless. Listagens são snapshots, sem dependência de transporte HTTP. */
export interface Orchestrator {
  readonly bus: EventBusPublic;
  submitDemand(input: SubmitDemandInput): Promise<Demanda>;
  humanReview(demandaId: string, feedback: FeedbackHumano): Promise<Demanda>;
  /** Triagem de texto livre (empresa/procedimento/tipo de arte). NÃO cria demanda nem inicia produção. */
  triar(texto: string): Promise<Triagem>;
  readonly acervo: {
    grid(): Promise<AcervoGrid>;
    fill(procedimento?: Procedimento, tipoTemplate?: TipoTemplate): Promise<void>;
  };
  listDemandas(): Demanda[];
  getDemanda(id: string): Demanda | undefined;
  listMessages(filtro?: MessagesFilter): InboxMessage[];
  resetHops(demandaId: string): Promise<Demanda>;
  readonly empresas: {
    list(): Promise<Empresa[]>;
    get(id: string): Promise<Empresa | undefined>;
    upsert(input: EmpresaInput): Promise<Empresa>;
    setLogo(id: string, arquivo: { nome: string; dados: Buffer }): Promise<Empresa>;
  };
  readonly templates: {
    list(filtro?: TemplatesQuery): Promise<TemplateArte[]>;
    get(id: string): Promise<TemplateArte | undefined>;
    save(id: string, input: SaveTemplateRequest): Promise<TemplateArte>;
  };
  start(): Promise<void>;
  stop(): Promise<void>;
  readonly config: OrchestratorConfig;
}
