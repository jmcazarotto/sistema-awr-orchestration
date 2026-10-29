import type { Demanda, FeedbackDiretor, Learning, Procedimento, ReferenciaMarca, TipoTemplate } from '../../shared/types';
import type { LoadedMarca, LoadedSkill } from '../brain/BrainLoader';
import { segmentar, tipoPorRegra } from './briefingExtractor';

/**
 * Arte final por IA (Van Gogh) — peças puras da técnica `arte_final_ia`:
 * composição, escolha de referências, textos exatos do briefing e montagem do prompt em camadas
 * (agente → marca → procedimento → técnica → briefing).
 */

/** Composição aprovada da marca para o tipo de arte. `null` = não gerável por IA (antes/depois exige fotos reais). */
export function composicaoPara(procedimento: Procedimento, tipoTemplate: TipoTemplate): string | null {
  if (tipoTemplate.startsWith('antes_depois')) return null;
  if (tipoTemplate === 'banco_imagem_2') return 'informativa_clean';
  return procedimento === 'preenchimento_labial' ? 'close_procedimento' : 'modelo_destaque';
}

/** 2–3 referências: mesmo procedimento + composição; depois mesma composição; depois modelo_destaque. Nunca antes/depois. */
export function selecionarReferencias(referencias: ReferenciaMarca[], procedimento: Procedimento, composicao: string, quantidade = 3): ReferenciaMarca[] {
  const geraveis = referencias.filter(ref => ref.composicao !== 'antes_depois_editorial');
  const ordem = [
    (ref: ReferenciaMarca) => ref.procedimento === procedimento && ref.composicao === composicao,
    (ref: ReferenciaMarca) => ref.procedimento === procedimento,
    (ref: ReferenciaMarca) => ref.composicao === composicao,
    (ref: ReferenciaMarca) => ref.composicao === 'modelo_destaque',
  ];
  const escolhidas: ReferenciaMarca[] = [];
  for (const criterio of ordem) for (const ref of geraveis) if (escolhidas.length < quantidade && criterio(ref) && !escolhidas.includes(ref)) escolhidas.push(ref);
  return escolhidas;
}

export interface TextosArte { titulo: string; cta: string; literais: string[]; oferta: string[] }
/** Textos que a IA deve escrever literalmente. Preço/parcelamento/desconto/contato/aspas vêm do briefing por regra. */
/** Todos os valores do trecho: parcelados ("6x de R$ 149,90") e à vista ("R$ 899,00") fora deles. */
export function extrairPrecos(trecho: string): string[] {
  const parcelados = [...trecho.matchAll(/(\d{1,2})\s*(?:x|vezes)\s*(?:de\s*)?(?:R\$\s*)?(\d[\d.]*,\d{2})/gi)];
  const dentro = (i: number) => parcelados.some(m => i >= m.index! && i < m.index! + m[0].length);
  const avista = [...trecho.matchAll(/R\$\s*(\d[\d.]*(?:,\d{2})?)/gi)].filter(m => !dentro(m.index!));
  return [...parcelados.map(m => `${m[1]}x de R$ ${m[2]}`), ...avista.map(m => `R$ ${m[1]}`)];
}
export function textosExatos(demanda: Pick<Demanda, 'briefing' | 'headline' | 'cta'>, procedimentoLabel: string, ctaPadrao: string): TextosArte {
  const oferta: string[] = []; const literais: string[] = []; let ctaBriefing: string | undefined;
  for (const trecho of segmentar(demanda.briefing)) {
    const regra = tipoPorRegra(trecho);
    if (!regra) continue;
    if (regra.tipo === 'preco') oferta.push(...extrairPrecos(trecho));
    else if (regra.tipo === 'promocao' && regra.valor) oferta.push(regra.valor);
    else if (regra.tipo === 'chamada_cta' && regra.valor) ctaBriefing ??= regra.valor;
    else if ((regra.tipo === 'contato' || regra.tipo === 'texto_literal') && regra.valor) literais.push(regra.valor);
  }
  // Parcelado antes do à vista (regra da marca).
  oferta.sort((a, b) => Number(/\dx /.test(b)) - Number(/\dx /.test(a)));
  return { titulo: demanda.headline ?? procedimentoLabel, cta: demanda.cta ?? ctaBriefing ?? ctaPadrao, literais: [...new Set(literais)], oferta: [...new Set(oferta)] };
}

