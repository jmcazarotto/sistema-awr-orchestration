---
id: fios_sustentacao
procedimento: fios_sustentacao
label: Fios de Sustentação
versao: 1
atualizado_em: 2026-10-28
---
# Skill — Fios de Sustentação

## 1. Contexto do Procedimento

**Objetivo estético:** sustentação e reposicionamento sutil de tecidos faciais (contorno mandibular, terço médio, pescoço) com fios de PDO/PLLA, com possível estímulo de colágeno. A comunicação trata de **contorno, sustentação e firmeza com naturalidade**, nunca de "lifting sem cirurgia" garantido.

**Público-alvo:** adultos 35–65 anos (maiores de 18) que percebem perda de definição do contorno e querem opção minimamente invasiva, com avaliação criteriosa. Tom: elegante, técnico, seguro, sem alarmismo.

**Promessa permitida:** informar que existe a técnica, que a **indicação depende de avaliação individual** e que é feita por profissional habilitado; falar em "contorno", "sustentação", "estímulo de colágeno" (apenas de forma informativa), "avaliação".
**Promessa proibida:** garantia, duração fixa, "efeito lifting", comparação com cirurgia, urgência.

### Compliance (obrigatório)

- **CFM Res. 2.336/2023 (médicos):** antes/depois somente com finalidade **educativa**, consentimento do paciente, mesmas condições de captura, sem sensacionalismo, sem garantia de resultado, sem sorteio/brinde. Aplicar o mesmo rigor a não médicos (conservador).
- **ANVISA:** fios são produtos para saúde registrados; não citar marcas/fabricantes nem alegações terapêuticas não aprovadas (ex.: "rejuvenescimento comprovado", "substitui cirurgia").
- **CDC / CONAR:** publicidade verdadeira e identificável; sem superlativos comprobatórios; não minimizar riscos nem induzir a erro.
- **Meta Ads — Saúde e Aparência Pessoal:** sem percepção negativa ("sua face está caída?", "papada?"), sem segmentar defeito em 2ª pessoa, sem promessa milagrosa, sem antes/depois exagerado ou improvável. Antes/depois apenas com diferença **sutil e plausível**; público 18+. Se reprovado, usar `banco_imagem_*`.
- **Imagens geradas por IA** não representam paciente real: sempre incluir "Imagem ilustrativa." no disclaimer.
- **Identificação:** nunca inventar CRM/RQE; exibir somente se vier no `{{briefing_cliente}}`.

**Termos e afirmações PROIBIDOS:** "garantido", "garantia", "sem dor", "indolor", "sem cirurgia" como promessa de equivalência, "lifting", "efeito lifting", "definitivo", "para sempre", "milagre", "100%", "instantâneo", "sem risco", "sem recuperação", "volta no tempo", "tira X anos", "o melhor", "grátis", "brinde", "papada", "flacidez" em tom de defeito, marcas de fios.

**Preço e condições comerciais:** permitidos quando vierem do briefing do cliente (ex.: "6x de R$ 99,90", "20% de desconto"). Renderizar exatamente como no briefing, na camada SVG, com destaque legível. Nunca inventar ou alterar valor, parcelamento ou validade.

**Disclaimer obrigatório (texto exato, sempre visível):**
`Imagem ilustrativa. Resultados podem variar de pessoa para pessoa. Procedimento realizado por profissional habilitado.`

## 2. Diretrizes Visuais e Paleta

> **Camadas:** esta paleta vale só quando a empresa **não** tem skill de marca (`skills/marcas/<rede>/`). Havendo marca, paleta, tipografia e logo vêm dela; aqui ficam as diretrizes clínicas da imagem.

**Paleta predominante (arte do procedimento):**
- Champagne `#E9DCC9` e off-white `#F6F7F9` (fundos)
- Dourado fosco `#B89B72` (acento/selo, uso discreto)
- Grafite navy `#1F2A3C` (painéis, detalhes)
- Textos: navy `#101a32` / ink `#10172f`. CTA AWR: lime `#b6e77a` com texto `#101a32`.
- Cliente pode trocar a paleta mantendo contraste (ver `template_composition`). Nunca fundo preto puro; dourado nunca brilhante/metálico saturado.

**Iluminação:** luz lateral suave (softbox a ~45°, razão de luz baixa) que revela o contorno sem acentuar flacidez; temperatura 5200–5600 K; **idêntica** nas fotos de comparação.

