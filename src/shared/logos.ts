import type { Empresa } from './types';

export function galeriaLogos(empresa: Pick<Empresa, 'logos' | 'galeriaLogos'>) {
  const itens = [...(empresa.galeriaLogos ?? [])];
  for (const fundo of ['claro', 'escuro'] as const) {
    const arquivo = empresa.logos[fundo];
    if (arquivo && !itens.some(l => l.arquivo === arquivo && l.fundo === fundo)) itens.push({ arquivo, fundo, principal: true });
  }
  return itens;
}

export function atualizarLogos(empresa: Empresa): Empresa {
  if (!empresa.galeriaLogos) return empresa;
  const escolher = (fundo: 'claro' | 'escuro') => {
    const itens = empresa.galeriaLogos!.filter(l => l.fundo === fundo);
    return (itens.find(l => l.principal) ?? itens[0])?.arquivo ?? null;
  };
  return { ...empresa, logos: { claro: escolher('claro'), escuro: escolher('escuro') } };
}

export function adicionarLogo(empresa: Empresa, arquivo: string, fundo: 'claro' | 'escuro', principal: boolean): Empresa {
  return atualizarLogos({ ...empresa, galeriaLogos: [...galeriaLogos(empresa), { arquivo, fundo, principal }] });
}

/** Todas as principais são elegíveis; sem marcação, usa as alternativas cadastradas. */
export function logosElegiveis(empresa: Empresa, fundo: 'claro' | 'escuro'): string[] {
  const itens = galeriaLogos(empresa).filter(l => l.fundo === fundo);
  const principais = itens.filter(l => l.principal);
  return (principais.length ? principais : itens).map(l => l.arquivo);
}
