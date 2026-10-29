# Contrato HTTP — AWR Design System (Fase 1)

Fonte dos schemas e tipos: `src/shared/types.ts` (Zod v4; tipos com o mesmo nome sem o sufixo `Schema`). Este documento define o adapter Hono; não implementa rotas. Servidor Node ≥22 em `http://localhost:8787` por padrão (`PORT`). Vite em `:5173` faz proxy de `/api` e `/acervo` para `:8787`, conforme `vite.config.ts`.

## Convenções de transporte

- JSON UTF-8, `Content-Type: application/json`. Bodies JSON malformados e falhas de validação retornam 400. Requests usam schemas estritos; campos desconhecidos são 400. Strings de texto são aparadas e não aceitam apenas espaços.
- Rotas GET não recebem body; não há paginação nesta fase. Listas de demandas, mensagens e histórico seguem ordem cronológica de criação/publicação, da mais antiga à mais recente.
- `DemandaParamsSchema` valida `:id` no formato `DEM-` com pelo menos quatro dígitos (`DEM-0001`, `DEM-10000`). ID malformado: 400; ID válido inexistente: 404. Contadores são inteiros não negativos. Timestamps são ISO-8601 com timezone; produzir UTC via `toISOString()`.
- `Demanda.classificacao` e `criadorAtual` são obrigatórios e aceitam `null` antes da classificação. `versaoAtual=0`, `tentativaDiretor=0`, `hop=0` na criação. Ausência de campos opcionais é representada por omissão, sem strings vazias. `historico` contém `{de, para, ts, motivo?, messageId?}`; começa vazio no estado `CRIADA`.
- Todo erro JSON segue `ApiErrorSchema`: `{ "error": { "code": "VALIDATION_ERROR", "message": "Descrição em PT-BR" } }`. Códigos: 400 `VALIDATION_ERROR`; 404 `NOT_FOUND`; 409 `INVALID_TRANSITION` ou `HOP_LIMIT`; 502 `UPSTREAM_ERROR` (falha do classificador Jev); 500 `INTERNAL_ERROR` (mensagem pública sem stack, prompts ou credenciais). O 500 é aplicável a qualquer rota em caso de falha inesperada. Rota inexistente: 404 `NOT_FOUND`.
- Paths de arte nos DTOs são relativos à raiz `ACERVO_DIR`, usam `/` e não incluem a URL `/acervo/`: `_staging/DEM-0001__v1.png` e `botox/botox__antes_depois_1__DEM-0001.png`. A UI prefixa `/acervo/` ao construir URLs. Paths `skillFile` identificam arquivos sob `BRAIN_DIR/skills`; não são URLs públicas.

## Triagem sem produção

### POST /api/triagem

Body estrito `TriagemRequestSchema`: `{ "texto": "Preciso de um antes e depois de botox para a Royal Face Castanhal" }`. Texto aparado, 3–4000 caracteres. 200 `TriagemResponseSchema`: `{ triagem: Triagem }`. Não cria demanda, não grava mensagens de atores e não inicia geração. Para produzir, envie posteriormente os valores confirmados a `POST /api/demandas`.

`Triagem` contém `id` (`TRI-<nanoid>`), `texto`, `empresa: { id: string|null, nome: string|null, cadastrada: boolean, confianca: number }`, `procedimento`, `procedimentoConfianca`, `tipoTemplate`, `tipoTemplateConfianca`, `familiaArte` (`antes_depois|banco_imagem`), `provider` (`jev|mock` nesta implementação), `modelo`, `latenciaMs`, `tokens: { entrada, saida }`, `custo: { usd, brl, cotacaoUsdBrl }`, `criadoEm` (ISO UTC). Confianças entre 0 e 1; tokens inteiros. Custos não arredondados: a UI formata. `familiaArte` deriva do template, não é outra pergunta ao modelo.

Uma chamada Jev com três perguntas choice (`procedimento`, `empresa`, `tipo_arte`). `CLASSIFIER_PROVIDER=jev` prevalece sobre `AI_MODE`, inclusive `mock`. Sem credencial ou com outro provider, retorna heurísticas mock, custo zero e aviso SSE. Empresas são lidas de `BRAIN_DIR/clientes.json` a cada chamada (ausente = lista vazia; JSON inválido = erro claro no motor e HTTP 500 genérico). Opção `nao_identificada` ou confiança abaixo de 0,7 produz `cadastrada=false`, `id=null` e nome próprio extraído do texto, se houver; caso contrário `nome=null`.

