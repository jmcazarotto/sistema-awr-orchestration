# AGENTS.md — Topologia de Agentes & Protocolo de Comunicação

> Especificação global do Módulo de Design Autônomo da AWR Digital (Fase 1).
> Fonte da verdade para `src/orchestrator/**` e para o conteúdo de `brain/**`.
> Qualquer mudança de protocolo deve ser refletida aqui **e** em `src/shared/types.ts`.

---

## 1. Topologia

```text
                    ┌──────────────────────────┐
  UI / API ───────▶ │ FastClassifier (service) │  < 150 ms, saída tipada
                    └────────────┬─────────────┘
                                 │ DEMANDA_CLASSIFICADA
                                 ▼
 AcervoWatcher ──PREENCHER_ACERVO──▶ ┌───────────────────┐ ◀── FEEDBACK_HUMANO ── Revisor AWR (UI)
   (heartbeat)                       │   art_director    │
                                     │  (orquestrador)   │ ──▶ fila AGUARDANDO_APROVACAO_AWR
                                     └──┬─────────────▲──┘
                     PRODUZIR_ARTE /    │             │  ARTE_ENTREGUE
                     AJUSTAR_ARTE       ▼             │
                           ┌────────────────┐   ┌────────────────┐
                           │    van_gogh    │   │    monalisa    │
                           │ demandas sob   │   │ preenchimento  │
                           │ medida/ajustes │   │ de acervo      │
                           └────────────────┘   └────────────────┘
```

| Ator | ID | Papel | Gatilho |
|---|---|---|---|
| Diretor de Arte | `art_director` | Valida triagem, despacha, revisa visualmente (rubrica), decide aprovar/devolver, encaminha para AWR | Inbox (event-driven) + scheduler de cobrança |
| Van Gogh | `van_gogh` | Produz artes de **demandas de clientes** e aplica **ajustes** (do Diretor ou da AWR) | Inbox |
| Monalisa | `monalisa` | Produz artes **faltantes no acervo** (grade 3 procedimentos × 4 templates) | Inbox (ordens vindas do Diretor, originadas pelo `AcervoWatcher`) |

Serviços (não-atores, sem inbox): `FastClassifier`, `ImageEngine`, `VisionReviewer`, `BrainLoader`, `AcervoWatcher`.

Regra de ouro: **atores nunca chamam outros atores diretamente.** Toda comunicação passa pelo `EventBus` como envelope de mensagem. Isso garante rastreabilidade (log Bot-to-Bot na UI), controle de `hop` e portabilidade para Durable Objects na Fase 2 (1 DO por ator, inbox = storage do DO).

---

## 2. Envelope de Mensagem (Inbox)

```ts
interface InboxMessage<A extends ActionType = ActionType> {
  id: string;            // ulid/nanoid — único por mensagem
  demandaId: string;     // ex: "DEM-0007"
  from: ActorId | 'system' | 'awr_human' | 'acervo_watcher';
  to: ActorId;           // 'art_director' | 'van_gogh' | 'monalisa'
  hop: number;           // contador de devoluções (ver §4)
  action: A;             // ver tabela abaixo
  payload: PayloadOf<A>; // tipado por action (discriminated union)
  createdAt: string;     // ISO-8601
  causationId?: string;  // id da mensagem que originou esta
}
```

| `action` | from → to | Payload principal |
|---|---|---|
| `DEMANDA_CLASSIFICADA` | system → art_director | `classificacao` (procedimento, agenteDesignado, tipoTemplate, skillFile, confianca) |
| `PREENCHER_ACERVO` | acervo_watcher → art_director | `procedimento`, `tipoTemplate` (slot faltante) |
| `PRODUZIR_ARTE` | art_director → van_gogh \| monalisa | `procedimento`, `tipoTemplate`, `skillFile`, `briefing` |
| `ARTE_ENTREGUE` | van_gogh \| monalisa → art_director | `stagingPath`, `versao`, `promptUsado`, `engine` (`mock`\|`openai`) |
| `AJUSTAR_ARTE` | art_director → criador | `feedbackDiretor` (itens reprovados da rubrica + texto), `versaoAnterior` |
| `FEEDBACK_HUMANO` | awr_human → art_director | `decisao` (`aprovar`\|`ajustar`), `motivo?`, `revisor` |

