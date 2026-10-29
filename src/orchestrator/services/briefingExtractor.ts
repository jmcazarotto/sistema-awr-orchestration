import type { BriefingItem, BriefingTipo } from '../../shared/types';

/**
 * Extração do briefing da arte a partir do texto livre da demanda.
 * 1) O texto é quebrado em trechos (vírgulas fora de números, "com", "contendo", "e tom…" etc.).
 * 2) Trechos com padrão inequívoco (preço, parcelamento, %, contato, texto entre aspas) são tipados por regra.
 * 3) O restante é perguntado ao classificador: é só identificação do pedido ou é briefing (e de que tipo)?
 */

const fold = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const GATILHOS_BRIEFING = 'entrega\\w*|tom|chamada|cta|headline|t[ií]tulo|texto|frase|slogan|cor|cores|paleta|p[uú]blico|prazo|data|validade|whatsapp|telefone|contato|endere[cç]o|instagram|pre[cç]o|valor|promo\\w*|desconto|parcela\\w*|condic\\w*|beneficio\\w*|destaque|selo|logo';

export function segmentar(texto: string): string[] {
  const marcado = texto
    .replace(/\r?\n+/g, ' ¦ ')
    .replace(/;|,(?!\d)|(?<!\d),/g, ' ¦ ') // vírgula entre dígitos (99,90) não quebra
    .replace(/\.(?=\s|$)/g, ' ¦ ')
    .replace(/:\s/g, ' ¦ ')
    .replace(/\s+(com|contendo|incluindo|mostrando|destacando|usando|informando|falando( de| sobre)?)\s+/gi, ' ¦ ')
    .replace(new RegExp(`\\s+e\\s+(?=(${GATILHOS_BRIEFING})\\b)`, 'gi'), ' ¦ ')
    .replace(/\s+e\s+(?=(deve|tem que|precisa|entreg|prazo|at[ée]\s))/gi, ' ¦ ');
  return marcado.split('¦').map(s => s.trim().replace(/^(e|com|de)\s+/i, '').trim())
    .filter(s => s.replace(/[^\p{L}\p{N}]/gu, '').length >= 3 && !soLigacao(s));
}

/** Trecho sem conteúdo ("Tem que ser", "e também"): só palavras de ligação/auxiliares. */
const LIGACAO = new Set(['tem', 'que', 'ser', 'deve', 'devem', 'precisa', 'precisam', 'vai', 'vao', 'e', 'com', 'de', 'do', 'da', 'o', 'a', 'os', 'as', 'um', 'uma', 'isso', 'isto', 'tambem', 'ainda', 'por', 'favor', 'pf', 'pfv', 'fazer', 'feito', 'feita', 'ok', 'obrigado', 'obrigada']);
const soLigacao = (trecho: string) => fold(trecho).split(/[^a-z0-9]+/).filter(Boolean).every(w => LIGACAO.has(w));

