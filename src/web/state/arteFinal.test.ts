import { describe, expect, it } from 'vitest';
import { isTecnica, logosCadastrados, metaPathDe, tecnicaLabel } from './arteFinal';

describe('arteFinal helpers', () => {
  it('troca .png por .meta.json', () => {
    expect(metaPathDe('_staging/DEM-0001__v1.png')).toBe('_staging/DEM-0001__v1.meta.json');
    expect(metaPathDe(undefined)).toBeNull();
    expect(metaPathDe('x.jpg')).toBeNull();
  });
  it('lista variantes de logo cadastradas', () => {
    expect(logosCadastrados({ logo: 'a.png', logos: { claro: null, escuro: 'b.png' } }).map(l => l.ok)).toEqual([true, false, true]);
  });
  it('classifica técnicas', () => {
    expect(isTecnica('arte_final_ia')).toBe(true);
    expect(isTecnica('botox')).toBe(false);
    expect(tecnicaLabel({ id: 'arte_final_ia', label: 'x' })).toBe('Van Gogh · arte final por IA');
  });
});