**Estilo fotográfico:** retrato editorial de beleza em perfil ou três-quartos, lente 85 mm, f/4, enfoque em linha da mandíbula, bochecha e pescoço, cabelo preso/afastado do contorno, pele com textura real, postura ereta com queixo em posição neutra (mesma inclinação de cabeça nas duas fotos). Diversidade de tom de pele e idade (35–65).

**Tipografia:** headline Manrope 800 (caixa de frase); corpo/disclaimer Inter 500; CTA Manrope 700; rótulos ANTES/DEPOIS Manrope 800 caixa alta. Escala em `template_composition`.

**Evitar:** agulhas, cânulas e fios visíveis (inclusive close), sangue, hematomas, covinhas/repuxos, edema; pele esticada artificialmente ("efeito máscara"); contorno mandibular irreal ou pescoço alongado; distorção de orelha/maxilar; cabelo ocultando o contorno; inclinação de queixo diferente entre ANTES e DEPOIS (falseia o resultado); dedos/dentes deformados; fundo preto; texto sobre o rosto.

## 3. Regras dos Templates

Regras gerais de ANTES/DEPOIS (valem para `antes_depois_*`): mesma pessoa, **mesmo ângulo**, **mesma inclinação de cabeça/queixo**, **mesmo enquadramento**, **mesma iluminação e fundo**; **nenhum filtro, retoque ou liquify no "DEPOIS"**; diferença sutil e plausível. Rótulos exatamente "ANTES" e "DEPOIS", caixa alta, PT-BR. Safe area **64 px**, canvas 1080×1350. Coordenadas exatas em `template_composition`.

### antes_depois_1
- **Layout:** split **vertical 50/50** — duas fotos lado a lado (468×700, gap 16 px), headline acima, CTA e disclaimer abaixo.
- **Fotos:** perfil ou três-quartos do rosto até o pescoço (mandíbula, bochecha, pescoço visíveis), mesma altura de orelha e queixo nas duas metades. Rótulos nos cantos inferiores internos.
- **Posições:** logo topo-esq.; selo topo-dir.; headline x=64; CTA à esq. sob as fotos; disclaimer; nome da unidade no rodapé.
- **Headline:** máx. **52 caracteres**, até 2 linhas. Exemplo: "Contorno facial com avaliação individual". **CTA** (máx. 28): "Agende sua avaliação".

### antes_depois_2
- **Layout:** split **horizontal empilhado** — ANTES em cima, DEPOIS embaixo, 952×380 cada (gap 16 px).
- **Fotos:** recorte panorâmico lateral do contorno (da orelha ao queixo, com parte do pescoço), enquadrado de modo que a linha da mandíbula cruze o quadro na mesma altura nas duas. Rótulos no canto superior esquerdo.
- **Posições:** logo e selo no topo; headline de 2 linhas; CTA botão largura total (952×64); disclaimer; rodapé.
- **Headline:** máx. **52 caracteres**. Exemplo: "Sustentação pensada para o seu rosto". **CTA** (máx. 28): "Fale com a nossa equipe".

### banco_imagem_1
- **Layout:** foto **full-bleed** 1080×1350 com gradiente grafite navy de baixo para cima (a partir de y≈640); retrato em perfil elegante na metade superior, área inferior (y ≥ 740) limpa.
- **Posições:** logo topo-esq. e selo topo-dir. sobre placa branca 90%; headline em até 3 linhas (x=64, y=760); CTA em botão; disclaimer; rodapé.
- **Headline:** máx. **56 caracteres**. Exemplo: "Fios de sustentação: indicação só após avaliação". **CTA** (máx. 26): "Agende sua avaliação".

### banco_imagem_2
- **Layout:** **split horizontal institucional** — foto superior 1080×760 (retrato três-quartos, luz lateral suave) e painel sólido inferior 1080×590 (champagne `#E9DCC9` ou off-white) com todo o texto.
- **Posições:** logo e selo na linha superior do painel; headline (até 3 linhas); CTA botão; disclaimer; rodapé.
- **Headline:** máx. **64 caracteres**. Exemplo: "Conheça a técnica e saiba se ela é indicada para você". **CTA** (máx. 26): "Conheça o procedimento".

## 4. Prompt Base gpt-image-2