Erros: 400 JSON/body inválido; 502 `{ error: { code: "UPSTREAM_ERROR", message: "Falha no classificador Jev." } }` para HTTP upstream, timeout ou resposta inválida. Timeout por tentativa: 10 segundos; até três retries com backoff 250/500/1000 ms apenas em 429/529. Latência inclui chamada, parse e eventuais retries/backoff, sem leitura do cadastro.

Eventos via `GET /api/events` (envelopes e replay padrão):

- `triagem.started`: `payload: { triagemId, texto, provider, modelo }`, antes da consulta.
- `triagem.result`: `payload: Triagem`, após sucesso; correlacionar `payload.id` com `triagemId`. Falha não emite resultado; trate o erro HTTP. SSE transporta o texto solicitado; o log técnico contém apenas ID, provider, procedimento, template, latência e contagem de tokens.

Config pública (`GET /api/config`, schema compartilhado): `JEV_BASE_URL=https://api.typesafe.ai`, `JEV_MODEL=jev-latest`, `JEV_PRICE_INPUT_USD_PER_MTOK=0.042`, `JEV_PRICE_OUTPUT_USD_PER_MTOK=0`, `USD_BRL=5.5`. Preços por milhão de tokens e cotação são defaults configuráveis, sem consulta cambial automática. `usd=(entrada*precoEntrada+saida*precoSaida)/1e6`; `brl=usd*USD_BRL`. `JEV_API_KEY` é privada, lida apenas por dependência/env, nunca pelo objeto de config nem por respostas/logs.

`POST /api/demandas` compartilha a classificação Jev, preserva procedimento/template explícitos e preenche `clinicaNome` quando ausente. `confianca` é o mínimo das perguntas efetivamente usadas (incluindo empresa quando preenche clínica). Essa rota continua iniciando produção.

## Rotas de demandas

### POST /api/demandas

Body: `CreateDemandaRequestSchema` (alias de `SubmitDemandInputSchema`):

```json
{
  "briefing": "Arte sobre toxina botulínica, com tom acolhedor.",
  "procedimento": "botox",
  "tipoTemplate": "banco_imagem_1",
  "clinicaNome": "Clínica Exemplo",
  "headline": "Cuidado com expressão natural",
  "cta": "Agende sua avaliação"
}
```

Somente `briefing` é obrigatório. Procedimento e template podem ser omitidos independentemente: `FastClassifier` infere cada campo ausente do briefing; os valores fornecidos são restrições da classificação. A API só cria demandas de `origem=cliente`, designadas a `van_gogh`; o cliente não fornece estado, ator, ID ou origem.

201: `CreateDemandaResponseSchema` → `{ demanda: Demanda }`. `submitDemand` persiste a demanda, conclui a classificação e publica `DEMANDA_CLASSIFICADA` antes de resolver. A produção é assíncrona: o estado da resposta pode ter avançado além de `CLASSIFICADA`. A resposta já contém classificação não nula. Erros: 400 body/enum inválido; 409 `INVALID_TRANSITION` se o motor rejeitar a operação. 404 não se aplica.

### GET /api/demandas

Sem body/query. 200: `ListDemandasResponseSchema` → `{ demandas: Demanda[] }`, lista vazia permitida. Erros de domínio 400/404/409 não se aplicam.

### GET /api/demandas/:id

Params: `DemandaParamsSchema`. Sem body. 200: `GetDemandaResponseSchema` → `{ demanda: Demanda, messages: InboxMessage[] }`. Histórico de transições em `demanda.historico`; mensagens filtradas pelo ID da demanda, sem limite de SSE. Erros: 400 ID inválido; 404 demanda inexistente. 409 não se aplica.

### POST /api/demandas/:id/feedback

Params: `DemandaParamsSchema`. Body: `HumanReviewRequestSchema`, mesma união de `FeedbackHumanoSchema` com campos desconhecidos rejeitados:

```json
{ "decisao": "ajustar", "motivo": "O selo cobre a região tratada.", "revisor": "Equipe AWR" }
```

