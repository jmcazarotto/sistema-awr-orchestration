---
id: global_learnings
tipo: memory
atualizado_em: 2026-10-28
---
# Memória — Aprendizados Globais

Erros que **não podem se repetir**, válidos para todos os procedimentos, templates e clientes. Lidos pelo `BrainLoader` e injetados em `{{aprendizados}}` (prompt) e na rubrica do Diretor de Arte como itens extras `[Gnn][critico]`. Apenas entradas com `Status: ativo` são aplicadas.

**Formato de entrada** (gerado por `BrainLoader.appendLearning`; `escopo:` no lugar de template):

```markdown
### G<nn> · <ISO-8601> · escopo: <global|procedimento:<id>|template:<id>> · fonte: <awr_humano|diretor_arte|seed> · <demandaId|—>
- **Regra:** <regra imperativa, uma frase>
- **Motivo original:** "<texto do revisor>"
- **Status:** ativo
```

## Regras Consolidadas

### G01 · 2026-10-28T09:00Z · escopo: global · fonte: seed · —
- **Regra:** Nunca renderizar palavras em inglês na arte; usar sempre PT-BR (ex.: "ANTES"/"DEPOIS", "Agende sua avaliação", nunca "Before"/"After"/"Book now").
- **Motivo original:** "texto gerado pelo modelo saiu em inglês e com ortografia errada"
- **Status:** ativo

### G02 · 2026-10-28T09:00Z · escopo: global · fonte: seed · —
- **Regra:** O disclaimer legal deve estar sempre presente, completo, com no mínimo 22 px e contraste ≥ 4.5:1, sem ser cortado, sobreposto ou encoberto por foto/gradiente.
- **Motivo original:** "arte aprovada sem aviso de resultados individuais; risco de reprovação na Meta e no CFM"
- **Status:** ativo

### G03 · 2026-10-28T09:00Z · escopo: global · fonte: seed · —
- **Regra:** Nunca mostrar agulhas, seringas, cânulas, fios à mostra, sangue, hematomas ou inchaço; evocar apenas a região tratada, nunca o ato do procedimento.
- **Motivo original:** "imagem de injeção em close gera reprovação de política de saúde e desconforto no público"
- **Status:** ativo

## Log

<!-- APPEND-ONLY: o BrainLoader adiciona entradas abaixo desta linha -->
