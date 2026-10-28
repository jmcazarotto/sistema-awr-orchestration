import type { CriadorId } from '../../shared/types';

/**
 * Roteamento do agente de arte (AGENTS.md §1):
 * - monalisa: abastecimento rotineiro do acervo (peças genéricas, sem cliente);
 * - van_gogh: demanda de cliente / unidade.
 * Abastecimento sem pedido explícito de cliente → Monalisa; cliente/empresa/unidade sem abastecimento → Van Gogh.
 * Ambos explícitos ou nenhum sinal → o classificador decide.
 */
export interface DecisaoAgente { agente: CriadorId; confianca: number; motivo: string }

const fold = (text: string) => text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const ACERVO = /\b(acervo|abastec\w*|reabastec\w*|repor|reposicao|completar a grade|banco interno|estoque de (artes|imagens))\b/;
/** Pedido explícito de cliente — só isso compete com um pedido de abastecimento. */
const CLIENTE_EXPLICITO = /\b(clientes?|pedido|pediu|pediram|solicit\w*|franquead[oa]s?|briefing d[oa])\b/;
const UNIDADE = /\bunidade\b/;

export function decidirAgentePorRegra(texto: string, empresaCitada: boolean): DecisaoAgente | null {
  const t = fold(texto);
  const acervo = ACERVO.test(t);
  const clienteExplicito = CLIENTE_EXPLICITO.test(t);
  // "abastecer as artes de botox da Royal Face" → acervo da rede, não demanda de cliente.
  if (acervo && !clienteExplicito) return { agente: 'monalisa', confianca: 1, motivo: empresaCitada ? 'Pedido de abastecimento do acervo (da rede citada) → Monalisa.' : 'Pedido de abastecimento do acervo → Monalisa.' };
  if (!acervo && (clienteExplicito || empresaCitada || UNIDADE.test(t))) return { agente: 'van_gogh', confianca: 1, motivo: empresaCitada ? 'Demanda de cliente (empresa citada) → Van Gogh.' : 'Demanda de cliente → Van Gogh.' };
  return null;
}

export const criteriosAgente = {
  van_gogh: 'Demanda de cliente: arte sob medida pedida pontualmente por uma clínica, unidade ou franqueado (ex.: "recebemos uma demanda da unidade X", "o cliente pediu um antes e depois", "arte para a clínica Y").',
  monalisa: 'Abastecimento rotineiro do acervo: produzir peças de estoque por procedimento, sem um pedido pontual de cliente — mesmo quando cita a rede cujo acervo será abastecido (ex.: "precisamos abastecer o acervo de botox", "abastecer as artes de botox da Royal Face", "completar a grade de templates").',
} satisfies Record<CriadorId, string>;
