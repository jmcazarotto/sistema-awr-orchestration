# Design Tokens — extraídos da referência AWR Portal Cliente

Fonte: CSS inline de https://awr-portal-cliente.gabrielzteixeira.chatgpt.site/ (extraído em 2026-10-28).
A UI do AWR Design System deve usar **apenas** estes valores.

## Modo 1 (padrão — "lime")

| Token | Valor | Uso |
|---|---|---|
| `--ink` | `#10172f` | Texto principal, botão `navy` |
| `--muted` | `#737c91` | Texto secundário, labels |
| `--green` | `#b6e77a` | Acento primário: botão primário, indicador de nav ativo, ponto do logo |
| `--green-hover` | `#a8da6b` | Hover do botão primário |
| `--green-soft` | `#d7efb8` | Botão primário em rodapé de card |
| `--pale` | `#eff8e6` | Fundo de badge ativo / botão soft |
| `--pale-text` | `#679533` | Texto de badge ativo |
| `--line` | `#e7eaf0` | Bordas e divisores |
| `--bg` | `#f6f7f9` | Fundo da página |
| `--surface` | `#ffffff` | Cards, header |
| `--blue` | `#176af2` | Links/realces informativos |
| `--sidebar` | `#101a32` | Sidebar escura |
| `--sidebar-muted` | `#9caac1` | Texto da sidebar |
| `--sidebar-sub` | `#9eaec5` | Sub-links da sidebar |
| `--sidebar-sub-active-bg` | `#b6e77a0d` | Sub-link selecionado |
| `--sidebar-sub-active` | `#d2edb2` | Texto sub-link selecionado |
| `--side-new-bg` / `--side-new-text` | `#cceaa9` / `#203513` | Tag "NOVO" na sidebar |
| `--neutral-badge-bg` / text | `#f1f3f7` / `#6a7589` | Badge neutro |
| `--outline-border` | `#dce1e9` | Botão outline |
| `--focus` | `#81b644` | Outline de foco (3px, offset 4px) |

## Modo 2 ("azul" — `body[data-visual-mode="2"]`)

`--ink #162c49` · `--blue #1d5c9e` · `--green #dcecf4` · `--pale #edf4ff` · `--bg #f4f7fa` · `--line #dfe8f6` · `--muted #6b7c96` · `--sidebar #102b55` · `--radius 17px` · fonte **Manrope** · foco `#1d5c9e`.

## Tipografia

- Modo 1: `Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif` · base 14px · antialiased.
- Modo 2: `Manrope` (Google Fonts 300–800) com fallback Inter.
- Logo "AWR": 31–36px, peso 850, letter-spacing −2/−2.5px, seguido de ponto `--green`.
- H1 página: 33px, peso 690, letter-spacing −1.25px, line-height 1.2.
- Crumb/eyebrow: 9–11px, peso 600–650, letter-spacing 1.3–1.5px, UPPERCASE, `--muted`.
- Título de card: 17px, peso 700, letter-spacing −.45px.
- Números de stat: 29px, line-height 1, letter-spacing −1px.
- Botões: 12px peso 650 (small: 11px).

## Forma

| Elemento | Valor |
|---|---|
| Card | `bg #fff`, `border 1px var(--line)`, `radius 20px` (`--radius`), `padding 25px`, `shadow 0 3px 9px #15244a03` |
| Card destacado | borda `#bfdc98` + barra topo 4px `linear-gradient(90deg,#b9e681,#edf8e1)` |
| Botão | `min-height 43px`, `padding 11px 17px`, `radius 11px`, hover `translateY(-1px)` |
| Select/Input | `height 44px`, `radius 11px`, `border 1px var(--line)`, bg branco |
| Badge | pill `radius 30px`, `10px/650`, `padding 7px 10px` |
| Icon button | `padding 8px`, `radius 10px`, hover `bg var(--bg)` |
| Tile ícone | 42×42, `radius 12px`, `bg #f2f4f7`, ícone `#8c94a3` |
| Popover/modal | `shadow 0 15px 40px #10172f13` / `0 24px 90px #0b152c2b` |
| Raios comuns | 5, 8, 10, 11, 12, 14, 18, 20, 24px |

## Layout

- Sidebar fixa à esquerda, `width 252px`, `bg var(--sidebar)`, `padding 28px 15px 16px`. Nav item ativo: barra vertical 3px `--green` à esquerda + ícone `--green`.
- Topbar `height 77px`, branca, borda inferior `--line`, à direita da sidebar.
- `main`: `max-width 1500px`, `padding 33px 4% 20px`.
- Grid de cards: `gap 20px`, 3 colunas em desktop.
- Nav superior ativo: sublinhado 3px `--green` com `radius 6px`.
