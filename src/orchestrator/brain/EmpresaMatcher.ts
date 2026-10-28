import type { Cliente, Unidade } from './ClientesRegistry';

/**
 * Identificação determinística de empresa: se o texto cita literalmente o nome (ou alias) de uma
 * rede cadastrada, não há o que "adivinhar" — confiança 1. A IA só entra quando não há match exato.
 */
export interface EmpresaMatch {
  rede: Pick<Cliente, 'id' | 'nome'>;
  /** Unidade cadastrada citada no texto (por nome, cidade ou alias). */
  unidade: Unidade | null;
  /** Texto da unidade citada logo após o nome da rede quando ela NÃO está cadastrada (ex.: "Londrina"). */
  unidadeNaoCadastrada: string | null;
}

interface Token { raw: string; norm: string; start: number; end: number }

const fold = (text: string) => text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
function tokenize(text: string): Token[] {
  return [...text.matchAll(/[\p{L}\p{N}][\p{L}\p{N}'’.-]*/gu)]
    .map(m => ({ raw: m[0].replace(/[.-]+$/, ''), norm: fold(m[0]), start: m.index, end: m.index + m[0].length }))
    .filter(token => token.norm);
}
/** Índice do primeiro token da ocorrência de `phrase` em `tokens` (sequência contígua), ou -1. */
function find(tokens: Token[], phrase: string): number {
  const target = tokenize(phrase).map(token => token.norm);
  if (!target.length) return -1;
  for (let i = 0; i + target.length <= tokens.length; i++) if (target.every((norm, k) => tokens[i + k]!.norm === norm)) return i;
  // alias colado ("RoyalFace") contra texto separado ("Royal Face") e vice-versa
  const glued = target.join('');
  for (let i = 0; i < tokens.length; i++) {
    let acc = '';
    for (let j = i; j < tokens.length && acc.length < glued.length; j++) { acc += tokens[j]!.norm; if (acc === glued) return i; }
  }
  return -1;
}
const phraseLength = (tokens: Token[], at: number, phrase: string) => {
  const glued = fold(phrase);
  let acc = '', n = 0;
  while (at + n < tokens.length && acc.length < glued.length) acc += tokens[at + n++]!.norm;
  return n;
};

const CONECTORES = new Set(['de', 'da', 'do', 'dos', 'das']);
/** Palavras que encerram o nome da unidade (vocabulário de briefing, não de topônimo). */
const PARADAS = new Set([
  'antes', 'depois', 'e', 'ou', 'com', 'para', 'pra', 'por', 'no', 'na', 'nos', 'nas', 'em', 'sobre', 'que', 'um', 'uma', 'o', 'a', 'os', 'as',
  'arte', 'artes', 'post', 'posts', 'story', 'stories', 'feed', 'reels', 'foto', 'fotos', 'imagem', 'banco', 'institucional', 'anuncio', 'criativo',
  'campanha', 'template', 'layout', 'modelo', 'lado', 'empilhado', 'comparativo', 'comparacao', 'mostrando', 'urgente', 'hoje', 'amanha',
  'botox', 'toxina', 'botulinica', 'preenchimento', 'labial', 'labios', 'labio', 'fios', 'fio', 'sustentacao', 'harmonizacao', 'procedimento',
  'clinica', 'unidade', 'franquia', 'rede', 'quero', 'preciso', 'fazer', 'criar', 'precisamos', 'gostaria',
]);
const titleCase = (word: string) => (word === word.toLowerCase() ? word.charAt(0).toUpperCase() + word.slice(1) : word);

/** Texto da unidade logo após o nome da rede: "Royal Face Maringá antes…" → "Maringá"; "Royal Face de São José dos Campos" → "São José dos Campos". */
function unidadeApos(text: string, tokens: Token[], from: number): string | null {
  let i = from;
  if (tokens[i] && (CONECTORES.has(tokens[i]!.norm) || tokens[i]!.norm === 'unidade')) i++;
  const parts: string[] = [];
  for (; i < tokens.length && parts.length < 5; i++) {
    const token = tokens[i]!;
    if (/[,;:!?()\n]/.test(text.slice(tokens[i - 1]?.end ?? token.start, token.start))) break;
    if (CONECTORES.has(token.norm)) {
      const next = tokens[i + 1];
      if (parts.length && next && /^\p{Lu}/u.test(next.raw) && !PARADAS.has(next.norm)) { parts.push(token.raw.toLowerCase()); continue; }
      break;
    }
    if (PARADAS.has(token.norm) || /\d/.test(token.norm)) break;
    parts.push(titleCase(token.raw));
  }
  return parts.length ? parts.join(' ') : null;
}

export function matchEmpresa(texto: string, clientes: Cliente[]): EmpresaMatch | null {
  const tokens = tokenize(texto);
  for (const cliente of clientes) {
    const nomes = [cliente.nome, ...cliente.aliases].sort((a, b) => b.length - a.length);
    const hit = nomes.map(nome => ({ nome, at: find(tokens, nome) })).find(candidate => candidate.at >= 0);
    if (!hit) continue;
    const unidade = unidadeCitada(texto, cliente);
    const temUnidades = cliente.tipo === 'franquia' || cliente.unidades.length > 0;
    const unidadeNaoCadastrada = unidade || !temUnidades ? null : unidadeApos(texto, tokens, hit.at + phraseLength(tokens, hit.at, hit.nome));
    return { rede: { id: cliente.id, nome: cliente.nome }, unidade, unidadeNaoCadastrada };
  }
  return null;
}

/** Procura uma unidade cadastrada da rede citada no texto (usado quando a rede veio da IA). */
export function unidadeCitada(texto: string, cliente: Cliente): Unidade | null {
  const tokens = tokenize(texto);
  return cliente.unidades.find(u => [u.nome, u.cidade, ...u.aliases].some(nome => find(tokens, nome) >= 0)) ?? null;
}
