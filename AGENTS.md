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
| `CLASSIFICADA` | `EM_PRODUCAO` | Diretor despacha `PRODUZIR_ARTE` |
| `EM_PRODUCAO` | `EM_REVISAO_DIRETOR` | Criador envia `ARTE_ENTREGUE` |
| `EM_REVISAO_DIRETOR` | `EM_AJUSTE_IA` | Rubrica reprovada e `tentativa < MAX_DIRECTOR_ATTEMPTS` |
| `EM_AJUSTE_IA` | `EM_REVISAO_DIRETOR` | Criador reenvia `ARTE_ENTREGUE` |
| `EM_REVISAO_DIRETOR` | `AGUARDANDO_APROVACAO_AWR` | Rubrica aprovada **ou** tentativas esgotadas (`escalada=true`) |
| `AGUARDANDO_APROVACAO_AWR` | `APROVADA_SALVA_NO_ACERVO` | Humano "Aprovar" → arquivo movido de `_staging/` para `acervo/<procedimento>/` |
| `AGUARDANDO_APROVACAO_AWR` | `REPROVADA_HUMANO` | Humano "Solicitar Ajuste" + motivo → `BrainLoader.appendLearning()` |
| `REPROVADA_HUMANO` | `EM_PRODUCAO` | Diretor despacha `AJUSTAR_ARTE` ao criador original (hop+1) |

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

### 6.2 `brain/skills/<procedimento>.skill.md`

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

**Rubrica:** linhas no formato exato `- [Rnn][critico|normal] Pergunta?`. Regra de aprovação:
todos os itens `critico` = **Sim** **e** ≥ 80% dos itens `normal` = **Sim**.
Aprendizados ativos do Self-Improvement Log viram itens extras `[Lnn][critico]` na rubrica.

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

### 6.3 `brain/skills/template_composition.skill.md`

Skill transversal: geometria dos 4 tipos de template (grid, safe-area, posições de headline/CTA/selo/logo), formatos de saída (1080×1350 feed 4:5 padrão; 1080×1920 stories opcional) e regras de composição híbrida (Sharp/SVG + `gpt-image-2`).

### 6.4 `brain/memory/*.md`

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
