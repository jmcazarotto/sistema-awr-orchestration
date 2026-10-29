---
id: template_composition
procedimento: "*"
label: Composição de Templates
versao: 1
atualizado_em: 2026-10-28
---
# Skill — Composição de Templates

## 1. Contexto do Procedimento

Skill **transversal** (vale para todos os procedimentos). Define a geometria dos 4 templates (`antes_depois_1`, `antes_depois_2`, `banco_imagem_1`, `banco_imagem_2`), os formatos de saída e a regra de **composição híbrida**:

- **Camada fotográfica (`gpt-image-2`):** apenas fotos/fundos (rostos, lábios, contorno), sem texto, sem logos, sem selos. Gerada conforme o Prompt Base de cada procedimento ou o §4 desta skill.
- **Camada vetorial (Sharp/SVG):** grids, bordas, gradientes, rótulos ANTES/DEPOIS, headline, CTA, selo, logo, disclaimer e rodapé. Texto sempre renderizado aqui, com fontes Manrope/Inter, para garantir ortografia PT-BR exata e posição precisa.
- **Ordem de empilhamento (de baixo para cima):** fundo/painel → fotos → overlay_gradient → rótulos → logo/selo → headline → CTA → disclaimer → rodapé.

**Formatos:** padrão **1080×1350** (feed 4:5). Opcional **1080×1920** (stories 9:16) via regra de adaptação abaixo. Origem (0,0) no canto superior esquerdo; unidade = px; caixas `x,y,w,h`.

**Safe area:** **64 px** em todos os lados no feed (x 64–1016, y 64–1286). Todo texto, logo e selo ficam dentro dela; apenas `photo_fundo`, `photo_principal`, `panel_texto` e `overlay_gradient` podem sangrar até a borda.

**Elementos comuns:**
- `logo`: logomarca da clínica (ou AWR, se não houver), proporção preservada, nunca deformada.
- `selo`: selo de compliance/credencial (ex.: "Profissional habilitado" ou selo da franquia); sem alegações de resultado.
- `disclaimer`: texto fixo `Imagem ilustrativa. Resultados podem variar de pessoa para pessoa. Procedimento realizado por profissional habilitado.` (2 linhas, ≥ 22 px).
- `rodape`: nome da unidade/clínica (`{{clinica_nome}}`) e, se fornecido, CRM/RQE; nunca inventar.

## 2. Diretrizes Visuais e Paleta

**Tokens globais (marca AWR):**

| Token | HEX | Uso |
|---|---|---|
| navy | `#101a32` | texto sobre claro, painéis escuros, texto do CTA |
| ink | `#10172f` | texto corrido alternativo |
| lime | `#b6e77a` | fundo do botão CTA, detalhes de destaque (uso pontual) |
| bg | `#f6f7f9` | fundo neutro / painéis claros |
| branco | `#FFFFFF` | texto sobre escuro, placas de logo/selo (90% opacidade) |

A arte do cliente pode usar paleta própria (paleta do procedimento ou do cliente), desde que respeite contraste e não use fundo preto puro.

**Escala tipográfica (canvas 1080 px de largura):**

| Papel | Fonte | Peso | Tamanho / entrelinha |
|---|---|---|---|
| headline `antes_depois_*` | Manrope | 800 | 56–60 px / 1.1 |
| headline `banco_imagem_1` | Manrope | 800 | 72 px / 1.1 |
| headline `banco_imagem_2` | Manrope | 800 | 56 px / 1.1 |
| CTA | Manrope | 700 | 30 px, caixa de frase, centralizado no botão |
| rótulo ANTES/DEPOIS | Manrope | 800 | 24 px, caixa alta, tracking +4% |
| corpo / apoio | Inter | 500 | 28 px / 1.35 |
| disclaimer | Inter | 500 | 22 px mínimo / 1.2 |
| rodapé | Inter | 600 | 24 px |

**Contraste (WCAG AA):** corpo, CTA e disclaimer ≥ **4.5:1**; headline (texto grande) ≥ **3:1**. Texto sobre foto exige `overlay_gradient` (navy 0%→85% de baixo para cima) ou placa sólida. Botão CTA: fundo lime `#b6e77a` + texto navy `#101a32` (≈ 12:1). Texto nunca sobre rosto/lábios/olhos.

**Elementos gráficos:** cantos dos botões e rótulos com raio 12 px; gap entre fotos comparativas 16 px; borda das fotos 0 (sem moldura); sombra apenas no botão (0 4 12 rgba(16,26,50,.18)).

## 3. Regras dos Templates

