---
id: botox
procedimento: botox
label: Toxina Botulínica (Botox)
versao: 1
atualizado_em: 2026-10-28
---
# Skill — Toxina Botulínica (Botox)

## 1. Contexto do Procedimento

**Objetivo estético:** suavização de linhas de expressão dinâmicas (testa, glabela, pés de galinha) com toxina botulínica, preservando a expressividade. A comunicação gira em torno de **prevenção, cuidado e naturalidade**, jamais de "rosto congelado" ou de eliminar rugas.

**Público-alvo:** adultos 30–60 anos (maiores de 18) que buscam aparência descansada e natural, valorizam segurança, avaliação médica e discrição. Tom: sereno, técnico-acolhedor, confiável.

**Promessa permitida:** informar sobre o procedimento, que exige **avaliação individual** e profissional habilitado; falar em "expressão natural", "aparência descansada", "cuidado com a pele", "avaliação".
**Promessa proibida:** garantia, duração fixa, eliminação de rugas, rejuvenescimento em anos, urgência.

### Compliance (obrigatório)

- **CFM Res. 2.336/2023 (médicos):** antes/depois somente com finalidade **educativa**, consentimento do paciente, condições idênticas de captura, sem sensacionalismo, sem garantia de resultado, sem sorteio/brinde. Aplicar o mesmo rigor a não médicos (conservador).
- **ANVISA (RDC 96/2008) — medicamento sob prescrição:** a toxina botulínica é medicamento de venda sob prescrição; **proibido** divulgar ao público leigo marca comercial (ex.: "Botox®" como produto), dose, unidades ou fabricante. Usar o termo genérico **"toxina botulínica"** e focar no procedimento/avaliação. O nome "Botox" só aparece se estiver no `{{briefing_cliente}}` e, ainda assim, preferir o termo genérico.
- **CDC / CONAR:** publicidade verdadeira e identificável; sem superlativos comprobatórios.
- **Meta Ads — Saúde e Aparência Pessoal:** sem percepção negativa ("você tem rugas?", "cansada de parecer mais velha?"), sem segmentar defeito em 2ª pessoa, sem promessa milagrosa, sem antes/depois exagerado. Antes/depois apenas com diferença **sutil e plausível**; público 18+. Se reprovado, usar `banco_imagem_*`.
- **Imagens geradas por IA** não representam paciente real: sempre incluir "Imagem ilustrativa." no disclaimer.
- **Identificação:** nunca inventar CRM/RQE; exibir somente se vier no `{{briefing_cliente}}`.

**Termos e afirmações PROIBIDOS:** "garantido", "garantia", "sem dor", "indolor", "definitivo", "elimina rugas", "acaba com as rugas", "apaga", "rejuvenesça X anos", "milagre", "100%", "instantâneo", "sem risco", "o melhor", "grátis", "brinde", "unidades", "dose", "Botox®" como marca, "flacidez" e "rugas" em tom de defeito, "você tem rugas?".

**Preço e condições comerciais:** permitidos quando vierem do briefing do cliente (ex.: "6x de R$ 99,90", "20% de desconto"). Renderizar exatamente como no briefing, na camada SVG, com destaque legível. Nunca inventar ou alterar valor, parcelamento ou validade.

**Disclaimer obrigatório (texto exato, sempre visível):**
`Imagem ilustrativa. Resultados podem variar de pessoa para pessoa. Procedimento realizado por profissional habilitado.`

## 2. Diretrizes Visuais e Paleta

> **Camadas:** esta paleta vale só quando a empresa **não** tem skill de marca (`skills/marcas/<rede>/`). Havendo marca, paleta, tipografia e logo vêm dela; aqui ficam as diretrizes clínicas da imagem.

**Paleta predominante (arte do procedimento):**
- Gelo `#EAF0F2` e porcelana `#F4F1EE` (fundos)
- Azul acinzentado `#9FB6C3` (superfícies/painel) e grafite azulado `#2F4858` (detalhes)
- Areia `#D9C3A5` (acento quente discreto)
- Textos: navy `#101a32` / ink `#10172f`. CTA AWR: lime `#b6e77a` com texto `#101a32`; neutro AWR `#f6f7f9`.
- Cliente pode trocar a paleta mantendo contraste (ver `template_composition`). Nunca fundo preto puro.

**Iluminação:** luz fria-neutra difusa (5500–6000 K), softbox frontal grande, sombras mínimas para que linhas de expressão fiquem reais mas não enfatizadas; sem luz rasante que acentue rugas.