`decisao=aprovar|ajustar`, `revisor` obrigatório; `motivo` obrigatório e não vazio para `ajustar`, opcional para `aprovar`. Aceito somente em `AGUARDANDO_APROVACAO_AWR`. O adapter chama `humanReview`, que publica `FEEDBACK_HUMANO` de `awr_human` para `art_director`; atores não são chamados diretamente.

200: `HumanReviewResponseSchema` → `{ demanda: Demanda }`. Aprovar resolve após mover PNG e metadados para o acervo e persistir `APROVADA_SALVA_NO_ACERVO`. Ajustar resolve após registrar aprendizado, transições `REPROVADA_HUMANO` → `EM_PRODUCAO` e enfileirar `AJUSTAR_ARTE` ao criador original com `hop+1`; a nova geração continua assíncrona. A tentativa do Diretor reinicia a cada ciclo humano; `versaoAtual` continua crescente.

Em `escalada=true, motivoEscalada=hop_limit`, somente `aprovar` é aceito; `ajustar` retorna 409 `HOP_LIMIT` até reset explícito. Erros: 400 body/ID inválido; 404 demanda inexistente; 409 `INVALID_TRANSITION` para estado incompatível ou `HOP_LIMIT` para ajuste bloqueado. Duplo clique após mudança de estado retorna 409; não reaplica a operação.

### POST /api/demandas/:id/reset-hops

Params: `DemandaParamsSchema`. Body ausente ou `{}` (`EmptyRequestSchema`); campos extras: 400. Somente em `AGUARDANDO_APROVACAO_AWR`. Define `hop=0`; quando o motivo é `hop_limit`, limpa `escalada`/`motivoEscalada`. Preserva a escalada `director_attempts`, a versão, a tentativa do Diretor, a revisão e o estado. Não despacha ajuste; o humano envia feedback em seguida. O histórico não recebe transição de estado para si mesmo; atualizar `updatedAt` e emitir `demand.updated`.

200: `ResetHopsResponseSchema` → `{ demanda: Demanda }`. Erros: 400 ID/body inválido; 404 demanda inexistente; 409 `INVALID_TRANSITION` se a demanda não aguarda AWR.

## Rotas de acervo e mensagens

### GET /api/acervo

Sem body/query. 200: `GetAcervoResponseSchema` (alias de `AcervoGridSchema`), sem wrapper:

```json
{
  "slots": [
    { "procedimento": "botox", "tipoTemplate": "antes_depois_1", "preenchido": false, "arquivos": [], "demandaAbertaId": "DEM-0002" }
  ],
  "total": 12,
  "preenchidos": 0,
  "vazios": 12,
  "emProducao": 1
}
```

O exemplo abrevia `slots`: a resposta real exige exatamente os 12 pares únicos de `PROCEDIMENTOS × TIPOS_TEMPLATE`, ordenados pela ordem dessas constantes. `arquivos` contém paths PNG finais relativos a `ACERVO_DIR`; `_staging` não preenche slot. `preenchido = arquivos.length > 0`; `preenchidos` conta slots preenchidos, `vazios=12-preenchidos`, `emProducao` conta slots com `demandaAbertaId` (demanda aberta até aprovação final, incluindo espera humana). Um slot preenchido pode também ter demanda aberta; os contadores não são uma partição em três grupos. Falhas de domínio 400/404/409 não se aplicam.

### POST /api/acervo/fill

Body ausente ou `{}` para todos os slots vazios; alternativamente `FillAcervoRequestSchema` → `{ procedimento?, tipoTemplate? }`. Cada filtro é independente; só seleciona slots que correspondam a todos os filtros fornecidos. O Diretor deduplica slots preenchidos ou com demanda aberta e encaminha a Monalisa por `PREENCHER_ACERVO` → `PRODUZIR_ARTE`. Nunca iniciar mais de uma produção por par.

202: `FillAcervoResponseSchema` → `{ accepted: true }`, inclusive se não houver slots elegíveis. `acervo.fill()` resolve após enfileirar as solicitações, sem aguardar imagens. Erros: 400 filtros inválidos. 404/409 não se aplicam (repetição é no-op).

### GET /api/messages?demandaId=DEM-0001

Query: `ListMessagesQuerySchema` (alias de `MessagesFilterSchema`). Sem body. `demandaId` opcional; omitido retorna todo o log persistido Bot-to-Bot. 200: `ListMessagesResponseSchema` → `{ messages: InboxMessage[] }`. ID válido sem mensagens retorna `[]`, mesmo se não existir demanda. Erros: 400 ID/query inválido. 404/409 não se aplicam.