```prompt
Create a photorealistic, professional advertising image for an aesthetic clinic in Brazil.

PROCEDURE THEME: {{procedimento_label}} (facial contour and support). Evoke the jawline, cheek and neck area only; NEVER show threads, cannulas, needles or the procedure being performed.
TEMPLATE: {{template_id}} — {{template_descricao}}
CLINIC: {{clinica_nome}}
CLIENT BRIEFING: {{briefing_cliente}}

CANVAS: 1080x1350 px, vertical 4:5. Follow the template layout exactly (photo boxes, split proportions and clean zones as described). Keep a 64 px safe margin free of important content.

PHOTOGRAPHY: editorial beauty portrait in profile or three-quarter view, 85mm lens, f/4, soft side light from a large softbox at about 45 degrees (5200-5600K), low light ratio, real skin texture with pores, faithful skin tone, hair pulled away from the jawline, upright posture with the chin in a neutral position. Subject: adult (35-65), anatomically correct jaw, ear, neck, hands and teeth. For BEFORE/AFTER layouts: the SAME person, SAME angle, SAME head and chin tilt, SAME framing, SAME lighting and background in both photos; the AFTER differs only by a subtle, plausible improvement in jawline definition; NO filter, NO retouching, NO liquify or warping, NO color grading difference. Never make the skin look stretched or mask-like.

COMPOSITION: leave clean, low-detail areas (soft uniform background or gradient) wherever the template reserves space for headline, CTA, seal, logo, disclaimer and footer, because text is composited programmatically afterwards. Do not place the face or neck under those zones.

TEXT POLICY: do NOT draw any letters, numbers, logos, watermarks, captions or fake UI in the image. If the template absolutely requires in-image text, the ONLY allowed strings, in Brazilian Portuguese with exact spelling and accents, are: "{{headline}}", "{{cta}}", "ANTES", "DEPOIS". Never use English words.

NEGATIVE CONSTRAINTS: no needles, threads, cannulas, syringes, gloves or procedure scenes; no blood, bruising, dimpling, puckering, swelling or redness; no stretched or plastic skin; no unrealistic jawline or elongated neck; no distorted ear or jaw; no hair hiding the jawline; no extra, missing or deformed fingers or teeth; no beauty filter; no black background; no guarantee or miraculous claims; no product brand logos; no surgical comparison.

ADJUSTMENTS REQUESTED (apply with priority; empty means none): {{feedback_ajuste}}
LEARNED RULES (mandatory, never violate): {{aprendizados}}
```

## 5. Checklist de Rubrica do Diretor de Arte

- [R01][critico] O disclaimer legal ("Imagem ilustrativa. Resultados podem variar de pessoa para pessoa. Procedimento realizado por profissional habilitado.") está visível e completo?
- [R02][critico] A arte está livre de garantia, promessa de resultado e de comparação com cirurgia (ex.: "garantido", "lifting", "definitivo"; preço/parcelamento do briefing são permitidos)?
- [R03][critico] Todo o texto visível está em português do Brasil, escrito exatamente como esperado, sem erros de ortografia e sem palavras em inglês?
- [R04][critico] Rosto, mandíbula, orelha e pescoço estão anatomicamente corretos (sem distorção, esticamento artificial, dedos ou dentes deformados)?
- [R05][critico] Headline, CTA e disclaimer estão legíveis, com contraste suficiente e sem cortes ou sobreposição entre si?
- [R06][critico] A geometria do template foi respeitada (fotos, headline, CTA, selo, logo e rodapé nas posições previstas e dentro da margem de segurança)?
- [R07][normal] Se há comparação ANTES/DEPOIS, as duas fotos têm o mesmo ângulo, inclinação de cabeça, enquadramento e iluminação (Sim também se não houver comparação)?
- [R08][normal] Se há comparação ANTES/DEPOIS, a diferença no contorno é sutil e plausível, sem efeito de repuxo ou máscara (Sim também se não houver comparação)?
- [R09][critico] A imagem está livre de agulhas, fios visíveis, cânulas, sangue, hematomas, covinhas e inchaço?
- [R10][normal] A pele tem textura realista, sem aspecto plástico ou filtro evidente?
- [R11][normal] A headline é o elemento de maior destaque, seguida pelo CTA, com hierarquia visual clara?
- [R12][normal] O logo está visível e sem deformação, e o nome da clínica aparece no rodapé (Sim também se for peça de acervo sem clínica)?
- [R13][normal] A paleta é coerente (champagne/off-white/grafite com dourado discreto e texto escuro) e sem fundo preto?
- [R14][normal] A imagem transmite elegância e segurança, sem sugerir defeito, flacidez ou inadequação da pessoa retratada?

## Self-Improvement Log

<!-- APPEND-ONLY: o BrainLoader adiciona entradas abaixo desta linha -->
