---
id: royal_face
tipo: marca
label: Royal Face Estética
versao: 1
atualizado_em: 2026-10-29
empresas: [royal_face]
fonte: royal-face-idv (SKILL.md + references/visual-system.md + references/reference-index.md)
---
# Marca — Royal Face (IDV)

Skill de identidade visual da rede Royal Face. Vale para **todas as unidades** (a identidade é única). O que muda por peça — preço, parcelamento, nome de procedimento, unidade, datas — vem **somente do briefing**.

Complementos lidos junto com esta skill: [visual-system.md](visual-system.md) (paleta, tipografia, composições, logo, ofertas) e [referencias.md](referencias.md) (índice das artes aprovadas em `acervo/_marcas/royal_face/referencias/`).

## 1. Identidade e Precedência

Produza uma peça que pareça pertencer ao mesmo sistema visual das referências aprovadas, sem copiar mecanicamente uma única composição. Estética editorial de beleza com comunicação comercial direta: sofisticada sem ficar fria, promocional sem parecer varejo popular. Composição clara, arejada e assimétrica, fotografia humana dominante e poucos elementos de apoio.

**Hierarquia de decisão (nesta ordem):**
1. Briefing da demanda (textos, oferta, unidade, data, formato).
2. Referência específica indicada no briefing.
3. Regras obrigatórias desta skill (§2) e da skill do procedimento (compliance).
4. Padrões recorrentes das referências aprovadas.

Não invente preço, parcelamento, data, unidade, benefício clínico ou condição comercial.

## 2. Regras Obrigatórias

- **Formato:** feed 1080 × 1350 px (4:5). Outro formato só quando o briefing pedir.
- **Sem azul.** Contraste em preto suave `#111111` e grafite `#252525`, com branco, off-white quente `#E6DDCF` e dourado/champagne (`#D29C5E`, `#D8AB72`, `#F6D7A7`, `#B87F3E`). Referências antigas com azul-marinho: manter o layout e trocar o azul por preto/grafite. Azul só com pedido explícito no briefing.
- **Tom visual:** clean, premium, feminino, acolhedor, contemporâneo. Fundos off-white/creme/bege com gradientes muito suaves; nada de amarelo vivo, rosa saturado ou fundo multicolorido.
- **Tipografia (estilo, não o nome):** palavra-chave editorial em serifada display (estilo Salina Trial), grande, às vezes itálica, em dourado, preto ou branco; informação objetiva em sans geométrica (estilo Poppins/Montserrat) Medium/SemiBold/Bold. No máximo três níveis tipográficos; não usar serifada em parágrafos, preços pequenos ou listas.
- **Fotografia:** natural e realista, pele com textura preservada, luz suave de campanha de skincare, maquiagem discreta. Nada plástico ou com cara de IA. Respeitar diversidade de idade e tom de pele quando o briefing não especificar a modelo.
- **Antes/depois:** só com fotos reais fornecidas, sem retoque, mesmo enquadramento e luz; cantos arredondados, contorno fino branco, etiquetas "Antes"/"Depois" pequenas e consistentes.
- **Logo:** ativo oficial imutável. **Nunca** desenhado, digitado ou recriado pela IA — a área do logo fica limpa na geração e o PNG oficial cadastrado é aplicado na composição final. Bicolor: "Royal" preto + "Face" dourado em fundo claro; "Royal" branco + "Face" dourado em fundo escuro. Sem recolorir, distorcer, sombra ou efeito.
- **Não sobrecarregar:** sem ícones decorativos aleatórios, brilho excessivo, sombras pesadas, contornos grossos, 3D ou excesso de selos.
- **Oferta:** só quando o briefing trouxer preço/condição. Peça institucional ou sem oferta não leva bloco comercial — reequilibrar foto, título e benefício, sem espaço vazio. Com preço à vista e parcelado, o parcelado vem primeiro ou com mais destaque. Bloco aprovado: dourado + branco + preto/grafite ("EM ATÉ 12X / SEM JUROS / NO CARTÃO" apenas quando essas condições estiverem no briefing).
- **Revisão de texto:** acentuação, casas decimais, número de parcelas, datas, nomes de procedimento e unidade exatamente como no briefing.

