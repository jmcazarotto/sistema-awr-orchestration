import type { ElementoEstilo, ElementoTemplate, ElementoTipo } from '../../shared/types';

/* Lógica pura do editor visual de templates (sem DOM) — testada em templateEditor.test.ts. */

export interface Rect { x: number; y: number; w: number; h: number }
/** Id da camada virtual de background (fundo do canvas); não existe em `elementos`. */
export const BG_ID = '__background__';
export type Handle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';
export const HANDLES: Handle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];

/* ───────── Fundo: "#hex" | "linear:#topo,#base" | null ───────── */
export type FundoModo = 'none' | 'solid' | 'gradient' | 'image';
export interface FundoParsed { modo: FundoModo; a: string; b: string; url?: string }
export function parseFundo(fundo: string | null | undefined, fallback = '#ffffff'): FundoParsed {
  if (!fundo) return { modo: 'none', a: fallback, b: fallback };
  if (fundo.startsWith('imagem:')) return { modo: 'image', a: fallback, b: fallback, url: fundo.slice(7) };
  if (fundo.startsWith('linear:')) {
    const [a, b] = fundo.slice(7).split(',').map(c => c.trim());
    return { modo: 'gradient', a: a || fallback, b: b || a || fallback };
  }
  return { modo: 'solid', a: fundo, b: fundo };
}
export function buildFundo(modo: FundoModo, a: string, b: string): string | null {
  if (modo === 'none' || modo === 'image') return null;
  return modo === 'solid' ? a : `linear:${a},${b}`;
}
/** Converte o fundo do contrato para um valor CSS `background`. */
export function fundoCss(fundo: string | null | undefined): string | undefined {
  const p = parseFundo(fundo);
  if (p.modo === 'none') return undefined;
  if (p.modo === 'image') return p.url ? `url("${p.url}") center / cover no-repeat` : undefined;
  return p.modo === 'solid' ? p.a : `linear-gradient(180deg,${p.a},${p.b})`;
}

/* ───────── Snap com guias ───────── */
export interface SnapResult { dx: number; dy: number; guidesX: number[]; guidesY: number[] }
const edgesX = (r: Rect) => [r.x, r.x + r.w / 2, r.x + r.w];
const edgesY = (r: Rect) => [r.y, r.y + r.h / 2, r.y + r.h];
function bestSnap(mine: number[], targets: number[], threshold: number) {
  let best: { delta: number; guide: number } | null = null;
  for (const m of mine) for (const t of targets) {
    const delta = t - m;
    if (Math.abs(delta) <= threshold && (!best || Math.abs(delta) < Math.abs(best.delta))) best = { delta, guide: t };
  }
  return best;
}
/** Calcula o ajuste (dx,dy) para encostar `moving` nas bordas/centros do canvas e de outros elementos. */
export function computeSnap(moving: Rect, others: Rect[], canvas: { largura: number; altura: number }, threshold: number): SnapResult {
  const tx = [0, canvas.largura / 2, canvas.largura, ...others.flatMap(edgesX)];
  const ty = [0, canvas.altura / 2, canvas.altura, ...others.flatMap(edgesY)];
  const sx = bestSnap(edgesX(moving), tx, threshold);
  const sy = bestSnap(edgesY(moving), ty, threshold);
  const dx = sx?.delta ?? 0, dy = sy?.delta ?? 0;
  // Guias: todo alvo que passa a coincidir após o ajuste.
  const placed = { ...moving, x: moving.x + dx, y: moving.y + dy };
  const guidesX = [...new Set(tx.filter(t => edgesX(placed).some(m => Math.abs(m - t) < .01)))];
  const guidesY = [...new Set(ty.filter(t => edgesY(placed).some(m => Math.abs(m - t) < .01)))];
  return { dx, dy, guidesX, guidesY };
}

