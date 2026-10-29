import { describe, expect, it } from 'vitest';
import { paginar } from './paginacao';

describe('paginar', () => {
  const itens = Array.from({ length: 23 }, (_, i) => i + 1);
  it('fatia de 10 em 10 e informa o intervalo', () => {
    expect(paginar(itens, 1)).toMatchObject({ itens: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], pagina: 1, paginas: 3, de: 1, ate: 10, total: 23 });
    expect(paginar(itens, 3)).toMatchObject({ itens: [21, 22, 23], de: 21, ate: 23 });
  });
  it('limita a página ao intervalo válido (lista encolheu) e trata lista vazia', () => {
    expect(paginar(itens, 9).pagina).toBe(3);
    expect(paginar([], 2)).toMatchObject({ itens: [], pagina: 1, paginas: 1, de: 0, ate: 0 });
  });
});