Todas as caixas em px para **1080×1350**. `Fim` = x+w / y+h. Caixas de mesma linha não se sobrepõem, exceto `label_*` (dentro das fotos) e elementos sobre `photo_fundo`/`overlay_gradient`.

### antes_depois_1
Split vertical 50/50, fotos lado a lado.

| Caixa | x | y | w | h | Observação |
|---|---|---|---|---|---|
| logo | 64 | 64 | 200 | 56 | topo-esq. |
| selo | 756 | 64 | 260 | 56 | topo-dir. |
| headline | 64 | 144 | 952 | 150 | máx. 2 linhas, 52 caracteres |
| photo_antes | 64 | 320 | 468 | 700 | fim x=532, y=1020 |
| photo_depois | 548 | 320 | 468 | 700 | fim x=1016, y=1020 |
| label_antes | 80 | 964 | 140 | 40 | dentro de photo_antes, canto inferior esq. |
| label_depois | 564 | 964 | 140 | 40 | dentro de photo_depois, canto inferior esq. |
| cta | 64 | 1048 | 560 | 72 | botão lime, texto até 28 caracteres |
| disclaimer | 64 | 1144 | 952 | 64 | 2 linhas, 22 px |
| rodape | 64 | 1226 | 952 | 60 | fim y=1286 |

### antes_depois_2
Split horizontal empilhado: ANTES em cima, DEPOIS embaixo, largura total.

| Caixa | x | y | w | h | Observação |
|---|---|---|---|---|---|
| logo | 64 | 64 | 200 | 56 | topo-esq. |
| selo | 756 | 64 | 260 | 56 | topo-dir. |
| headline | 64 | 144 | 952 | 130 | máx. 2 linhas, 52 caracteres |
| photo_antes | 64 | 290 | 952 | 380 | fim y=670 |
| photo_depois | 64 | 686 | 952 | 380 | fim y=1066 |
| label_antes | 84 | 310 | 140 | 40 | dentro de photo_antes, canto superior esq. |
| label_depois | 84 | 706 | 140 | 40 | dentro de photo_depois, canto superior esq. |
| cta | 64 | 1082 | 952 | 64 | botão largura total |
| disclaimer | 64 | 1160 | 952 | 56 | 2 linhas, 22 px |
| rodape | 64 | 1232 | 952 | 54 | fim y=1286 |

### banco_imagem_1
Foto full-bleed com gradiente; texto no terço inferior. Sujeito na região y 120–740; região y ≥ 740 limpa.

| Caixa | x | y | w | h | Observação |
|---|---|---|---|---|---|
| photo_fundo | 0 | 0 | 1080 | 1350 | sangra até a borda |
| overlay_gradient | 0 | 640 | 1080 | 710 | navy 0%→85% (topo→base) |
| logo | 64 | 64 | 200 | 56 | sobre placa branca 90% |
| selo | 756 | 64 | 260 | 56 | sobre placa branca 90% |
| headline | 64 | 760 | 952 | 260 | máx. 3 linhas, 56 caracteres, texto branco |
| cta | 64 | 1050 | 520 | 72 | botão lime, até 26 caracteres |
| disclaimer | 64 | 1146 | 952 | 64 | branco, 22 px |
| rodape | 64 | 1226 | 952 | 60 | branco, 24 px |

### banco_imagem_2
Split horizontal institucional: foto em cima (sem texto), painel sólido embaixo.

| Caixa | x | y | w | h | Observação |
|---|---|---|---|---|---|
| photo_principal | 0 | 0 | 1080 | 760 | sangra até a borda, sem texto |
| panel_texto | 0 | 760 | 1080 | 590 | cor sólida clara do procedimento |
| logo | 64 | 792 | 200 | 48 | topo-esq. do painel |
| selo | 756 | 792 | 260 | 48 | topo-dir. do painel |
| headline | 64 | 864 | 952 | 200 | máx. 3 linhas, 64 caracteres, texto navy |
| cta | 64 | 1088 | 520 | 72 | botão lime, até 26 caracteres |
| disclaimer | 64 | 1176 | 952 | 56 | navy, 22 px |
| rodape | 64 | 1244 | 952 | 42 | fim y=1286 |

**Regra ANTES/DEPOIS (todos os `antes_depois_*`):** mesma pessoa, mesmo ângulo, mesma inclinação de cabeça, mesmo enquadramento e iluminação; fotos com **dimensões idênticas**; rótulos com os textos exatos "ANTES" e "DEPOIS" (fundo navy 85%, texto branco); nenhum filtro no "DEPOIS".

