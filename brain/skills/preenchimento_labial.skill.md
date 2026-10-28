---
id: preenchimento_labial
procedimento: preenchimento_labial
label: Preenchimento Labial
versao: 1
atualizado_em: 2026-10-28
---
# Skill — Preenchimento Labial

## 1. Contexto do Procedimento

**Objetivo estético:** harmonização dos lábios com ácido hialurônico — hidratação, contorno, simetria e proporção em relação ao rosto. O foco da comunicação é **naturalidade e equilíbrio**, nunca volume extremo.

**Público-alvo:** mulheres (e homens) maiores de 18 anos, 25–55 anos, que buscam realçar a boca de forma discreta e que valorizam segurança e avaliação profissional. Tom: acolhedor, elegante, informativo.

**Promessa permitida:** informar que o procedimento existe, que exige **avaliação individual** e que é feito por profissional habilitado. Pode-se falar em "harmonia", "contorno", "hidratação", "naturalidade", "cuidado", "avaliação".
**Promessa proibida:** qualquer garantia, comparação de superioridade, urgência ou apelo comercial de preço.

### Compliance (obrigatório)

- **CFM Res. 2.336/2023 (médicos):** antes/depois só com finalidade **educativa**, com **consentimento** do paciente, mesmas condições de captura nas duas fotos, sem sensacionalismo, sem garantia ou promessa de resultado, sem divulgar preço, promoção, sorteio ou brinde. Aplicar o mesmo rigor a profissionais não médicos (conservador).
- **CDC / CONAR:** publicidade verdadeira, identificável e que não induza a erro; sem superlativos comprobatórios ("o melhor", "número 1").
- **ANVISA:** não citar marcas comerciais de preenchedores, nem doses/volumes (ex.: "1 ml").
- **Meta Ads — Saúde e Aparência Pessoal:** proibido gerar percepção negativa do corpo ("seus lábios são finos?"), segmentar defeito em 2ª pessoa, prometer resultado milagroso ou mostrar antes/depois exagerado/improvável. Antes/depois só com diferença **sutil e plausível**; público 18+. Se o antes/depois for reprovado pela plataforma, usar `banco_imagem_*`.
- **Imagens geradas por IA** nunca representam paciente real: sempre incluir "Imagem ilustrativa." no disclaimer. Resultados reais de pacientes devem vir de acervo próprio com consentimento (fora do escopo desta skill).
- **Identificação:** nunca inventar CRM/RQE ou registro profissional; só exibir se vier no `{{briefing_cliente}}`.

**Termos e afirmações PROIBIDOS (em qualquer texto da arte):** "garantido", "garantia", "sem dor", "indolor", "definitivo", "para sempre", "milagre", "milagroso", "100%", "perfeito/perfeita", "instantâneo", "sem risco", "o melhor", "número 1", "promoção", "desconto", "grátis", "brinde", "R$", "parcelado", "só hoje", "últimas vagas", "boca dos sonhos", "lábios finos demais", "corrija seus lábios", marcas de produtos.

**Disclaimer obrigatório (texto exato, sempre visível):**
`Imagem ilustrativa. Resultados podem variar de pessoa para pessoa. Procedimento realizado por profissional habilitado.`

## 2. Diretrizes Visuais e Paleta

**Paleta predominante (arte do procedimento):**
- Rosé suave `#C9777F` (acento) e nude `#F3D9D2` (superfícies)
- Bordô discreto `#8C3B4A` (detalhes, selo)
- Off-white `#FBF5F2` (fundos claros) e branco `#FFFFFF`
- Textos: navy `#101a32` / ink `#10172f`. Acento de marca AWR (CTA): lime `#b6e77a` com texto `#101a32`; fundo neutro AWR `#f6f7f9`.
- A arte do cliente pode trocar a paleta, mantendo contraste mínimo (ver skill `template_composition`). Nunca fundo preto puro.

**Iluminação:** luz natural difusa de janela / softbox grande, temperatura 5000–5500 K, sombras suaves, sem flash estourado; brilho labial discreto (sem gloss exagerado).

**Estilo fotográfico:** retrato editorial de beleza, lente 85 mm, f/2.8, foco nos lábios e terço inferior do rosto, pele com textura real (poros, penugem), tom de pele fiel, sem filtro de beleza. Diversidade de tons de pele e idades (25–55).

