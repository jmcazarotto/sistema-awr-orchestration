import type { CriadorId } from '../../shared/types';

/**
 * Roteamento do agente de arte (AGENTS.md §1):
 * - monalisa: abastecimento rotineiro do acervo (peças genéricas, sem cliente);
 * - van_gogh: demanda de cliente / unidade.
 * Sinal único e claro → regra (confiança 1). Ambos ou nenhum → o classificador decide.
 */
export interface DecisaoAgente { agente: CriadorId; confianca: number; motivo: string }

const fold = (text: string) => text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const ACERVO = /\b(acervo|abastec\w*|reabastec\w*|repor|reposicao|completar a grade|banco interno|estoque de (artes|imagens))\b/;
const CLIENTE = /\b(clientes?|unidade|franquead[oa]s?|pedido|solicitou|solicitacao d[ao])\b/;

export function decidirAgentePorRegra(texto: string, empresaCitada: boolean): DecisaoAgente | null {
  const t = fold(texto);
  const acervo = ACERVO.test(t);
  const cliente = CLIENTE.test(t) || empresaCitada;
  if (acervo && !cliente) return { agente: 'monalisa', confianca: 1, motivo: 'Pedido de abastecimento do acervo → Monalisa.' };
  if (cliente && !acervo) return { agente: 'van_gogh', confianca: 1, motivo: empresaCitada ? 'Demanda de cliente (empresa citada) → Van Gogh.' : 'Demanda de cliente → Van Gogh.' };
  return null;
}

export const criteriosAgente = {
  van_gogh: 'Demanda de cliente: arte sob medida pedida por uma clínica, unidade ou franqueado (ex.: "recebemos uma demanda da unidade X", "arte para a clínica Y").',
  monalisa: 'Abastecimento rotineiro do acervo interno: peças genéricas de procedimento, sem cliente específico (ex.: "precisamos abastecer o acervo de botox", "completar a grade de templates").',
} satisfies Record<CriadorId, string>;
