---
id: client_preferences
tipo: memory
atualizado_em: 2026-10-28
---
# Memória — Preferências por Cliente

Preferências de marca e tom por clínica/unidade, aplicadas apenas quando a demanda pertence ao cliente do `escopo`. Lidas pelo `BrainLoader` e injetadas em `{{aprendizados}}` / rubrica (`[Cnn][normal]`, ou `[critico]` se o cliente exigir). Apenas entradas com `Status: ativo` são aplicadas; entradas `Status: exemplo` são ignoradas.

**Formato de entrada** (gerado por `BrainLoader.appendLearning`; `escopo:` no lugar de template):

```markdown
### C<nn> · <ISO-8601> · escopo: cliente:<slug_da_clinica> · fonte: <awr_humano|diretor_arte|seed> · <demandaId|—>
- **Regra:** <preferência imperativa, uma frase>
- **Motivo original:** "<texto do revisor ou do cliente>"
- **Status:** ativo
```

## Preferências por Cliente

> **EXEMPLO** — entrada ilustrativa para demonstrar o formato. Não representa preferência real e não é aplicada (`Status: exemplo`). Substituir por entradas reais quando a AWR cadastrar o cliente.

### C01 · 2026-10-28T09:00Z · escopo: cliente:royal_face_castanhal · fonte: seed · —
- **Regra:** [EXEMPLO] Royal Face Castanhal: tom acolhedor e próximo (evitar linguagem excessivamente técnica), nome da unidade "Royal Face Castanhal" sempre no rodapé e nunca usar fundo preto nas artes.
- **Motivo original:** "[exemplo] a unidade quer uma comunicação calorosa, com o nome da cidade visível e visual claro"
- **Status:** exemplo

## Log

<!-- APPEND-ONLY: o BrainLoader adiciona entradas abaixo desta linha -->
