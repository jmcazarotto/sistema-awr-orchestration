import { describe, expect, it } from 'vitest';
import { buildFundo, computeSnap, snapResize, createElemento, createHistory, duplicateElemento, fundoCss, moveZ, parseFundo, pushHistory, redoHistory, resizeRect, undoHistory } from './templateEditor';

const canvas = { largura: 1080, altura: 1350 };
describe('fundo', () => {
  it('interpreta cor sólida, gradiente e vazio', () => {
    expect(parseFundo(null).modo).toBe('none');
    expect(parseFundo('#111111')).toMatchObject({ modo: 'solid', a: '#111111' });
    expect(parseFundo('linear:#4a4947,#9b7d57')).toEqual({ modo: 'gradient', a: '#4a4947', b: '#9b7d57' });
  });
  it('gera CSS e serializa de volta', () => {
    expect(fundoCss('linear:#a,#b')).toBe('linear-gradient(180deg,#a,#b)');
    expect(fundoCss('#fff')).toBe('#fff');
    expect(fundoCss(null)).toBeUndefined();
    expect(buildFundo('gradient', '#1', '#2')).toBe('linear:#1,#2');
    expect(buildFundo('none', '#1', '#2')).toBeNull();
    expect(parseFundo('imagem:data:image/png;base64,AA')).toMatchObject({ modo: 'image', url: 'data:image/png;base64,AA' });
    expect(fundoCss('imagem:data:image/png;base64,AA')).toBe('url("data:image/png;base64,AA") center / cover no-repeat');
    expect(fundoCss('imagem:')).toBeUndefined();
  });
});
describe('snap', () => {
  it('encosta no centro do canvas e informa a guia', () => {
    const r = computeSnap({ x: 445, y: 100, w: 200, h: 100 }, [], canvas, 8);
    expect(r.dx).toBe(-5); expect(r.guidesX).toContain(540); expect(r.dy).toBe(0);
  });
  it('encosta na borda de outro elemento mais próxima', () => {
    const r = computeSnap({ x: 103, y: 500, w: 50, h: 50 }, [{ x: 100, y: 0, w: 200, h: 10 }], canvas, 8);
    expect(r.dx).toBe(-3); expect(r.guidesX).toContain(100);
  });
  it('não ajusta fora do limiar', () => {
    const r = computeSnap({ x: 300, y: 300, w: 50, h: 50 }, [], canvas, 8);
    expect(r).toEqual({ dx: 0, dy: 0, guidesX: [], guidesY: [] });
  });
});
describe('snapResize', () => {
  it('encosta somente a aresta arrastada', () => {
    const r = snapResize({ x: 100, y: 100, w: 445, h: 100 }, 'e', [], canvas, 8);
    expect(r.rect).toEqual({ x: 100, y: 100, w: 440, h: 100 }); expect(r.guidesX).toEqual([540]);
    expect(snapResize({ x: 100, y: 100, w: 445, h: 100 }, 's', [], canvas, 8).rect.w).toBe(445);
  });
});
describe('resize', () => {
  const start = { x: 100, y: 100, w: 200, h: 100 };
  it('ancora o lado oposto', () => {
    expect(resizeRect(start, 'se', 50, 20)).toEqual({ x: 100, y: 100, w: 250, h: 120 });
    expect(resizeRect(start, 'nw', 50, 20)).toEqual({ x: 150, y: 120, w: 150, h: 80 });
  });
  it('respeita mínimo', () => { expect(resizeRect(start, 'e', -500, 0).w).toBe(8); expect(resizeRect(start, 'w', 500, 0)).toMatchObject({ w: 8, x: 292 }); });
  it('mantém proporção', () => {
    const r = resizeRect(start, 'se', 100, 0, { keepRatio: true });
    expect(r.w / r.h).toBeCloseTo(2); expect(r.w).toBe(300);
    const e = resizeRect(start, 'e', 100, 0, { keepRatio: true });
    expect(e).toMatchObject({ w: 300, h: 150, y: 75 });
  });
});
describe('histórico', () => {
  it('desfaz, refaz e descarta o futuro ao empilhar', () => {
    let h = createHistory(1); h = pushHistory(h, 2); h = pushHistory(h, 3);
    h = undoHistory(h); expect(h.present).toBe(2);
    h = redoHistory(h); expect(h.present).toBe(3);
    h = undoHistory(undoHistory(h)); h = pushHistory(h, 9);
    expect(h).toEqual({ past: [1], present: 9, future: [] });
    expect(undoHistory(createHistory(0)).present).toBe(0);
    expect(pushHistory(h, 9)).toBe(h);
  });
  it('respeita o limite', () => { let h = createHistory(0); for (let i = 1; i <= 5; i++) h = pushHistory(h, i, 3); expect(h.past).toEqual([2, 3, 4]); });
});
describe('elementos', () => {
  it('cria com id único, z crescente e centralizado', () => {
    const a = createElemento('titulo', [], canvas); const b = createElemento('titulo', [a], canvas);
    expect(a.id).toBe('titulo_1'); expect(b.id).toBe('titulo_2'); expect(b.z).toBe(1);
    expect(a.x).toBe((1080 - a.w) / 2);
  });
  it('duplica e reordena camadas', () => {
    const a = createElemento('forma', [], canvas); const b = createElemento('texto', [a], canvas);
    const d = duplicateElemento(a, [a, b]);
    expect(d.id).not.toBe(a.id); expect(d.x).toBe(a.x + 20); expect(d.z).toBe(2);
    const moved = moveZ([a, b], a.id, 1);
    expect(moved.find(e => e.id === a.id)!.z).toBe(1); expect(moved.find(e => e.id === b.id)!.z).toBe(0);
    expect(moveZ([a, b], b.id, 1)).toEqual([a, b]);
  });
});