## Stream de eventos

### GET /api/events

Sem body/query. Header opcional `Last-Event-ID` (`EventsHeadersSchema`, chave normalizada `last-event-id` no Hono). 200: stream `text/event-stream; charset=utf-8`, `Cache-Control: no-cache`, conexão mantida aberta. Primeiro frame: `retry: 3000\n\n` (`SSE_RETRY_MS`). Comentário heartbeat a cada 15 segundos (`SSE_HEARTBEAT_MS`): `: heartbeat\n\n`; heartbeat não tem ID, não é evento de domínio e não entra no histórico.

Cada frame de domínio usa `id: <id>`, `event: <type>` e `data: <JSON SseEnvelope>`. `SseEnvelopeSchema` é a união discriminada por `type` acrescida de `{id, ts}` no mesmo nível; `ts` ISO UTC; `id` único e opaco. O `id` e `type` do JSON devem coincidir com os campos SSE. `SseEventSchema` é a versão interna sem `id/ts`.

```text
id: evt-0001
event: actor.status
data: {"id":"evt-0001","ts":"2026-10-28T14:05:11Z","type":"actor.status","payload":{"actorId":"van_gogh","status":"generating","demandaId":"DEM-0001"}}

```

| type | payload |
|---|---|
| `actor.status` | `{ actorId: ActorId, status: ActorStatus, demandaId: string \| null }`; `null` para ator sem demanda |
| `message.sent` | `InboxMessage` completo, diretamente |
| `demand.updated` | `Demanda` completa, diretamente |
| `review.result` | `{ demandaId, versao, tentativaDiretor, review: ReviewResult }` |
| `acervo.updated` | `AcervoGrid` completo, diretamente |
| `brain.learning` | `{ skillFile, learning: Learning }`; `skillFile` também pode identificar arquivo de memória |
| `triagem.started` | `{ triagemId, texto, provider, modelo }`; início da classificação sem demanda |
| `triagem.result` | `Triagem` completa; `payload.id` corresponde ao `triagemId` do início |
| `log` | `{ level: 'info'\|'warn'\|'error', message, demandaId?, actorId? }` |

O bus retém até `SSE_HISTORY_LIMIT=1000` envelopes; `history(n)` retorna os últimos `n` em ordem de publicação (0 retorna `[]`, n maior que o disponível retorna todos). Na conexão sem cursor, enviar o histórico retido e então eventos novos. Com cursor conhecido, reenviar somente os eventos posteriores, sem repetir o próprio cursor. Com cursor desconhecido/expirado (incluindo restart), enviar todo o histórico retido; a UI recarrega snapshots por GET em toda reconexão e deduplica eventos por ID. Não ordenar IDs lexicalmente, nem assumir replay completo após restart. Registrar o listener antes de obter histórico e deduplicar o buffer por ID para não perder eventos entre replay e live. No disconnect, remover listener e timer. Como se usa `event: <type>`, a UI registra `addEventListener` para cada `SSE_EVENT_TYPES`; apenas `onmessage` não recebe esses frames.

Erros antes de iniciar stream: 400 cursor vazio/inválido; 404/409 não se aplicam. Após iniciar, não escrever erros JSON soltos: emitir envelope `log` quando possível e encerrar para reconexão. A resposta SSE não é um objeto JSON único; cada `data:` é validado por `SseEnvelopeSchema`.

## Leitura do cérebro, configuração e saúde

### GET /api/brain/skills

Sem body/query. 200: `ListSkillsResponseSchema` → `{ skills: SkillSummary[] }`. Expor as três skills de procedimento e `template_composition`, sem agentes/memórias como skills separadas. `SkillSummarySchema`: `{ id, label, skillFile, procedimento?, versao, atualizadoEm }`; `atualizadoEm` é data `YYYY-MM-DD`, convertida de `atualizado_em` do front-matter. Na skill transversal, omitir `procedimento` (`"*"` não é um procedimento válido). Erros de domínio 400/404/409 não se aplicam.

### GET /api/brain/skills/:id