/** Promessa permitida + termos proibidos da skill do procedimento (§1), em forma compacta para o prompt. */
export function contextoProcedimento(skill: LoadedSkill): string {
  const linha = (rotulo: RegExp) => skill.conteudo.split(/\r?\n/).find(text => rotulo.test(text))?.replace(/\*\*/g, '').trim();
  return [linha(/^\*\*Promessa permitida:/), linha(/^\*\*Termos e afirmações PROIBIDOS/)].filter(Boolean).map(text => `COMPLIANCE (Brazil, health ads): ${text}`).join('\n');
}

export interface PromptArteFinal {
  agente: string; tecnica: LoadedSkill; marca: LoadedMarca | null; skill: LoadedSkill; composicao: string;
  textos: TextosArte; referencias: ReferenciaMarca[]; briefing: string; feedback?: FeedbackDiretor; aprendizados: Learning[];
  /** Nomes da empresa/unidades removidos do briefing (a IA não escreve marca; o logo oficial entra depois). */
  ocultar?: string[];
}
/** Troca nomes de empresa/unidade por "a clínica" (sem acento/caixa importar). */
export function ocultarNomes(texto: string, nomes: string[]): string {
  const fold = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  let resultado = texto.normalize('NFC');
  for (const nome of [...nomes].filter(n => n.trim().length >= 3).sort((a, b) => b.length - a.length)) {
    const alvo = fold(nome); let i = fold(resultado).indexOf(alvo);
    while (i >= 0) { resultado = `${resultado.slice(0, i)}a clínica${resultado.slice(i + nome.length)}`; i = fold(resultado).indexOf(alvo, i + 9); }
  }
  return resultado;
}
export function montarPrompt(input: PromptArteFinal): string {
  const { textos } = input;
  const lista = [`- Title / procedure name: "${textos.titulo}"`, ...textos.literais.map(texto => `- "${texto}"`), `- Call to action button: "${textos.cta}"`].join('\n');
  const oferta = textos.oferta.length
    ? `OFFER BLOCK (rounded block in gold + white + soft black, installment value most prominent, cents smaller), write exactly: ${textos.oferta.map(valor => `"${valor}"`).join(' and ')}`
    : 'NO OFFER: do not draw any price, installment, discount or commercial block (rebalance photo, title and benefit instead).';
  const marcaPrompt = input.marca
    ? `${input.marca.promptMarca}\nCOMPOSITION GUIDE (${input.composicao}): ${input.marca.composicoes[input.composicao] ?? ''}`
    : `BRAND: clean, premium aesthetic clinic look. Palette: ${input.skill.palette.join(', ')}. Do not draw any logo.`;
  const valores: Record<string, string> = {
    marca_prompt: marcaPrompt, procedimento_label: input.skill.label, composicao: input.composicao,
    procedimento_contexto: contextoProcedimento(input.skill), textos_exatos: lista, oferta, disclaimer: input.skill.disclaimer,
    referencias: input.referencias.length ? `Attached references: ${input.referencias.map(ref => `${ref.id} (${ref.composicao}${ref.usarCopy ? '' : ', layout only — never reuse its copy'})`).join('; ')}.` : 'No reference images attached.',
    briefing_cliente: ocultarNomes(input.briefing, input.ocultar ?? []).replace(/\s+/g, ' ').slice(0, 600),
    feedback_ajuste: input.feedback ? `ADJUSTMENT REQUEST (the first attached image is the previous version: keep everything else, change only this): ${input.feedback.resumo} ${input.feedback.correcoes.map(item => `[${item.itemId}] ${item.instrucao}`).join(' ')}` : '',
    aprendizados: input.aprendizados.length ? `LEARNED RULES: ${input.aprendizados.map(learning => learning.regra).join(' | ')}` : '',
  };
  const corpo = input.tecnica.promptBase.replace(/\{\{(\w+)\}\}/g, (_, chave: string) => valores[chave] ?? '');
  return `${input.agente}\n\n${corpo}`.replace(/\n{3,}/g, '\n\n').trim();
}