/** Encosta apenas as arestas que estão sendo arrastadas num redimensionamento. */
export function snapResize(rect: Rect, handle: Handle, others: Rect[], canvas: { largura: number; altura: number }, threshold: number): SnapResult & { rect: Rect } {
  const tx = [0, canvas.largura / 2, canvas.largura, ...others.flatMap(edgesX)];
  const ty = [0, canvas.altura / 2, canvas.altura, ...others.flatMap(edgesY)];
  let { x, y, w, h } = rect; const guidesX: number[] = [], guidesY: number[] = [];
  if (handle.includes('e')) { const b = bestSnap([x + w], tx, threshold); if (b) { w += b.delta; guidesX.push(b.guide); } }
  if (handle.includes('w')) { const b = bestSnap([x], tx, threshold); if (b) { x += b.delta; w -= b.delta; guidesX.push(b.guide); } }
  if (handle.includes('s')) { const b = bestSnap([y + h], ty, threshold); if (b) { h += b.delta; guidesY.push(b.guide); } }
  if (handle.includes('n')) { const b = bestSnap([y], ty, threshold); if (b) { y += b.delta; h -= b.delta; guidesY.push(b.guide); } }
  return { rect: { x, y, w: Math.max(1, w), h: Math.max(1, h) }, dx: 0, dy: 0, guidesX, guidesY };
}

/* ───────── Redimensionamento ───────── */
export function resizeRect(start: Rect, handle: Handle, dx: number, dy: number, opts: { keepRatio?: boolean; min?: number } = {}): Rect {
  const min = opts.min ?? 8;
  let { x, y, w, h } = start;
  const west = handle.includes('w'), east = handle.includes('e'), north = handle.includes('n'), south = handle.includes('s');
  if (east) w = start.w + dx;
  if (west) { w = start.w - dx; }
  if (south) h = start.h + dy;
  if (north) { h = start.h - dy; }
  if (opts.keepRatio && start.w > 0 && start.h > 0) {
    const ratio = start.w / start.h;
    const horizontal = west || east, vertical = north || south;
    if (horizontal && vertical) {
      // Canto: o eixo com maior variação relativa manda.
      if (Math.abs(w / start.w - 1) >= Math.abs(h / start.h - 1)) h = w / ratio; else w = h * ratio;
    } else if (horizontal) h = w / ratio;
    else w = h * ratio;
  }
  w = Math.max(min, w); h = Math.max(min, h);
  // Ancora o lado oposto ao handle.
  if (west) x = start.x + start.w - w;
  if (north) y = start.y + start.h - h;
  // Handles de aresta com proporção: centraliza o eixo secundário.
  if (opts.keepRatio) {
    if ((handle === 'n' || handle === 's')) x = start.x + (start.w - w) / 2;
    if ((handle === 'e' || handle === 'w')) y = start.y + (start.h - h) / 2;
  }
  return { x, y, w, h };
}

/* ───────── Histórico (undo/redo) ───────── */
export interface History<T> { past: T[]; present: T; future: T[] }
export const createHistory = <T,>(present: T): History<T> => ({ past: [], present, future: [] });
export function pushHistory<T>(h: History<T>, next: T, limit = 100): History<T> {
  if (Object.is(next, h.present)) return h;
  return { past: [...h.past, h.present].slice(-limit), present: next, future: [] };
}
export const undoHistory = <T,>(h: History<T>): History<T> => h.past.length ? { past: h.past.slice(0, -1), present: h.past[h.past.length - 1]!, future: [h.present, ...h.future] } : h;
export const redoHistory = <T,>(h: History<T>): History<T> => h.future.length ? { past: [...h.past, h.present], present: h.future[0]!, future: h.future.slice(1) } : h;