const MESES = ['janeiro', 'fevereiro', 'marco', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const dd = (n: string | number) => String(n).padStart(2, '0');

/** Data no trecho → "dd/mm" (ou "dd/mm/aaaa"). Aceita 30/10, 30-10, "dia 30 de 10", "30 de outubro". */
export function extrairData(trecho: string): string | null {
  const t = fold(trecho);
  const num = t.match(/\b(\d{1,2})\s*[/-]\s*(\d{1,2})(?:\s*[/-]\s*(\d{2,4}))?\b/);
  if (num && Number(num[2]) <= 12) return `${dd(num[1]!)}/${dd(num[2]!)}${num[3] ? `/${num[3]}` : ''}`;
  const ext = t.match(new RegExp(`\\b(\\d{1,2})\\s+de\\s+(\\d{1,2}|${MESES.join('|')})\\b`));
  if (ext) { const mes = /^\d+$/.test(ext[2]!) ? Number(ext[2]) : MESES.indexOf(ext[2]!) + 1; if (mes >= 1 && mes <= 12) return `${dd(ext[1]!)}/${dd(mes)}`; }
  return null;
}
const ENTREGA = /\b(ate|entrega\w*|entregar|prazo|deve ser feit[oa]|feit[oa] ate|pront[oa]|para o dia)\b/;

/** Tipagem por padrão inequívoco; null = precisa do classificador. */
export function tipoPorRegra(trecho: string): Pick<BriefingItem, 'tipo' | 'valor'> | null {
  const t = fold(trecho);
  const parcelado = trecho.match(/(\d{1,2})\s*(?:x|vezes)\s*(?:de\s*)?(?:R\$\s*)?(\d[\d.]*(?:,\d{1,2})?)/i);
  if (parcelado && (/R\$/i.test(trecho) || /,\d{2}\b/.test(parcelado[2]!))) return { tipo: 'preco', valor: `${parcelado[1]}x de R$ ${parcelado[2]}` };
  const preco = trecho.match(/R\$\s*([\d.]+(?:,\d{1,2})?)/i);
  if (preco) return { tipo: 'preco', valor: `R$ ${preco[1]}` };
  const pct = t.match(/(\d{1,2})\s*%/);
  if (pct || /\b(promo\w*|desconto|black friday|gratis|brinde|sorteio)\b/.test(t)) return { tipo: 'promocao', ...(pct ? { valor: `${pct[1]}% de desconto` } : {}) };
  const data = extrairData(trecho);
  if (data) return ENTREGA.test(t) ? { tipo: 'data_entrega', valor: `até ${data}` } : { tipo: 'prazo_data', valor: data };
  const fone = trecho.match(/\(?\d{2}\)?\s*9?\d{4}[-\s]?\d{4}/);
  if (fone || /\bwhats\w*|@\w{3,}/.test(t)) return { tipo: 'contato', ...(fone ? { valor: fone[0] } : {}) };
  const aspas = trecho.match(/["“'‘]([^"”'’]{3,})["”'’]/);
  if (aspas) return { tipo: /\b(chamada|cta|botao)\b/.test(t) ? 'chamada_cta' : 'texto_literal', valor: aspas[1] };
  return null;
}

/** Opções do classificador para cada trecho (uma pergunta por trecho, todas na mesma chamada). */
export const criteriosTrecho: Record<'pedido' | Exclude<BriefingTipo, 'preco' | 'promocao' | 'contato' | 'texto_literal' | 'data_entrega'>, string> = {
  pedido: 'Só identifica o pedido: tipo de arte (antes e depois, institucional, banco de imagem), empresa/unidade, procedimento, abastecimento de acervo ou quem vai produzir. Não traz conteúdo para a arte.',
  chamada_cta: 'Chamada para ação / texto do botão (ex.: "agende sua avaliação", "fale no WhatsApp").',
  headline: 'Título, frase principal ou mensagem que deve aparecer na arte.',
  tom_estilo: 'Tom, estilo visual, cores, clima ou referência estética (ex.: "tom acolhedor", "cores claras", "mais elegante").',
  publico: 'Público-alvo ou perfil de paciente (ex.: "mulheres 30+", "noivas").',
  prazo_data: 'Data, prazo, validade ou evento (ex.: "para sexta", "Dia das Mães", "válido até 30/11").',
  outro_briefing: 'Outra informação de conteúdo para a arte que não se encaixa acima (benefício, diferencial, observação para o designer).',
};

/** Fallback sem classificador: trecho com vocabulário só de pedido → pedido; caso contrário briefing genérico. */
export function tipoHeuristico(trecho: string): 'pedido' | BriefingTipo {
  const t = fold(trecho);
  if (/\b(tom|estilo|cores?|paleta|clima|elegante|acolhedor|moderno|clean)\b/.test(t)) return 'tom_estilo';
  if (/\b(chamada|cta|agende|agendar|fale|chame|clique)\b/.test(t)) return 'chamada_cta';
  if (/\b(publico|mulheres|homens|noivas|pacientes)\b/.test(t)) return 'publico';
  if (/\b(prazo|ate|dia d[aeo]s?|validade|amanha|sexta|segunda)\b/.test(t)) return 'prazo_data';
  const pedido = /\b(arte|post|antes|depois|institucional|banco de imagem|botox|toxina|preenchimento|labial|fios?|sustentacao|royal|unidade|clinica|acervo|abastec\w*|criar|criacao|fazer|demanda|cliente|recebemos|precisamos)\b/;
  return pedido.test(t) ? 'pedido' : 'outro_briefing';
}