**Tipografia:** headline Manrope 800 (caixa de frase, sem CAPS LOCK corrido); corpo e disclaimer Inter 500; CTA Manrope 700; rótulos ANTES/DEPOIS Manrope 800 em caixa alta. Escala completa em `template_composition`.

**Evitar:** agulhas e seringas (inclusive close), sangue, hematomas, edema/inchaço exagerado, lábios "efeito pato"/assimétricos, dentes deformados ou em excesso, dedos extras/deformados, pele plástica, maquiagem pesada que dificulte avaliar o lábio, fundo preto, texto sobre a boca.

## 3. Regras dos Templates

Regras gerais de ANTES/DEPOIS (valem para os dois templates `antes_depois_*`): mesma pessoa, **mesmo ângulo**, **mesmo enquadramento**, **mesma iluminação e fundo**, mesma expressão neutra; **nenhum filtro, retoque ou ajuste de cor no "DEPOIS"**; diferença sutil e realista (contorno/hidratação), sem inchaço. Rótulos exatamente "ANTES" e "DEPOIS", em PT-BR, caixa alta. Margem de segurança: **64 px** em todos os lados (canvas 1080×1350). Coordenadas exatas em `template_composition`.

### antes_depois_1
- **Layout:** split **vertical 50/50** — duas fotos lado a lado (468×700 cada, gap 16 px), headline acima, CTA e disclaimer abaixo.
- **Fotos:** close dos lábios e terço inferior do rosto, frontal, mesmo centro de lábio nas duas metades. Rótulos nos cantos inferiores internos de cada foto.
- **Posições:** logo topo-esq.; selo topo-dir.; headline abaixo do topo (x=64); CTA alinhado à esq. sob as fotos; disclaimer sob o CTA; nome da unidade no rodapé.
- **Headline:** máx. **52 caracteres**, até 2 linhas. Exemplo: "Harmonia e naturalidade nos lábios". **CTA** (máx. 28): "Agende sua avaliação".

### antes_depois_2
- **Layout:** split **horizontal empilhado** — foto ANTES em cima, DEPOIS embaixo, cada uma 952×380 (gap 16 px), largura total dentro da safe area.
- **Fotos:** recorte panorâmico dos lábios (centro da boca no meio do quadro, nariz parcial no topo), idêntico nas duas. Rótulos no canto superior esquerdo de cada foto.
- **Posições:** logo topo-esq.; selo topo-dir.; headline de 2 linhas; CTA em botão largura total (952×64); disclaimer e rodapé abaixo.
- **Headline:** máx. **52 caracteres**. Exemplo: "Lábios com contorno equilibrado". **CTA** (máx. 28): "Fale com a nossa equipe".

### banco_imagem_1
- **Layout:** foto **full-bleed** 1080×1350 com gradiente escuro/rosé de baixo para cima (a partir de y≈640) para sustentar o texto; sujeito (lábios/rosto) na metade superior, área inferior (y ≥ 740) limpa e de baixa complexidade.
- **Posições:** logo topo-esq. e selo topo-dir. sobre placa branca 90%; headline em 3 linhas no terço inferior (x=64, y=760); CTA em botão abaixo; disclaimer e rodapé no fim.
- **Headline:** máx. **56 caracteres**. Exemplo: "Cuidar dos lábios com segurança e naturalidade". **CTA** (máx. 26): "Agende sua avaliação".

### banco_imagem_2
- **Layout:** **split horizontal institucional** — foto superior 1080×760 (retrato de beleza, lábios em destaque, sem texto sobre a foto) e painel de cor sólida inferior (rosé `#F3D9D2` ou off-white) 1080×590 com todo o texto.
- **Posições:** logo e selo na linha superior do painel; headline abaixo (até 3 linhas); CTA em botão; disclaimer e rodapé no fim do painel.
- **Headline:** máx. **64 caracteres**. Exemplo: "Avaliação individual para lábios mais harmônicos". **CTA** (máx. 26): "Conheça o procedimento".

## 4. Prompt Base gpt-image-2