Params: `SkillParamsSchema` (`SkillIdSchema`: os três procedimentos ou `template_composition`). Sem body. 200: `GetSkillResponseSchema` → `{ skill: SkillDetail }`. `SkillDetailSchema` estende o resumo com `conteudo` (Markdown integral), `rubrica: RubricaItem[]` (`{ id, severidade, pergunta }`) e `aprendizados: Learning[]`. A rubrica retornada contém os itens definidos na skill; os aprendizados são separados, incluindo entradas inativas/exemplo para exibição, e o motor só aplica ativos. Na composição transversal, rubrica/aprendizados podem ser arrays vazios. Ler de novo a cada request, sem cache longo. Sem endpoints de escrita em `brain`.

Erros: 400 ID fora de `SkillIdSchema` (incluindo path arbitrário); 404 ID suportado cujo arquivo não existe; 409 não se aplica. O servidor resolve o ID por allowlist, nunca como path livre.

`LearningSchema`: `{ id, createdAt, procedimento?, template?, escopo?, fonte, demandaId?, regra, motivoOriginal, status, severidade? }`. Exatamente um de `template` (log da Skill) ou `escopo` (memória). Escopos: `global`, `procedimento:<id>`, `template:<id>`, `cliente:<slug>`. Fontes: `awr_humano`, `diretor_arte`, `seed`; status: `ativo`, `inativo`, `exemplo`. IDs `Lnn/Gnn/Cnn`; ausência de demanda no Markdown (`—`) vira campo omitido. O parser normaliza timestamps de minuto para ISO e omite o template ao ler uma entrada com escopo.

### GET /api/config

Sem body/query. 200: `GetConfigResponseSchema` → `{ config: OrchestratorConfig }`. As chaves são os nomes UPPER_SNAKE_CASE da `.env.example`; números e booleanos já convertidos. Inclui modos, provider, modelos, tamanho, limites, timers, autofill, porta e diretórios. Nunca inclui `OPENAI_API_KEY`, `JEV_API_KEY` ou outras variáveis do ambiente. Erros de domínio 400/404/409 não se aplicam.

`loadConfig(env)` vive em `src/shared/config.ts` e é puro; o chamador fornece um mapa de strings/undefined (por exemplo, `process.env`). Aplica todos os defaults de `.env.example`, descarta chaves não reconhecidas e lança `ZodError` para valores inválidos. Booleanos env aceitam somente `true`/`false`; números vazios não viram zero. `MAX_HOPS` aceita zero, tentativas/timers são positivos, probabilidade está em [0,1], porta em [1,65535]. Segredos são obtidos separadamente pela composição do motor e nunca por `OrchestratorConfig`.

### GET /api/health

Sem body/query. 200: `HealthResponseSchema` → `{ status: 'ok', ts: '<ISO-8601>' }`. Verifica disponibilidade do processo HTTP; não dispara chamadas pagas de IA nem produção. Erros de domínio 400/404/409 não se aplicam.

## Arquivos de arte

### GET /acervo/*

Sem body/query. 200: bytes PNG (`Content-Type: image/png`), sem schema JSON de sucesso. Servir PNGs finais e `_staging`; `.meta.json`, `.md`, arquivos de estado e diretórios não são públicos. Sucesso segue a nomenclatura de `AGENTS.md §7`; staging pode mudar entre versões, então usar `Cache-Control: no-cache` nesta fase. Erros: 400 `VALIDATION_ERROR` para path inseguro/malformado; 404 `NOT_FOUND` para arquivo ausente ou não público; 409 não se aplica. Erros usam `ApiErrorSchema`.

Proteção obrigatória inclusive no Windows: decodificar o path com tratamento de erro, rejeitar segmentos `..`, NUL, barras invertidas, drive letters, caminhos absolutos/UNC e codificação residual que possa ser reinterpretada como traversal. Resolver contra a raiz canônica de `ACERVO_DIR`; usar `relative(root, target)` e rejeitar saída da raiz (não usar apenas prefixo textual). Verificar `realpath` do arquivo existente e contenção na raiz real para impedir escapes por symlink/junction. Não aceitar listagem de diretórios nem seguir outro ciclo de URL decode. Nunca usar um path enviado pelo usuário diretamente em `readFile`.

## Contrato headless para os implementadores

`Orchestrator` e `EventBusPublic` são interfaces de `src/shared/types.ts`; a implementação e a assinatura de `createOrchestrator()` ficam em `src/orchestrator/index.ts`. Server/web não precisam importar tipos do motor.