**Estilo fotográfico:** retrato editorial limpo, lente 85 mm, f/4, testa/olhos/terço superior do rosto em destaque, pele com textura real, expressão serena e **naturalmente móvel** (sobrancelhas com leve movimento, nunca rosto rígido). Diversidade de idade (30–60) e tom de pele.

**Tipografia:** headline Manrope 800 (caixa de frase); corpo/disclaimer Inter 500; CTA Manrope 700; rótulos ANTES/DEPOIS Manrope 800 em caixa alta. Escala em `template_composition`.

**Evitar:** agulhas e seringas, frascos/ampolas com marca, sangue, hematomas, pápulas, edema; rosto "congelado"/pele de porcelana sem textura; sobrancelhas assimétricas ou caídas; olhos desalinhados; dedos/dentes deformados; rugas exageradas no "ANTES" (parecer caricatura); fundo preto; texto sobre os olhos.

## 3. Regras dos Templates

Regras gerais de ANTES/DEPOIS (valem para `antes_depois_*`): mesma pessoa, **mesmo ângulo**, **mesmo enquadramento**, **mesma iluminação e fundo**, mesma expressão (repouso e, se houver, contração idêntica nas duas); **nenhum filtro ou retoque no "DEPOIS"**; diferença sutil (suavização discreta, sem "pele de plástico"). Rótulos exatamente "ANTES" e "DEPOIS", caixa alta, PT-BR. Safe area **64 px**, canvas 1080×1350. Coordenadas exatas em `template_composition`.

### antes_depois_1
- **Layout:** split **vertical 50/50** — duas fotos lado a lado (468×700, gap 16 px), headline acima, CTA e disclaimer abaixo.
- **Fotos:** retrato do terço superior (testa, glabela e olhos), frontal, sobrancelhas na mesma altura do quadro nas duas metades. Rótulos nos cantos inferiores internos.
- **Posições:** logo topo-esq.; selo topo-dir.; headline x=64; CTA à esq. sob as fotos; disclaimer; nome da unidade no rodapé.
- **Headline:** máx. **52 caracteres**, até 2 linhas. Exemplo: "Expressão natural, com avaliação individual". **CTA** (máx. 28): "Agende sua avaliação".

### antes_depois_2
- **Layout:** split **horizontal empilhado** — ANTES em cima, DEPOIS embaixo, 952×380 cada (gap 16 px).
- **Fotos:** recorte panorâmico da região dos olhos e testa (sobrancelhas no terço superior do quadro, olhos no centro), idêntico nas duas. Rótulos no canto superior esquerdo.
- **Posições:** logo e selo no topo; headline de 2 linhas; CTA botão largura total (952×64); disclaimer; rodapé.
- **Headline:** máx. **52 caracteres**. Exemplo: "Cuidado com a pele e com a sua expressão". **CTA** (máx. 28): "Fale com a nossa equipe".

### banco_imagem_1
- **Layout:** foto **full-bleed** 1080×1350 com gradiente grafite/azulado de baixo para cima (a partir de y≈640); rosto sereno na metade superior (olhar levemente fora da câmera ou para a câmera), área inferior (y ≥ 740) limpa.
- **Posições:** logo topo-esq. e selo topo-dir. sobre placa branca 90%; headline em até 3 linhas (x=64, y=760); CTA em botão; disclaimer; rodapé.
- **Headline:** máx. **56 caracteres**. Exemplo: "Toxina botulínica com avaliação e segurança". **CTA** (máx. 26): "Agende sua avaliação".

### banco_imagem_2
- **Layout:** **split horizontal institucional** — foto superior 1080×760 (retrato de perfil três-quartos, luz suave) e painel sólido inferior 1080×590 (azul acinzentado claro `#EAF0F2` ou porcelana) com todo o texto.
- **Posições:** logo e selo na linha superior do painel; headline (até 3 linhas); CTA botão; disclaimer; rodapé.
- **Headline:** máx. **64 caracteres**. Exemplo: "Entenda como a toxina botulínica pode ser indicada para você". **CTA** (máx. 26): "Conheça o procedimento".

## 4. Prompt Base gpt-image-2

