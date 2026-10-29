---
id: arte_final_ia
tipo: tecnica
label: Arte final por IA (Van Gogh)
agente: van_gogh
versao: 1
atualizado_em: 2026-10-29
---
# Técnica — Arte final completa por IA

Método do **Van Gogh** para demandas de clientes: o modelo de imagem gera a **arte inteira** (fotografia, tipografia, cards, pills e bloco comercial) seguindo a skill da marca e as referências aprovadas. Não há camada SVG; a única etapa de composição posterior é a aplicação do **logo oficial** (PNG cadastrado em Empresas), porque a marca proíbe logo redesenhado por IA.

## 1. Objetivo

Entregar uma peça pronta para publicar, fiel à identidade da marca do cliente, com os textos do briefing escritos exatamente como foram passados e sem nenhuma informação inventada.

## 2. Pipeline

1. **Contexto:** agente (SOUL + regras) + skill da marca (`marcas/<rede>/marca.skill.md`, §1–§4) + skill do procedimento (§1 compliance e disclaimer) + esta técnica.
2. **Briefing → textos exatos:** preço/parcelamento, desconto, datas, contato e textos entre aspas são extraídos por regra e enviados como lista de strings literais. Sem oferta no briefing → instrução explícita de não desenhar bloco comercial.
3. **Composição:** escolhida pelo tipo de arte (`banco_imagem_1` → `modelo_destaque`/`close_procedimento`; `banco_imagem_2` → `informativa_clean`). `antes_depois_*` exige fotos reais do cliente e não é gerado por IA.
4. **Referências:** 2–3 imagens do índice da marca (mesmo procedimento e composição compatível; completa com `modelo_destaque`), enviadas como imagens de apoio, reduzidas para economizar tokens.
5. **Geração:** modelo de imagem das Configurações (Van Gogh), 4:5 (1088×1360 → arte final 1080×1350).
6. **Logo:** a IA desenha um **marcador magenta** (#FF00FF, ~300×130 px) onde o logo deve ficar naquela composição; o sistema detecta o marcador, apaga-o com a cor do entorno e aplica o PNG oficial ali, centralizado e sem alterar pixels. Variante pela luminância do fundo (claro → logo para fundo claro; escuro → logo para fundo escuro). Sem marcador, usa a zona mais limpa (topo/rodapé × esquerda/centro/direita).
7. **Revisão:** Diretor de Arte avalia rubrica do procedimento (R), da marca (M) e desta técnica (T).

## 3. Regras de Geração

- Escrever **somente** os textos da lista de textos exatos (mais o disclaimer e no máximo **uma** linha curta de benefício, até 5 palavras, dentro da promessa permitida pela skill do procedimento). Nada de lista de benefícios, preço, parcela, data, telefone, endereço, selo ou nome da clínica/marca que não esteja na lista.
- O nome da empresa/unidade é removido do briefing enviado à IA: a marca aparece só pelo logo oficial aplicado depois.
- Texto em português do Brasil com acentuação correta; números e casas decimais idênticos ao briefing (`6x de R$ 99,90`, nunca `6x R$99,9`).
- Disclaimer obrigatório do procedimento em fonte pequena e legível no rodapé.
- Margem segura de 64 px; nenhum texto cortado.
- Nunca desenhar logo nem o nome da marca: no lugar do logo vai só o marcador magenta liso.
- Referências guiam composição, ritmo e tipografia — não copiar fotos, rostos ou textos delas.

## 4. Prompt Base

```prompt
Create a finished 4:5 Instagram feed ad (portrait, 1080x1350 proportions) for a Brazilian aesthetic clinic. The whole piece is final: photography, typography, cards and layout in one image.

{{marca_prompt}}

PROCEDURE: {{procedimento_label}}. Composition: {{composicao}}.
{{procedimento_contexto}}

EXACT TEXTS (Portuguese, write them exactly, character by character, with correct accents and decimals). These are the ONLY texts allowed, besides the disclaimer and at most ONE short benefit line (max 5 words) built only from the allowed promise above. No benefit lists, no icon+label rows, no extra claims, no clinic or brand name:
{{textos_exatos}}
{{oferta}}
FOOTER DISCLAIMER (small, legible, exactly): "{{disclaimer}}"

LOGO PLACEHOLDER: do not draw any logo. Instead, draw ONE solid flat pure magenta (#FF00FF) rectangle of about 300x130 px exactly where the brand logo should sit in this composition (usually the top area, inside the 64 px safe margin, over a calm background). Pure flat #FF00FF only: no text, no border, no shadow, no gradient, and nothing else magenta anywhere in the image. It will be replaced by the official logo file.

REFERENCES: the attached images are approved pieces of this brand. Follow their composition rhythm, spacing, typography contrast and color mood. Do not copy their faces, photos, texts, benefit lists or logo. Replace any navy blue from them with soft black/graphite. Ignore any price/installment block they show unless it is listed in EXACT TEXTS.
{{referencias}}

CLIENT BRIEFING (context only, do not write it verbatim): {{briefing_cliente}}
{{feedback_ajuste}}
{{aprendizados}}
```

## 5. Checklist de Rubrica da Técnica

- [T01][critico] Todos os textos da arte estão escritos exatamente como no briefing, sem erro de grafia, acento ou número?
- [T02][critico] A arte está livre de textos, preços, datas ou selos que não estejam no briefing?
- [T03][critico] O disclaimer obrigatório está presente, legível e com o texto exato?
- [T04][normal] Nenhum texto está cortado e todos respeitam a margem segura de 64 px?
- [T05][normal] A arte está no formato 4:5 (1080 × 1350) e o logo oficial ficou em área limpa e legível?

## Self-Improvement Log

<!-- APPEND-ONLY: aprendizados da técnica de arte final por IA. Não editar entradas antigas. -->