---

## 3. Máquina de Estados da Demanda

```text
CRIADA ─▶ CLASSIFICADA ─▶ EM_PRODUCAO ─▶ EM_REVISAO_DIRETOR ─┬─▶ AGUARDANDO_APROVACAO_AWR ─┬─▶ APROVADA_SALVA_NO_ACERVO
                              ▲                              │                             │
                              │                              ▼                             ▼
                              └────────────────────── EM_AJUSTE_IA            REPROVADA_HUMANO
                              └──────────────────────────────────────────────────────┘
                                   (volta p/ produção + grava aprendizado na Skill)
```

| De | Para | Disparo |
|---|---|---|
| `CRIADA` | `CLASSIFICADA` | `FastClassifier` retorna decisão tipada |
| `CLASSIFICADA` | `EM_PRODUCAO` | Diretor despacha `PRODUZIR_ARTE`. Demanda de cliente (Van Gogh) com `PRODUCAO_MANUAL_VAN_GOGH=true` fica `CLASSIFICADA` com `producao.etapa='aguardando'` até `POST /api/demandas/:id/produzir` |
| `EM_PRODUCAO` | `EM_REVISAO_DIRETOR` | Criador envia `ARTE_ENTREGUE` |
| `EM_REVISAO_DIRETOR` | `EM_AJUSTE_IA` | Rubrica reprovada e `tentativa < MAX_DIRECTOR_ATTEMPTS` |
| `EM_AJUSTE_IA` | `EM_REVISAO_DIRETOR` | Criador reenvia `ARTE_ENTREGUE` |
| `EM_REVISAO_DIRETOR` | `AGUARDANDO_APROVACAO_AWR` | Rubrica aprovada **ou** tentativas esgotadas (`escalada=true`) |
| `AGUARDANDO_APROVACAO_AWR` | `APROVADA_SALVA_NO_ACERVO` | Humano "Aprovar" → arquivo movido de `_staging/` para `acervo/<procedimento>/` |
| `AGUARDANDO_APROVACAO_AWR` | `REPROVADA_HUMANO` | Humano "Solicitar Ajuste" + motivo → `BrainLoader.appendLearning()` |
| `REPROVADA_HUMANO` | `EM_PRODUCAO` | Diretor despacha `AJUSTAR_ARTE` ao criador original (hop+1) |

**Andamento da produção (`demanda.producao`)** — não é estado da máquina, é a trilha visível da geração: `aguardando → na_fila → planejando → gerando → compondo → entregue` (ou `erro`). O inbox serial do Van Gogh é a fila. O modelo de imagem vem de Configurações › Modelos de IA (`simulado` = Sharp/SVG sem custo; `gpt-image-2`, `gpt-image-2.5-flare`, `gpt-image-2.5-sunburst` = OpenAI). Erro de geração é reconhecido no inbox (sem nova tentativa paga automática; o scheduler ignora a demanda) e só volta à fila por "Tentar novamente" (mesmo endpoint). A reprovação simulada do revisor mock nunca recai sobre imagem gerada na OpenAI.

Estados terminais: `APROVADA_SALVA_NO_ACERVO`. Transições fora desta tabela são **erro** e devem ser rejeitadas pelo `EventBus`.

---

## 4. Hops, Tentativas e Anti-loop

