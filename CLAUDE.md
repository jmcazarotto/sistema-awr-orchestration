# CLAUDE.md — AWR Design System (Módulo de Design Autônomo · Fase 1)

Protótipo funcional que executa o ciclo autônomo **criação → revisão IA → aprovação humana AWR → acervo local** de artes baseadas em templates para 3 procedimentos estéticos × 4 templates (= 12 artes).

Leia `AGENTS.md` antes de mexer em `src/orchestrator/**` ou `brain/**`: é a spec do protocolo de mensagens, máquina de estados, hops e contrato de parsing dos Markdown.

## Comandos

```bash
npm install
cp .env.example .env          # IMAGE_ENGINE_MODE=mock roda sem chave OpenAI
npm run dev                   # server (Hono :8787) + web (Vite :5173) em paralelo
npm run dev:server            # só o orquestrador + API
npm run dev:web               # só o front
npm run typecheck             # tsc --noEmit (server + web)
npm test                      # vitest
npm run tunnel                # cloudflared quick tunnel → expõe :8787 publicamente
npm run acervo:reset          # limpa _staging e pastas finais (mantém _references)
```

## Arquitetura (resumo)

| Camada | Pasta | Regra |
|---|---|---|
| Contratos | `src/shared/types.ts` | Único lugar de tipos compartilhados server/web. Zod schemas + tipos inferidos. |
| Motor headless | `src/orchestrator/**` | **Não importa nada de `server/` ou `web/`.** Exposto via `createOrchestrator()` que retorna `{ bus, submitDemand, humanReview, acervo }`. |
| API | `src/server/**` | Hono. Única camada que conhece HTTP/SSE. Adapter fino sobre o orquestrador. |
| UI | `src/web/**` | React + Tailwind v4. Fala só com `/api/*` e `/api/events` (SSE). |
| Cérebro | `brain/**` | Markdown vivo. Lido a cada execução (sem cache longo) para que edições manuais e aprendizados entrem em vigor sem restart. |
| Storage | `acervo/**`, `data/` | Disco local na Fase 1. `data/state.json` guarda demandas/mensagens (JSON store atômico). |

Portabilidade Fase 2 (Cloudflare Workers + Durable Objects / VPS Hostinger): todo I/O passa por interfaces (`StateStore`, `AcervoStorage`, `Clock`) em `src/orchestrator/core`. Implementações Fase 1 = filesystem; Fase 2 = D1/R2/DO storage. Não use `fs` fora dessas implementações.

## Modelos de IA (configuráveis por env — nunca hardcode)

| Papel | Env | Default |
|---|---|---|
| Classificação rápida | `CLASSIFIER_MODEL` | `gpt-6-luna-decisions` |
| Geração de imagem | `IMAGE_MODEL` | `gpt-image-2` |
| Rubrica visual (Sim/Não) | `REVIEW_MODEL` | `gpt-6-luna-decisions` |
| Feedback detalhado de correção | `FEEDBACK_MODEL` | `gpt-6.1-terra` |

Modos (`.env`):
- `IMAGE_ENGINE_MODE=mock|openai` — `mock` compõe o template com Sharp/SVG em ~1s (sem custo); `openai` chama `IMAGE_MODEL`.
- `AI_MODE=mock|openai` — classificador e revisor. Em `mock` são heurísticos/determinísticos (com reprovação simulada configurável via `MOCK_REJECT_RATE`) para testar o loop de ajuste.
- `CLASSIFIER_PROVIDER=openai|jev` — permite trocar para TypeSafe AI (`jev`) sem mudar o contrato de saída.

Toda chamada de IA retorna dados **validados por Zod** antes de entrar no `EventBus`. Saída inválida = retry 1x, depois erro registrado no log SSE.

## Convenções

- TypeScript strict (TS 7), ESM, Node ≥ 22, `moduleResolution: Bundler` em todo o projeto (server roda via `tsx`; Fase 2 é empacotado pelo wrangler). Imports relativos sem extensão.
- Nomes de domínio em PT-BR (`demanda`, `procedimento`, `acervo`), infraestrutura em inglês (`EventBus`, `Actor`).
- IDs de procedimento e template são os literais de `src/shared/types.ts` (`preenchimento_labial | botox | fios_sustentacao`, `antes_depois_1 | antes_depois_2 | banco_imagem_1 | banco_imagem_2`). Não invente variações.
- Atores nunca se chamam diretamente — só `bus.send(envelope)`.
- Escrita em `brain/**` só via `BrainLoader` (append-only no `## Self-Improvement Log` / `## Log`). Nunca reescreva seções 1–5 de uma Skill programaticamente.
- Arquivos do acervo seguem a nomenclatura de `AGENTS.md §7`.

## Identidade visual (UI)

Referência: https://awr-portal-cliente.gabrielzteixeira.chatgpt.site/ — tokens extraídos em `docs/design-tokens.md`. Use **somente** esses tokens (cores, raios, sombras, tipografia). Dois temas: Modo 1 (padrão, lime) e Modo 2 (azul), via `data-visual-mode` no `<body>`, igual à referência. Sem 3D: o monitoramento é o **Live Orchestration Panel** 2D alimentado por SSE.

## Fora de escopo na Fase 1

Ambiente 3D, autenticação multiusuário, banco de dados remoto, publicação automática nas redes.
