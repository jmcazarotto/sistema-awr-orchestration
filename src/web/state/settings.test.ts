import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, parseSettings } from './settings';

describe('parseSettings', () => {
  it('usa padrão para valores ausentes ou inválidos e limita faixas', () => {
    expect(parseSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings({ triagemMinMs: 3500, revealMs: 800, animacoes: false })).toEqual({ ...DEFAULT_SETTINGS, triagemMinMs: 3500, revealMs: 800, animacoes: false });
    expect(parseSettings({ triagemMinMs: -5, revealMs: 99999, animacoes: 'sim', nomesEstilo: 'x' })).toEqual({ ...DEFAULT_SETTINGS, triagemMinMs: 0, revealMs: 5000 });
    expect(parseSettings({ nomesEstilo: 'digitar' }).nomesEstilo).toBe('digitar');
    expect(parseSettings({ triagemMinMs: Number.NaN })).toMatchObject({ triagemMinMs: 2000 });
  });
});