- **`hop`**: incrementa a cada **devolução** de uma arte a um criador (`AJUSTAR_ARTE` vinda do Diretor ou após `REPROVADA_HUMANO`). Mensagens de avanço normal herdam o hop atual.
- **`MAX_HOPS = 5`** (env `MAX_HOPS`): o `EventBus` recusa entregar uma mensagem com `hop > MAX_HOPS`; a demanda vai para `AGUARDANDO_APROVACAO_AWR` com `escalada=true, motivoEscalada='hop_limit'`. Nesse caso a UI só oferece "Aprovar" (ajustes exigem reset manual de hops).
- **`MAX_DIRECTOR_ATTEMPTS = 3`** (env): máximo de revisões do Diretor por ciclo de produção. Na 3ª reprovação a melhor versão segue para a AWR com `escalada=true, motivoEscalada='director_attempts'` e os itens da rubrica que falharam.
- **Idempotência**: cada ator registra `message.id` processados; reentrega é ignorada.
- **Concorrência**: cada ator processa **uma mensagem por vez** (mailbox serial). Monalisa tem no máximo 1 slot de acervo em produção por `procedimento+tipoTemplate`.

---

## 5. Eventos SSE (`GET /api/events`)

Todo evento do `EventBus` é espelhado para a UI:

| `type` | Quando |
|---|---|
| `actor.status` | Ator muda para `idle` \| `thinking` \| `generating` \| `reviewing` (com `demandaId`) |
| `message.sent` | Envelope publicado (log Bot-to-Bot) |
| `demand.updated` | Mudança de estado da demanda |
| `review.result` | Resultado da rubrica (itens Sim/Não, score) |
| `acervo.updated` | Arquivo entrou/saiu de `acervo/*` (grade 3×4 recalculada) |
| `brain.learning` | Novo aprendizado gravado em Skill/memória |
| `triagem.started` | Triagem de texto livre iniciada (`POST /api/triagem`): `triagemId`, `texto`, `provider`, `modelo` |
| `triagem.result` | Triagem concluída: empresa, procedimento, tipo de arte e métricas (latência real, tokens, custo USD/BRL). Não cria demanda |
| `log` | Log técnico (nível `info`/`warn`/`error`) |

---

## 6. Contrato dos Arquivos `/brain` (lido pelo `BrainLoader.ts`)

O parser é baseado em **front-matter YAML + headings H2 numerados**. Não renomeie headings.

### 6.1 `brain/agents/<actor>.agent.md`

```markdown
---
id: art_director            # = ActorId
nome: Diretor de Arte
modelos: { ... }            # chaves lógicas → resolvidas por env (ver CLAUDE.md)
---
## SOUL                     # identidade, tom, valores
## Missão
## Protocolo               # o que faz para cada action recebida
## Regras Invioláveis
## Formato de Saída         # JSON esperado quando aplicável
```

O conteúdo de `## SOUL` + `## Regras Invioláveis` vira o *system prompt* do ator.

**Organização em camadas** (combinadas em tempo de execução; caminho único em `skillPath()` de `src/shared/types.ts`):

| Camada | Pasta | Responde | Rubrica |
|---|---|---|---|
| Procedimento | `brain/skills/procedimentos/<procedimento>.skill.md` | O quê (clínico + compliance), neutro de marca | `Rnn` |
| Técnica do agente | `brain/skills/tecnicas/<tecnica>.skill.md` | Como produzir (`template_composition` → Monalisa; `arte_final_ia` → Van Gogh) | `Tnn` |
| Marca | `brain/skills/marcas/<rede>/marca.skill.md` + `visual-system.md` + `referencias.md` | Para quem (identidade visual da rede; unidades herdam) | `Mnn` |

Precedência no prompt: briefing → referência indicada no briefing → marca → procedimento → técnica. A paleta do procedimento só vale quando não há skill de marca.

### 6.2 `brain/skills/procedimentos/<procedimento>.skill.md`

~~~markdown
---
id: botox
procedimento: botox
label: Toxina Botulínica (Botox)
versao: 1
atualizado_em: 2026-10-28
---
# Skill — <label>

## 1. Contexto do Procedimento
## 2. Diretrizes Visuais e Paleta
## 3. Regras dos Templates
### antes_depois_1
### antes_depois_2
### banco_imagem_1
### banco_imagem_2
## 4. Prompt Base gpt-image-2
```prompt
... texto com variáveis {{procedimento_label}} {{template_id}} ...
```
## 5. Checklist de Rubrica do Diretor de Arte
- [R01][critico] Pergunta binária (Sim/Não)?
- [R02][normal] Pergunta binária (Sim/Não)?
## Self-Improvement Log
<!-- APPEND-ONLY: o BrainLoader adiciona entradas abaixo desta linha -->
~~~

