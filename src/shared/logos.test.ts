import { describe, expect, it } from 'vitest';
import { EmpresaSchema } from './types';
import { adicionarLogo, atualizarLogos, galeriaLogos, logosElegiveis } from './logos';

describe('galeria de logos', () => {
  it('preserva logos antigas e prioriza todas as principais de cada fundo', () => {
    const original = EmpresaSchema.parse({ id: 'marca', nome: 'Marca', logos: { claro: 'antiga.png', escuro: 'branca.png' } });
    let empresa = adicionarLogo(original, 'alternativa.png', 'claro', false);
    empresa = adicionarLogo(empresa, 'principal.png', 'claro', true);
    expect(galeriaLogos(empresa)).toHaveLength(4);
    expect(logosElegiveis(empresa, 'claro')).toEqual(['antiga.png', 'principal.png']);
    expect(logosElegiveis(empresa, 'escuro')).toEqual(['branca.png']);
    empresa = atualizarLogos({ ...empresa, galeriaLogos: empresa.galeriaLogos!.map(l => ({ ...l, principal: false })) });
    expect(logosElegiveis(empresa, 'claro')).toEqual(['antiga.png', 'alternativa.png', 'principal.png']);
    expect(atualizarLogos({ ...empresa, galeriaLogos: [] }).logos).toEqual({ claro: null, escuro: null });
  });
});
