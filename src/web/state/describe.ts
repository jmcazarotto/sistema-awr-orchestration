import { PROCEDIMENTO_LABELS } from '../../shared/types';
import type { ActorStatus, Demanda, InboxMessage, TipoTemplate, Triagem } from '../../shared/types';
import { imageUrl } from '../transport/client';
import { formatCusto, formatLatencia } from './format';

export const names: Record<string, string> = {art_director:'Diretor de Arte',van_gogh:'Van Gogh',monalisa:'Monalisa',system:'Sistema',awr_human:'Revisor AWR',acervo_watcher:'Monitor do acervo'};
export const templateDescriptions: Record<TipoTemplate, string> = {
  antes_depois_1: 'Comparação lado a lado, com headline e CTA na área segura.',
  antes_depois_2: 'Antes em cima e depois embaixo, com CTA na largura total.',
  banco_imagem_1: 'Imagem principal com headline e CTA no rodapé.',
  banco_imagem_2: 'Imagem e texto em blocos, com destaque para a chamada.',
};
export function describeMessage(m: InboxMessage, messages: InboxMessage[] = []) {
  const prefix = `${names[m.from]} → ${names[m.to]}: `;
  let text: string;
  let art: {url: string; path: string; label: string; remade?: boolean} | undefined;
  switch (m.action) {
    case 'DEMANDA_CLASSIFICADA': text = `classificou ${m.demandaId} · ${PROCEDIMENTO_LABELS[m.payload.classificacao.procedimento]} · ${m.payload.classificacao.tipoTemplate}`; break;
    case 'PREENCHER_ACERVO': text = `solicitou arte para o acervo · ${PROCEDIMENTO_LABELS[m.payload.procedimento]} · ${m.payload.tipoTemplate}`; break;
    case 'PRODUZIR_ARTE': text = `produzir a arte ${m.demandaId} · ${PROCEDIMENTO_LABELS[m.payload.procedimento]} · ${m.payload.tipoTemplate}`; break;
    case 'ARTE_ENTREGUE': {
      const p = m.payload; text = `entregou a arte v${p.versao} de ${m.demandaId}`;
      art = {url:imageUrl(p.stagingPath),path:p.stagingPath,label:`Abrir arte v${p.versao}`,remade:p.versao > 1}; break;
    }
    case 'AJUSTAR_ARTE': {
      const p = m.payload; const ids = p.feedbackDiretor.correcoes.map(c => c.itemId);
      text = `ajustar a arte ${m.demandaId} (v${p.versaoAnterior}): ${ids.length ? `corrigir ${ids.join(', ')} · ` : ''}${p.feedbackDiretor.resumo}`;
      const delivery = messages.find(x => x.action === 'ARTE_ENTREGUE' && x.demandaId === m.demandaId && x.payload.versao === p.versaoAnterior);
      const path = delivery?.action === 'ARTE_ENTREGUE' ? delivery.payload.stagingPath : `_staging/${m.demandaId}__v${p.versaoAnterior}.png`;
      art = {path,url:imageUrl(path),label:`Abrir versão anterior v${p.versaoAnterior}`}; break;
    }
    case 'FEEDBACK_HUMANO': text = `${m.payload.decisao === 'aprovar' ? 'aprovou' : 'solicitou ajuste em'} ${m.demandaId}${m.payload.motivo ? `: ${m.payload.motivo}` : ''}`; break;
  }
  return {text:prefix + text,art,demandaUrl:`#/demandas/${m.demandaId}`};
}
export function describeActor(actor: {status: ActorStatus; demandaId: string | null}, demand?: Demanda, maxAttempts = 3) {
  if (actor.status === 'idle') return 'Aguardando ordens';
  const id = actor.demandaId ?? demand?.id ?? 'demanda';
  if (actor.status === 'reviewing') return `Revisando a rubrica de ${id} (tentativa ${Math.max(1,demand?.tentativaDiretor ?? 0)}/${maxAttempts})`;
  const detail = demand?.classificacao ? ` · ${PROCEDIMENTO_LABELS[demand.classificacao.procedimento]} · ${demand.classificacao.tipoTemplate}` : '';
  return actor.status === 'generating' ? `Gerando v${(demand?.versaoAtual ?? 0)+1} de ${id}${detail}` : `Analisando ${id}${detail}`;
}
export const describeTriagem = (t: Triagem) => `Classificação/triagem: ${t.empresa.nome ?? 'Empresa não identificada'} · ${PROCEDIMENTO_LABELS[t.procedimento]} · ${t.tipoTemplate} · ${names[t.agente]} · ${formatLatencia(t.latenciaMs)} · ${formatCusto(t.custo)}`;
export const describeSaved = (d: Demanda) => d.estado === 'APROVADA_SALVA_NO_ACERVO' && d.finalPath ? {text:`Arte salva no acervo · ${d.id}`,url:imageUrl(d.finalPath)} : null;
