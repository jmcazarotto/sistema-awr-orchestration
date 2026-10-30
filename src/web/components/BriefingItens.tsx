import { iaModeloLabel } from '../../shared/types';
import type { BriefingItem, BriefingTipo, Triagem, TriagemEtapa } from '../../shared/types';
import { formatLatencia, formatUsd } from '../state/format';
import { Badge } from './ui';

export const briefingLabels: Record<BriefingTipo, string> = { preco: 'Preço', promocao: 'Promoção', chamada_cta: 'Chamada (CTA)', headline: 'Título / mensagem', texto_literal: 'Texto', modelo_foto: 'Modelo da foto', descricao_antes: 'Como está antes', descricao_depois: 'Como fica depois', referencia_visual: 'Uso da referência', tom_estilo: 'Tom e estilo', publico: 'Público', restricao: 'Não fazer', prazo_data: 'Data / evento', data_entrega: 'Data de entrega', contato: 'Contato', outro_briefing: 'Observação' };
export const metodoLabels: Record<BriefingItem['metodo'], string> = { regra: 'padrão reconhecido', leitura_ia: 'lido pela IA de texto', ia: 'classificadora', heuristica: 'simulado' };

const campoLabels: Record<string, string> = { ...briefingLabels, empresa: 'Empresa', procedimento: 'Procedimento', tipo_arte: 'Tipo de arte', agente: 'Agente', trechos: 'Trechos do briefing', imagens: 'Imagens anexadas', familia_antes_depois: 'Fotos exigem antes e depois' };

function tituloEtapa(etapa: TriagemEtapa, provider: Triagem['provider']): { titulo: string; papel: string } {
  if (etapa.id === 'regras') return { titulo: 'Regras do sistema', papel: 'Padrões exatos, sem IA e sem custo' };
  if (etapa.id === 'leitura_texto') return { titulo: `Leitura de texto · ${iaModeloLabel(etapa.modelo)}`, papel: 'Entende o texto livre e escreve as informações' };
  return provider === 'jev' ? { titulo: 'Classificadora · Jev', papel: 'Escolhe entre opções fechadas (só texto)' } : { titulo: `Classificadora · ${iaModeloLabel(etapa.modelo)}`, papel: 'Escolhe entre opções fechadas e olha as imagens' };
}
const statusEtapa = { ok: 'executada', simulada: 'simulada', falhou: 'falhou' } as const;

/** Mostra a divisão do trabalho da triagem: o que veio de regra, de texto e de escolha fechada. */
export function EtapasTriagem({ triagem }: { triagem: Triagem }) {
  return <section className="triage-pipeline" aria-label="Quem leu cada parte">
    <span className="eyebrow">Quem leu cada parte</span>
    <ol>{triagem.etapas.map(etapa => { const { titulo, papel } = tituloEtapa(etapa, triagem.provider); return <li key={etapa.id} className={etapa.status === 'falhou' ? 'failed' : ''}>
      <div className="section-heading"><strong>{titulo}</strong><Badge active={etapa.status === 'ok'}>{statusEtapa[etapa.status]}</Badge></div>
      <p className="muted">{papel}</p>
      {etapa.campos.length ? <p className="pipeline-fields">{etapa.campos.map(campo => <span key={campo}>{campoLabels[campo] ?? campo}</span>)}</p> : <p className="muted">Nada identificado nesta etapa.</p>}
      {etapa.id !== 'regras' && etapa.status !== 'simulada' && <small className="muted">{formatLatencia(etapa.latenciaMs)} · {etapa.tokens.entrada} / {etapa.tokens.saida} tokens · {formatUsd(etapa.usd)}</small>}
    </li>; })}</ol>
  </section>;
}

/** Briefing estruturado que chega ao agente criador, usado na demanda já criada. */
export function BriefingResumo({ itens }: { itens: BriefingItem[] }) {
  return <div className="briefing-resumo"><span className="eyebrow">Briefing para o criador</span>
    <dl>{itens.map((item, i) => <div key={i}><dt>{briefingLabels[item.tipo]}</dt><dd>{item.valor ?? item.texto}</dd></div>)}</dl>
  </div>;
}