- `submitDemand(input: SubmitDemandInput): Promise<Demanda>`; `humanReview(id, feedback: FeedbackHumano): Promise<Demanda>`; `resetHops(id): Promise<Demanda>` têm os pontos de conclusão descritos nas rotas acima.
- `listDemandas(): Demanda[]`, `getDemanda(id): Demanda | undefined`, `listMessages(filtro?: MessagesFilter): InboxMessage[]` retornam snapshots síncronos do estado em memória, sem expor objetos mutáveis internos. Mensagens não são limitadas pelo ring buffer SSE.
- `acervo.grid(): Promise<AcervoGrid>`; `acervo.fill(procedimento?, tipoTemplate?): Promise<void>`; `start(): Promise<void>` e `stop(): Promise<void>`; `config: OrchestratorConfig` sem segredos.
- `bus.subscribe(listener: (event: SseEnvelope) => void): () => void`; `bus.history(n): SseEnvelope[]`. O motor atribui id/ts antes de notificar os consumidores. Falha de listener não interrompe processamento dos atores.
- `InboxMessage<A>` discrimina por action e restringe remetente/destinatário; `PayloadOf<A>` extrai o payload. O schema não impõe `MAX_HOPS`: uma mensagem excedente precisa chegar à validação do bus para ser recusada e provocar a escalada. Idempotência por message.id e mailbox serial pertencem ao motor.
- `TRANSICOES_VALIDAS`/`transicaoValida` contêm exatamente as nove arestas de AGENTS.md §3. A escalada forçada do §4 é uma operação administrativa do bus: se precisar sair de outro estado ativo para espera AWR, `TransicaoDemandaSchema` permite esse registro somente com `motivo='hop_limit'`; nunca reabre estado terminal. Não entregar a mensagem recusada, nem criar uma transição normal adicional. `director_attempts` usa a aresta normal a partir de `EM_REVISAO_DIRETOR`.
- `ReviewResultSchema` valida o JSON de revisão do agente: score [0,1], itens com IDs R/L/G/C, sim/nao e evidência, até três correções. Calcular a aprovação no revisor: todos os críticos sim e pelo menos 80% dos normais sim (sem normais, requisito satisfeito). Escalada não transforma uma revisão reprovada em aprovada.
- `ArteMetaSchema` discrimina por `ator`: Van Gogh segue o JSON do agent (origem cliente opcional); Monalisa exige origem acervo e `coerenciaColecao`. Nomes e locais de PNG e `.meta.json` permanecem os de AGENTS.md §7.


## Empresas e templates por empresa

O cadastro em `brain/clientes.json` é a fonte das empresas. As respostas são validadas pelos schemas compartilhados.

| Método | Rota | Entrada | Resposta |
|---|---|---|---|
| GET | `/api/empresas` | — | `{ empresas: Empresa[] }` |
| GET | `/api/empresas/:id` | ID da empresa | `{ empresa: Empresa }` |
| POST | `/api/empresas` | `EmpresaInputSchema` (JSON; upsert por ID) | `{ empresa: Empresa }` |
| POST | `/api/empresas/:id/logo` | multipart/form-data, campo `arquivo`: PNG, JPG, SVG ou WebP, até 2 MB | `{ empresa: Empresa }` |
| GET | `/api/templates` | query opcional `empresaId`, `procedimento`, `familia` (`antes_depois` ou `banco_imagem`) | `{ templates: TemplateArte[] }` |
| GET | `/api/templates/:id` | ID do template | `{ template: TemplateArte }` |
| PUT | `/api/templates/:id` | `SaveTemplateRequestSchema`: `nome`, `fundo`, `elementos` | `{ template: TemplateArte }` |

Todas essas operações respondem 200 em caso de sucesso. Recursos desconhecidos respondem 404 `NOT_FOUND`; entrada ou upload inválido responde 400 `VALIDATION_ERROR`. Elementos precisam ter IDs únicos e ao menos sobrepor o canvas; `atualizadoEm` é definido pelo relógio do servidor. Logos ficam em `_marcas/<empresaId>/logo.<ext>` e são servidas por `GET /acervo/*` (incluindo SVG e WebP).

Na inicialização e após upsert da empresa, cada procedimento recebe os quatro slots oficiais de templates. Seeds só escrevem IDs ausentes, preservando edições existentes em `DATA_DIR/templates/<id>.json`.
