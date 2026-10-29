import { ETAPA_PRODUCAO_LABELS, PROCEDIMENTO_LABELS } from '../../shared/types';
import type { ActorId, ActorStatus, Demanda } from '../../shared/types';

const NOMES: Record<string, string> = { art_director: 'Diretor de Arte', van_gogh: 'Van Gogh', monalisa: 'Monalisa' };
const ATIVOS = ['CRIADA', 'CLASSIFICADA', 'EM_PRODUCAO', 'EM_REVISAO_DIRETOR', 'EM_AJUSTE_IA', 'REPROVADA_HUMANO'];
const hora = (iso?: string) => (iso ? new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '');

export interface MotivoAgente {
  situacao: 'trabalhando' | 'parado' | 'pausado';
  titulo: string;
  /** Por que está trabalhando (origem da ordem) ou o que está esperando. */
  motivo: string;
  demandaId: string | null;
  /** Ordens esperando este criador (na fila / pausadas). */
  fila: number;
  /** Demandas do Van Gogh classificadas esperando o clique em "Produzir". */
  aguardandoProduzir: number;
}

const resumo = (d: Demanda) => [d.id, d.classificacao ? PROCEDIMENTO_LABELS[d.classificacao.procedimento] : null, d.clinicaNome].filter(Boolean).join(' · ');

/** Explica, em linguagem de operação, o que o agente está fazendo agora e por quê. */
export function motivoAgente(id: ActorId, actor: { status: ActorStatus; demandaId: string | null }, demandas: Demanda[], pausados: ActorId[]): MotivoAgente {
  const pausado = pausados.includes(id);
  const fila = demandas.filter(d => d.criadorAtual === id && ['EM_PRODUCAO', 'EM_AJUSTE_IA'].includes(d.estado) && (d.producao?.etapa === 'na_fila' || (!d.producao && d.versaoAtual === 0))).length;
  const aguardandoProduzir = id === 'van_gogh' ? demandas.filter(d => d.producao?.etapa === 'aguardando').length : 0;
  const d = actor.demandaId ? demandas.find(value => value.id === actor.demandaId) : undefined;
  const espera = [fila ? `${fila} na fila` : '', aguardandoProduzir ? `${aguardandoProduzir} aguardando o botão Produzir` : ''].filter(Boolean).join(' · ');
  if (actor.status !== 'idle' && d && ATIVOS.includes(d.estado)) {
    if (id === 'art_director') {
      const titulo = actor.status === 'reviewing' ? `Revisando a arte v${d.versaoAtual} de ${resumo(d)}` : `Analisando ${resumo(d)}`;
      const motivo = actor.status === 'reviewing' ? `${NOMES[d.criadorAtual ?? ''] ?? 'O criador'} entregou a arte; o Diretor confere a rubrica antes de mandar para a Aprovação AWR.`
        : d.estado === 'CLASSIFICADA' || d.estado === 'CRIADA' ? 'Demanda nova chegou: classificando e decidindo qual agente cria.' : 'Coordenando a produção desta demanda.';
      return { situacao: 'trabalhando', titulo, motivo, demandaId: d.id, fila, aguardandoProduzir };
    }
    const etapa = d.producao ? ETAPA_PRODUCAO_LABELS[d.producao.etapa] : actor.status === 'generating' ? 'Gerando' : 'Analisando';
    const pedido = d.producao?.solicitadoEm ?? d.producao?.etapas.find(e => e.etapa === 'na_fila')?.em;
    const motivo = d.origem === 'acervo'
      ? `Abastecimento automático do acervo: slot vazio de ${d.classificacao ? PROCEDIMENTO_LABELS[d.classificacao.procedimento] : 'procedimento'}${d.classificacao ? ` · ${d.classificacao.tipoTemplate}` : ''}.`
      : d.estado === 'EM_AJUSTE_IA' ? 'O Diretor reprovou a versão anterior e pediu correção.'
      : d.historico.some(h => h.para === 'REPROVADA_HUMANO') && d.versaoAtual > 0 ? 'A AWR pediu ajuste na aprovação humana.'
      : `Pedido de cliente${pedido ? ` — produção solicitada às ${hora(pedido)} (botão Produzir)` : ''}.`;
    return { situacao: 'trabalhando', titulo: `${etapa} · ${resumo(d)}`, motivo, demandaId: d.id, fila, aguardandoProduzir };
  }
  if (pausado) return { situacao: 'pausado', titulo: 'Pausado', motivo: espera ? `Não pega nada da fila até ser retomado (${espera}).` : 'Não pega nada da fila até ser retomado.', demandaId: null, fila, aguardandoProduzir };
  return { situacao: 'parado', titulo: 'Parado · nenhuma demanda ativa', motivo: espera ? `Esperando: ${espera}.` : 'Só trabalha quando recebe uma ordem do Diretor de Arte.', demandaId: null, fila, aguardandoProduzir };
}