**Parsing:** os `###` de template são lidos **apenas dentro do §3**; outros `###` (ex.: `### Compliance` no §1) são livres.

**Rubrica:** linhas no formato exato `- [Rnn][critico|normal] Pergunta?` (marca usa `Mnn`, técnica `Tnn`; a linha precisa terminar em `?`). Regra de aprovação:
todos os itens `critico` = **Sim** **e** ≥ 80% dos itens `normal` = **Sim**.
Aprendizados ativos do Self-Improvement Log viram itens extras `[Lnn][critico]` na rubrica. Na arte final por IA (Van Gogh) o Diretor avalia R + M + T.

**Variáveis do Prompt Base** (substituídas pelo `ImageEngine`):
`{{procedimento_label}}` `{{template_id}}` `{{template_descricao}}` `{{headline}}` `{{cta}}`
`{{clinica_nome}}` `{{briefing_cliente}}` `{{feedback_ajuste}}` `{{aprendizados}}`

**Entrada do Self-Improvement Log** (gerada pelo `BrainLoader.appendLearning`):

```markdown
### L03 · 2026-10-28T14:02Z · antes_depois_1 · fonte: awr_humano · DEM-0007
- **Regra:** Nunca sobrepor o selo de compliance à boca na foto "Depois".
- **Motivo original:** "o selo tampou o resultado do lábio"
- **Status:** ativo
```

### 6.3 `brain/skills/tecnicas/*.skill.md`

- `template_composition` (Monalisa e modo Simulado): geometria dos 4 tipos de template (grid, safe-area, posições de headline/CTA/selo/logo), formatos (1080×1350 feed 4:5; 1080×1920 stories) e composição híbrida (Sharp/SVG + camada fotográfica).
- `arte_final_ia` (Van Gogh com modelo real): a IA gera a arte completa. Mesmas seções numeradas; §4 traz o Prompt Base com `{{marca_prompt}}` `{{procedimento_label}}` `{{composicao}}` `{{procedimento_contexto}}` `{{textos_exatos}}` `{{oferta}}` `{{disclaimer}}` `{{referencias}}` `{{briefing_cliente}}` `{{feedback_ajuste}}` `{{aprendizados}}`; §5 rubrica `Tnn`. `antes_depois_*` não é gerado por IA (exige fotos reais).

### 6.4 `brain/skills/marcas/<rede>/`