**Adaptação para stories 1080×1920:** safe area vertical = **250 px** topo e **340 px** base (y 250–1580); largura inalterada. Sobre as coordenadas do feed:
- elementos ancorados ao topo (`logo`, `selo`, `headline` acima das fotos): `y += 186`;
- elementos ancorados à base (`cta`, `disclaimer`, `rodape`): `y += 294`;
- fotos entre eles absorvem os 108 px extras de altura (`antes_depois_1`: cada foto h=808, y=506; `antes_depois_2`: cada foto h=434, antes y=476, depois y=926; `label_*` mantêm o offset interno de 16–20 px das bordas da foto);
- `banco_imagem_1`: `photo_fundo` 1080×1920; `overlay_gradient` y=934 h=986; `logo`/`selo` `y += 186`; `headline`, `cta`, `disclaimer`, `rodape` `y += 294`;
- `banco_imagem_2`: `photo_principal` h=1054; `panel_texto` y=1054 h=866; todas as caixas do painel `y += 294`.

## 4. Prompt Base gpt-image-2

Prompt genérico para gerar **apenas a camada fotográfica** (sem texto), usado quando o procedimento não fornece prompt próprio ou para regenerar só as fotos de um template.

```prompt
Create ONLY the photographic layer for an advertising template of an aesthetic clinic in Brazil. This image is a background/photo layer: all typography, logos, seals and UI are composited later by software.

PROCEDURE THEME: {{procedimento_label}}. Evoke the treated area only; never show the procedure being performed.
TEMPLATE: {{template_id}} — {{template_descricao}}
CLINIC: {{clinica_nome}}
CLIENT BRIEFING: {{briefing_cliente}}

CANVAS: 1080x1350 px (4:5). Respect the photo boxes, split proportions and clean zones described in the template. Keep the subject inside the photo area and a 64 px margin free of important details.

PHOTOGRAPHY: photorealistic editorial beauty portrait, 85mm lens, soft diffused natural light (5000-5600K), real skin texture with visible pores, faithful skin tone, anatomically correct face, hands and teeth. For BEFORE/AFTER photo pairs: SAME person, SAME angle, SAME framing, SAME lighting and background, identical dimensions; the AFTER shows only a subtle, plausible difference; NO filters or retouching on the AFTER.

CLEAN ZONES: keep the regions reserved for headline, CTA, seal, logo, disclaimer and footer free of faces and details (soft uniform background or smooth gradient), with enough tonal contrast to place readable text.

TEXT POLICY: draw NO letters, numbers, logos, watermarks or captions. If text is unavoidable, the ONLY allowed strings, in Brazilian Portuguese with exact spelling, are: "{{headline}}", "{{cta}}", "ANTES", "DEPOIS". Never use English words.

NEGATIVE CONSTRAINTS: no needles, syringes, threads, blood, bruising, swelling; no distorted anatomy; no extra or deformed fingers or teeth; no plastic skin or beauty filter; no black background; no borders, frames or UI; no guarantee or miraculous claims.

ADJUSTMENTS REQUESTED (apply with priority; empty means none): {{feedback_ajuste}}
LEARNED RULES (mandatory, never violate): {{aprendizados}}
```

## 5. Checklist de Rubrica do Diretor de Arte

- [R01][critico] Todos os textos (headline, CTA, rótulos, disclaimer, rodapé) estão dentro da margem de segurança, sem cortes nas bordas do canvas?
- [R02][critico] Nenhuma caixa de texto se sobrepõe a outra nem cobre rosto, lábios ou olhos?
- [R03][critico] O layout corresponde ao template pedido (divisão das fotos e posição de headline, CTA, selo, logo, disclaimer e rodapé)?
- [R04][critico] O texto tem contraste suficiente com o fundo (corpo, CTA e disclaimer claramente legíveis; headline bem destacada)?
- [R05][critico] O disclaimer está presente, completo e em tamanho legível (não menor que o texto de rodapé)?
- [R06][normal] Se há ANTES/DEPOIS, as duas fotos têm o mesmo tamanho, o mesmo enquadramento e rótulos "ANTES" e "DEPOIS" alinhados e legíveis (Sim também se não houver comparação)?
- [R07][normal] O espaçamento entre fotos, margens e blocos de texto é uniforme e alinhado ao grid (alinhamento à esquerda em x=64)?
- [R08][normal] O botão de CTA é claramente identificável (fundo lime, texto escuro) e com texto centralizado?
- [R09][normal] Logo e selo estão nítidos, proporcionais e sem deformação?
- [R10][normal] A hierarquia visual é clara (headline > CTA > disclaimer/rodapé) e a paleta é coerente, sem fundo preto?

## Self-Improvement Log

<!-- APPEND-ONLY: o BrainLoader adiciona entradas abaixo desta linha -->