## 3. Composições Aprovadas

### modelo_destaque
Modelo ocupa de metade a dois terços do quadro, à direita ou emergindo da base; texto no lado oposto com respiro; marcações clínicas delicadas (linhas/círculos brancos ou dourados, números pequenos) opcionais. Botox, rejuvenescimento, institucional.

### close_procedimento
Fotografia macro da região (lábios, olhar) no topo ou ao fundo; título com contraste forte serifada × sans. Preenchimento labial, olheiras, tratamentos localizados.

### informativa_clean
Fundo claro, modelo recortada, título forte, benefícios em linha curta ou pills discretas (até 3). Explicar regiões e benefícios, peças sem oferta.

### antes_depois_editorial
Duas fotos reais lado a lado ou empilhadas, título acima ou entre a foto e a condição comercial. **Exige fotos reais do cliente** — não gerar pacientes por IA.

### corporal
Corpo ou região tratada em foco, sem sensualização; título e benefício em área limpa. Mesma paleta das peças faciais.

## 4. Diretrizes para Geração por IA

```prompt
BRAND: a Brazilian aesthetic clinic network (its name is intentionally omitted: never write any brand or clinic name). Editorial beauty campaign look, premium, feminine, warm, contemporary, airy asymmetric layout, human photography dominant, few supporting elements.
PALETTE: soft black #111111 and graphite #252525 for all contrast (titles, pills, labels, offer blocks); white, warm off-white #E6DDCF, champagne #D8AB72 and gold #D29C5E for highlights; very soft cream/beige gradients. NEVER use blue (replace any navy from references with black/graphite). No vivid yellow, saturated pink or multicolor backgrounds.
TYPE STYLE: one or two key words in a large elegant display serif (Salina-like, sometimes italic) in gold, black or white; everything else in a clean geometric sans (Poppins-like) medium/semibold/bold; max three typographic levels; optional huge background word in very low opacity.
ELEMENTS (use few): rounded white/cream cards, black/graphite or white outlined pills, thin gold lines, delicate clinical marking circles, discreet gold band at the bottom edge.
PHOTOGRAPHY: natural realistic skin texture, soft skincare-campaign light, discreet makeup, confident expression; nothing plastic or obviously AI-generated.
LOGO: do NOT draw, type or imitate any logo, monogram, emblem, signature or brand name. The reference images contain the brand logo: never reproduce it. Reserve the logo spot only with the magenta placeholder described in the technique; the official logo file is placed there afterwards.
```

## 5. Checklist de Rubrica da Marca

- [M01][critico] A arte está livre de azul nos elementos gráficos, com contraste em preto/grafite e dourado/champagne?
- [M02][critico] O único logo da arte é o oficial aplicado (sem logo ou nome "Royal Face" desenhado pela IA e sem resto do marcador magenta)?
- [M03][critico] Todo preço, parcelamento, data e unidade presente na arte veio do briefing, sem bloco comercial inventado?
- [M04][normal] A hierarquia entre procedimento, benefício e condição está clara e legível em tela de celular?
- [M05][normal] A tipografia alterna palavra editorial serifada e informação em sans, com no máximo três níveis?
- [M06][normal] A fotografia tem pele natural, sem aparência plástica, deformação anatômica ou cara de IA?
- [M07][normal] A peça está limpa, sem ícones aleatórios, brilho excessivo, sombras pesadas ou excesso de selos?

## Self-Improvement Log

<!-- APPEND-ONLY: aprendizados da marca (reprovações humanas por motivo de identidade visual). Não editar entradas antigas. -->
