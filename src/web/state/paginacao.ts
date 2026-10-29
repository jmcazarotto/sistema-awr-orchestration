/** Página `pagina` (1-based, limitada ao intervalo válido) de `itens`, com totais para o rodapé "1–10 de 23". */
export function paginar<T>(itens: T[], pagina: number, tamanho = 10) {
  const paginas = Math.max(1, Math.ceil(itens.length / tamanho));
  const atual = Math.min(Math.max(1, pagina), paginas);
  const inicio = (atual - 1) * tamanho;
  return { itens: itens.slice(inicio, inicio + tamanho), pagina: atual, paginas, de: itens.length ? inicio + 1 : 0, ate: Math.min(inicio + tamanho, itens.length), total: itens.length };
}