/* ───────── Elementos ───────── */
export const TIPO_LABELS: Record<ElementoTipo, string> = {
  foto_antes: 'Foto antes', foto_depois: 'Foto depois', foto_principal: 'Foto principal', titulo: 'Título',
  subtitulo: 'Subtítulo', destaque: 'Destaque', preco: 'Preço', logo: 'Logo', texto: 'Texto', forma: 'Forma',
};
const baseEstilo: ElementoEstilo = { fonte: 'sans', tamanho: 48, peso: 700, italico: false, cor: '#ffffff', alinhamento: 'centro', fundo: null, raio: 0, borda: null, sombra: false, opacidade: 1, caixaAlta: false };
const DEFAULTS: Record<ElementoTipo, { w: number; h: number; conteudo: string; estilo: Partial<ElementoEstilo> }> = {
  foto_antes: { w: 460, h: 462, conteudo: '', estilo: { fundo: '#d9d6d1', raio: 40, borda: { cor: '#8d8b88', largura: 16 }, sombra: true } },
  foto_depois: { w: 460, h: 462, conteudo: '', estilo: { fundo: '#d9d6d1', raio: 40, borda: { cor: '#8d8b88', largura: 16 }, sombra: true } },
  foto_principal: { w: 1080, h: 810, conteudo: '', estilo: { fundo: '#d9d6d1' } },
  titulo: { w: 800, h: 120, conteudo: '{{procedimento}}', estilo: { fonte: 'serif_display', tamanho: 96, peso: 500 } },
  subtitulo: { w: 600, h: 100, conteudo: 'SUBTÍTULO', estilo: { fonte: 'sans_black', tamanho: 80, peso: 900, caixaAlta: true } },
  destaque: { w: 280, h: 80, conteudo: 'DESTAQUE', estilo: { fonte: 'sans_black', tamanho: 44, peso: 900, cor: '#111111', fundo: 'linear:#e9cf8e,#b88a45', raio: 14, caixaAlta: true } },
  preco: { w: 300, h: 110, conteudo: '12X R$ {{preco}}', estilo: { fonte: 'sans_black', tamanho: 48, peso: 900 } },
  logo: { w: 220, h: 130, conteudo: '', estilo: {} },
  texto: { w: 500, h: 80, conteudo: 'Texto', estilo: { tamanho: 36, peso: 500 } },
  forma: { w: 200, h: 8, conteudo: '', estilo: { fundo: '#ffffff' } },
};
export const nextZ = (els: ElementoTemplate[]) => els.reduce((m, e) => Math.max(m, e.z), -1) + 1;
export function uniqueId(prefix: string, els: ElementoTemplate[]) {
  const ids = new Set(els.map(e => e.id));
  let n = 1; while (ids.has(`${prefix}_${n}`)) n++;
  return `${prefix}_${n}`;
}
export function createElemento(tipo: ElementoTipo, els: ElementoTemplate[], canvas: { largura: number; altura: number }): ElementoTemplate {
  const d = DEFAULTS[tipo];
  return {
    id: uniqueId(tipo, els), tipo, rotulo: TIPO_LABELS[tipo], x: Math.round((canvas.largura - d.w) / 2), y: Math.round((canvas.altura - d.h) / 2),
    w: d.w, h: d.h, rotacao: 0, z: nextZ(els), bloqueado: false, conteudo: d.conteudo, estilo: { ...baseEstilo, ...d.estilo },
  };
}
export function duplicateElemento(el: ElementoTemplate, els: ElementoTemplate[]): ElementoTemplate {
  return { ...el, id: uniqueId(el.tipo, els), rotulo: `${el.rotulo} (cópia)`, x: el.x + 20, y: el.y + 20, z: nextZ(els), bloqueado: false, estilo: { ...el.estilo, borda: el.estilo.borda ? { ...el.estilo.borda } : null } };
}
/** Reordena z: troca a posição do elemento com o vizinho (sentido +1 = para frente) e normaliza z em 0..n-1. */
export function moveZ(els: ElementoTemplate[], id: string, dir: 1 | -1): ElementoTemplate[] {
  const sorted = [...els].sort((a, b) => a.z - b.z);
  const i = sorted.findIndex(e => e.id === id), j = i + dir;
  if (i < 0 || j < 0 || j >= sorted.length) return els;
  [sorted[i], sorted[j]] = [sorted[j]!, sorted[i]!];
  const z = new Map(sorted.map((e, idx) => [e.id, idx]));
  return els.map(e => ({ ...e, z: z.get(e.id)! }));
}
export const clampRound = (n: number) => Math.round(n * 100) / 100;

/** Foto de placeholder de um slot de foto: data URL guardada em `conteudo`. */
export const fotoImagem = (el: Pick<ElementoTemplate, 'tipo' | 'conteudo'>) => /^foto_/.test(el.tipo) && el.conteudo.startsWith('data:image/') ? el.conteudo : null;