```prompt
Create a photorealistic, professional advertising image for an aesthetic clinic in Brazil.

PROCEDURE THEME: {{procedimento_label}} (lip aesthetics). Evoke the procedure area only; NEVER show the procedure being performed.
TEMPLATE: {{template_id}} — {{template_descricao}}
CLINIC: {{clinica_nome}}
CLIENT BRIEFING: {{briefing_cliente}}

CANVAS: 1080x1350 px, vertical 4:5. Follow the template layout exactly (photo boxes, split proportions and clean zones as described). Keep a 64 px safe margin free of important content.

PHOTOGRAPHY: editorial beauty portrait, 85mm lens, f/2.8, soft diffused natural window light (5000-5500K), real skin texture with visible pores and fine vellus hair, faithful skin tone, subtle natural lip color and sheen, anatomically correct lips, teeth and hands. Subject: adult (25-55), neutral relaxed expression, no heavy makeup. For BEFORE/AFTER layouts: the SAME person, SAME angle, SAME framing, SAME lighting and background in both photos; the AFTER differs only by a subtle, plausible improvement in lip contour and hydration; NO filter, NO retouching, NO color grading difference. Never exaggerate volume.

COMPOSITION: leave clean, low-detail areas (soft uniform background or gradient) wherever the template reserves space for headline, CTA, seal, logo, disclaimer and footer, because text is composited programmatically afterwards. Do not place faces or lips under those zones.

TEXT POLICY: do NOT draw any letters, numbers, logos, watermarks, captions or fake UI in the image. If the template absolutely requires in-image text, the ONLY allowed strings, in Brazilian Portuguese with exact spelling and accents, are: "{{headline}}", "{{cta}}", "ANTES", "DEPOIS". Never use English words.

NEGATIVE CONSTRAINTS: no needles, syringes, gloves or injection scenes; no blood, bruising, swelling or redness; no duck-lips or asymmetric lips; no extra, missing or deformed fingers or teeth; no plastic or airbrushed skin; no beauty filter; no black background; no price, discount, guarantee or promotional claims; no before/after exaggeration; no brand logos of products.

ADJUSTMENTS REQUESTED (apply with priority; empty means none): {{feedback_ajuste}}
LEARNED RULES (mandatory, never violate): {{aprendizados}}
```

## 5. Checklist de Rubrica do Diretor de Arte

- [R01][critico] O disclaimer legal ("Imagem ilustrativa. Resultados podem variar de pessoa para pessoa. Procedimento realizado por profissional habilitado.") está visível e completo?
- [R02][critico] A arte está livre de preço, promoção, garantia e promessa de resultado (ex.: "garantido", "100%", "definitivo", "milagre", "R$")?
- [R03][critico] Todo o texto visível está em português do Brasil, escrito exatamente como esperado, sem erros de ortografia e sem palavras em inglês?
- [R04][critico] Os lábios e o rosto estão anatomicamente corretos (sem distorção, assimetria exagerada, dentes ou dedos deformados)?
- [R05][critico] Headline, CTA e disclaimer estão legíveis, com contraste suficiente e sem cortes ou sobreposição entre si?
- [R06][critico] A geometria do template foi respeitada (fotos, headline, CTA, selo, logo e rodapé nas posições previstas e dentro da margem de segurança)?
- [R07][normal] Se há comparação ANTES/DEPOIS, as duas fotos têm o mesmo ângulo, enquadramento e iluminação (Sim também se não houver comparação)?
- [R08][normal] Se há comparação ANTES/DEPOIS, a diferença é sutil e plausível, sem volume exagerado (Sim também se não houver comparação)?
- [R09][critico] A imagem está livre de agulhas, seringas, sangue, hematomas e inchaço visível?
- [R10][normal] A pele tem textura realista, sem aspecto plástico ou filtro de beleza evidente?
- [R11][normal] A headline é o elemento de maior destaque, seguida pelo CTA, com hierarquia visual clara?
- [R12][normal] O logo está visível e sem deformação, e o nome da clínica aparece no rodapé (Sim também se for peça de acervo sem clínica)?
- [R13][normal] A paleta é coerente (tons rosé/nude/off-white com texto escuro) e sem fundo preto?
- [R14][normal] A imagem transmite acolhimento e naturalidade, sem sugerir defeito ou inadequação da pessoa retratada?

## Self-Improvement Log

<!-- APPEND-ONLY: o BrainLoader adiciona entradas abaixo desta linha -->