- `marca.skill.md` — front-matter (`id` = id da rede em `clientes.json`, `label`, `versao`, `atualizado_em`, `empresas`) e seções: `## 1. Identidade e Precedência`, `## 2. Regras Obrigatórias`, `## 3. Composições Aprovadas` (`### <composicao>`: `modelo_destaque`, `close_procedimento`, `informativa_clean`, `antes_depois_editorial`, `corporal`), `## 4. Diretrizes para Geração por IA` (bloco ```prompt), `## 5. Checklist de Rubrica da Marca` (`- [Mnn][critico|normal] Pergunta?`), `## Self-Improvement Log` (APPEND-ONLY).
- `visual-system.md` — referência completa (paleta, tipografia, logo, ofertas), lida pelo revisor.
- `referencias.md` — front-matter `raiz:` + tabela em `## Índice`: `| id | arquivo | procedimento | composicao | oferta | usar_copy | notas |`. Arquivos em `acervo/<raiz>/<arquivo>`. `usar_copy: nao` = só layout (copy fere compliance).
- Logos oficiais: PNG/SVG cadastrados em Empresas (`logos.claro` para fundo claro, `logos.escuro` para fundo escuro; `logo` principal como reserva), aplicados sem alterar pixels na zona mais limpa da arte.
- A página `#/empresas/:id` permite configurar a empresa e sua `galeriaLogos`: lista de `{ arquivo, fundo: claro|escuro, principal: boolean }`. Uploads de variantes são aditivos e têm caminhos únicos. Múltiplas logos podem ser principais por fundo; o ImageEngine alterna entre as principais, ou entre todas quando nenhuma está marcada. `logos.claro/escuro` continuam como referência compatível (primeira principal ou primeira disponível); cadastros legados são preservados. Remover da galeria desvincula o arquivo sem apagá-lo do acervo.
- Variações por peça (preço, parcelamento, nome, unidade) vêm **somente do briefing**; a marca não muda por unidade.
- No editor de templates, elementos `logo` podem salvar `logoArquivo` escolhido da biblioteca da empresa; ausente/null usa a logo principal. `estilo.sombra` habilita a sombra e `sombraConfig` opcional configura cor, opacidade (0–1), deslocamentos x/y, desfoque e expansão (px). Templates antigos preservam a sombra padrão quando essa configuração não existe.

### 6.5 `brain/memory/*.md`

`global_learnings.md` (erros que não podem se repetir, válidos para todos os procedimentos) e `client_preferences.md` (preferências por clínica/cliente). Mesmo formato de entrada do Self-Improvement Log, com `escopo:` em vez de `template`.

---

## 7. Nomenclatura no Acervo

| Local | Padrão | Exemplo |
|---|---|---|
| Staging | `_staging/<demandaId>__v<versao>.png` + `.meta.json` | `_staging/DEM-0007__v2.png` |
| Final | `<procedimento>/<procedimento>__<template>__<demandaId>.png` | `botox/botox__antes_depois_1__DEM-0007.png` |
| Referências | `_references/<procedimento>__<template>.(png\|jpg)` | `_references/botox__banco_imagem_2.png` |

O `AcervoWatcher` considera um slot **preenchido** quando existe ao menos um arquivo `^<procedimento>__<template>__.*\.png$` na pasta final do procedimento.

---

## 8. Identificação de Empresa na Triagem

Cadastro em `brain/clientes.json` no formato **rede → unidades** (`tipo: franquia | independente`). Ex.: rede `royal_face` com unidades `royal_face_castanhal`, `royal_face_maringa`.

Ordem de resolução (`EmpresaMatcher.ts` → `TriagemService.ts`):

1. **Cadastro (determinístico, confiança 1):** o texto cita literalmente o nome/alias da rede (sem diferenciar acento/caixa; `RoyalFace` = `Royal Face`). A unidade é casada por nome, cidade ou alias. Unidade citada mas não cadastrada (ex.: "Royal Face Londrina") → rede reconhecida, `unidade.cadastrada=false`. Nesse caso a pergunta `empresa` **não** é enviada ao classificador.
2. **Classificador (`metodo: ia`):** sem citação literal (erro de grafia), o Jev escolhe entre as redes cadastradas; aceito só com confiança ≥ 0,7.
3. **Extração (`metodo: extracao`, confiança 0,5):** nome próprio não cadastrado, exibido como "não cadastrada".

Nunca associar uma unidade não citada a outra cadastrada (ex.: "Royal Face Maringá" jamais vira "Royal Face Castanhal").

## 9. Roteamento do Agente de Arte na Triagem

A triagem também decide **quem produz** (`agente` → `classificacao.agenteDesignado`, respeitado pelo Diretor ao despachar):

| Agente | Quando | Exemplo |
|---|---|---|
| `van_gogh` | Demanda de **cliente** (clínica, unidade, franqueado) | "recebemos uma demanda de cliente da unidade Royal Face Colombo…" |
| `monalisa` | **Abastecimento rotineiro do acervo** (peças genéricas, sem cliente) | "precisamos abastecer o acervo de imagens de Botox" |

Regra (`agenteRouting.ts`, confiança 1): só sinal de acervo (`acervo`, `abastecer`, `repor`, `completar a grade`…) → Monalisa; só sinal de cliente (empresa citada, `cliente`, `unidade`, `franqueado`…) → Van Gogh. Ambos ou nenhum → o Jev decide (pergunta `agente`).