```prompt
Create a photorealistic, professional advertising image for an aesthetic clinic in Brazil.

PROCEDURE THEME: {{procedimento_label}} (facial expression-line care). Evoke the area (forehead, glabella, eyes) only; NEVER show the procedure being performed and NEVER show product vials or brand names.
TEMPLATE: {{template_id}} — {{template_descricao}}
CLINIC: {{clinica_nome}}
CLIENT BRIEFING: {{briefing_cliente}}

CANVAS: 1080x1350 px, vertical 4:5. Follow the template layout exactly (photo boxes, split proportions and clean zones as described). Keep a 64 px safe margin free of important content.

PHOTOGRAPHY: clean editorial portrait, 85mm lens, f/4, soft diffused neutral-cool light (5500-6000K), frontal softbox, minimal shadows, real skin texture with pores and natural fine lines, faithful skin tone. Subject: adult (30-60), serene expression, eyebrows naturally mobile and symmetric, eyes aligned, anatomically correct face, hands and teeth. For BEFORE/AFTER layouts: the SAME person, SAME angle, SAME framing, SAME lighting, SAME expression and background in both photos; the AFTER differs only by a subtle, plausible softening of expression lines; NO filter, NO retouching, NO smoothing beyond reality, NO color grading difference. Never make the face look frozen or mask-like.

COMPOSITION: leave clean, low-detail areas (soft uniform background or gradient) wherever the template reserves space for headline, CTA, seal, logo, disclaimer and footer, because text is composited programmatically afterwards. Do not place the face or eyes under those zones.

TEXT POLICY: do NOT draw any letters, numbers, logos, watermarks, captions or fake UI in the image. If the template absolutely requires in-image text, the ONLY allowed strings, in Brazilian Portuguese with exact spelling and accents, are: "{{headline}}", "{{cta}}", "ANTES", "DEPOIS". Never use English words.

NEGATIVE CONSTRAINTS: no needles, syringes, vials, gloves or injection scenes; no blood, bruising, bumps, swelling or redness; no frozen or porcelain-plastic skin; no drooping or asymmetric eyebrows; no misaligned eyes; no extra, missing or deformed fingers or teeth; no beauty filter; no black background; no exaggerated wrinkles in the BEFORE photo; no guarantee or miraculous claims; no product brand logos.

ADJUSTMENTS REQUESTED (apply with priority; empty means none): {{feedback_ajuste}}
LEARNED RULES (mandatory, never violate): {{aprendizados}}
```

## 5. Checklist de Rubrica do Diretor de Arte

- [R01][critico] O disclaimer legal ("Imagem ilustrativa. Resultados podem variar de pessoa para pessoa. Procedimento realizado por profissional habilitado.") está visível e completo?
- [R02][critico] A arte está livre de garantia, promessa de resultado e de marca/dose do produto (ex.: "garantido", "elimina rugas", "Botox®", "unidades"; preço/parcelamento do briefing são permitidos)?
- [R03][critico] Todo o texto visível está em português do Brasil, escrito exatamente como esperado, sem erros de ortografia e sem palavras em inglês?
- [R04][critico] O rosto, os olhos e as sobrancelhas estão anatomicamente corretos (simétricos, alinhados, sem dedos ou dentes deformados)?
- [R05][critico] Headline, CTA e disclaimer estão legíveis, com contraste suficiente e sem cortes ou sobreposição entre si?
- [R06][critico] A geometria do template foi respeitada (fotos, headline, CTA, selo, logo e rodapé nas posições previstas e dentro da margem de segurança)?
- [R07][normal] Se há comparação ANTES/DEPOIS, as duas fotos têm o mesmo ângulo, enquadramento, expressão e iluminação (Sim também se não houver comparação)?
- [R08][normal] Se há comparação ANTES/DEPOIS, a diferença é sutil e plausível, sem rugas caricatas no ANTES nem pele de plástico no DEPOIS (Sim também se não houver comparação)?
- [R09][critico] A imagem está livre de agulhas, seringas, frascos, sangue, hematomas e inchaço visível?
- [R10][normal] A pele tem textura realista e a expressão parece naturalmente móvel (nada de rosto congelado ou filtro evidente)?
- [R11][normal] A headline é o elemento de maior destaque, seguida pelo CTA, com hierarquia visual clara?
- [R12][normal] O logo está visível e sem deformação, e o nome da clínica aparece no rodapé (Sim também se for peça de acervo sem clínica)?
- [R13][normal] A paleta é coerente (gelo/azul acinzentado/porcelana com texto escuro) e sem fundo preto?
- [R14][normal] A imagem transmite serenidade e cuidado, sem sugerir defeito, envelhecimento ou inadequação da pessoa retratada?

## Self-Improvement Log

<!-- APPEND-ONLY: o BrainLoader adiciona entradas abaixo desta linha -->
