import { useEffect, useState } from 'react';
import { ArteMetaSchema, ETAPA_PRODUCAO_LABELS, iaModeloLabel } from '../../shared/types';
import type { ArteMeta, Demanda, EtapaProducao } from '../../shared/types';
import { useAppState, useRuntime } from '../state/context';
import { imageUrl } from '../transport/client';
import { metaPathDe } from '../state/arteFinal';
import { formatBrl, formatUsd } from '../state/format';
import { ETAPAS_ATIVAS, ETAPAS_PASSOS, duracao, posicaoNaFila, qualidadeLabel } from '../state/producao';
import { Badge, errorMessage, time, useToast } from './ui';
import { AgentAvatar } from './AgentAvatar';

/** Dispara POST /produzir; o estado novo chega por SSE (demand.updated). */
export function useProduzir() {
  const { api } = useRuntime(); const toast = useToast(); const [pending, setPending] = useState<string | null>(null);
  const produzir = async (id: string) => {
    setPending(id);
    try { await api.produzir(id); toast(`${id} entrou na fila de produção.`); } catch (e) { toast(errorMessage(e), true); } finally { setPending(null); }
  };
  return { pending, produzir };
}

export const EtapaBadge = ({ etapa }: { etapa: EtapaProducao }) => <Badge active={etapa === 'entregue'}>{ETAPA_PRODUCAO_LABELS[etapa]}</Badge>;

function useElapsed(since: string | undefined, running: boolean) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { if (!running) return; setNow(Date.now()); const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, [running, since]);
  return since && running ? duracao(now - new Date(since).getTime()) : null;
}

export function ProducaoCard({ demanda: d }: { demanda: Demanda }) {
  const p = d.producao; const state = useAppState(); const { pending, produzir } = useProduzir();
  const ativa = !!p && ETAPAS_ATIVAS.includes(p.etapa);
  const entrada = (etapa: EtapaProducao) => p?.etapas.findLast(e => e.etapa === etapa);
  const elapsed = useElapsed(p ? entrada(p.etapa)?.em : undefined, ativa);
  if (!p) return null;
  const atual = ETAPAS_PASSOS.indexOf(p.etapa as typeof ETAPAS_PASSOS[number]);
  const fila = p.etapa === 'na_fila' ? posicaoNaFila(state.demandas, d.id) : null;
  const simulado = p.modelo === 'simulado'; const qualidade = qualidadeLabel(p.qualidade);
  // Em erro, a última etapa registrada antes do erro é a que falhou; as anteriores estão concluídas.
  const ultima = p.etapa === 'erro' ? p.etapas.findLast(e => e.etapa !== 'erro' && e.etapa !== 'aguardando')?.etapa : undefined;
  const idxFalha = ultima ? ETAPAS_PASSOS.indexOf(ultima as typeof ETAPAS_PASSOS[number]) : -1;
  return <section className="card producao-card">
    <div className="section-heading"><div className="field-head"><AgentAvatar id={d.criadorAtual ?? 'van_gogh'} size={48} active={ativa}/><div><div className="eyebrow">{d.criadorAtual === 'monalisa' ? 'MONALISA' : 'VAN GOGH'}</div><h2>Produção da arte</h2></div></div><EtapaBadge etapa={p.etapa} /></div>
    {(p.etapa === 'aguardando' || p.etapa === 'erro') && <div className={`producao-action${p.etapa === 'erro' ? ' error' : ''}`}>
      <div>{p.etapa === 'erro' ? <><strong>A geração falhou.</strong><p role="alert">{p.erro ?? 'Erro desconhecido na geração.'}</p></> : <><strong>Classificada e pronta para produzir.</strong><p className="muted">A imagem só é gerada (e cobrada) quando você clica em Produzir.</p></>}</div>
      <button className="button primary" disabled={pending === d.id} onClick={() => void produzir(d.id)}>{pending === d.id ? 'Enviando…' : p.etapa === 'erro' ? 'Tentar novamente' : 'Produzir arte'}</button>
    </div>}
    {p.etapa !== 'aguardando' && <ol className="producao-stepper" aria-label="Etapas da produção">{ETAPAS_PASSOS.map((etapa, i) => {
      const reg = entrada(etapa);
      const done = p.etapa === 'entregue' || (atual >= 0 && i < atual) || (idxFalha >= 0 && i < idxFalha);
      const cur = atual >= 0 && i === atual && p.etapa !== 'entregue'; const failed = idxFalha >= 0 && i === idxFalha;
      return <li key={etapa} className={done ? 'done' : cur ? 'current' : failed ? 'failed' : ''} aria-current={cur ? 'step' : undefined}>
        <span className="step-dot">{done ? '✓' : failed ? '!' : i + 1}</span>
        <strong>{ETAPA_PRODUCAO_LABELS[etapa]}</strong>
        {reg && (done || failed) && <time>{time(reg.em)}</time>}
        {cur && elapsed && <time className="elapsed">{elapsed}</time>}
        {reg?.detalhe && (done || cur || failed) && <p>{reg.detalhe}</p>}
      </li>;
    })}</ol>}
    <div className="metadata producao-meta">
      <div><span>Modelo</span><strong>{iaModeloLabel(p.modelo)}</strong></div>
      <div><span>Qualidade</span><strong>{simulado ? 'Não se aplica' : qualidade ?? '—'}</strong></div>
      <div><span>Versão</span><strong>{p.versao > 0 ? `v${p.versao}` : '—'}</strong></div>
      <div><span>Custo</span><strong>{simulado ? 'Simulado · sem custo' : p.custo ? `${formatUsd(p.custo.usd)} (${formatBrl(p.custo.brl)})` : '—'}</strong></div>
    </div>
    {p.etapa === 'na_fila' && <p className="muted" role="status">{fila ? `${fila}º na fila de produção.` : 'Na fila de produção.'}</p>}
  </section>;
}

/** Lê o .meta.json ao lado da arte em staging; falhas (404, JSON inválido, demo) são ignoradas. */
function useArteMeta(stagingPath: string | undefined) {
  const [meta, setMeta] = useState<ArteMeta | null>(null);
  useEffect(() => {
    const p = metaPathDe(stagingPath); setMeta(null); if (!p) return;
    const ctrl = new AbortController();
    fetch(imageUrl(p), { signal: ctrl.signal }).then(r => r.ok ? r.json() : null).then(j => { const parsed = ArteMetaSchema.safeParse(j); if (parsed.success) setMeta(parsed.data); }).catch(() => {});
    return () => ctrl.abort();
  }, [stagingPath]);
  return meta;
}

export function ArteFinalCard({ demanda: d }: { demanda: Demanda }) {
  const meta = useArteMeta(d.stagingPath); const af = meta?.arteFinal;
  if (!meta || !af) return null;
  return <section className="card arte-final-card">
    <div className="section-heading"><div><div className="eyebrow">VAN GOGH · v{meta.versao}</div><h2>Arte final por IA</h2></div>{meta.modeloImagem && <Badge>{meta.modeloImagem}</Badge>}</div>
    <div className="metadata">
      <div><span>Marca</span><strong>{af.marca ?? 'Sem skill de marca'}</strong></div>
      <div><span>Composição</span><strong>{af.composicao.replace(/_/g, ' ')}</strong></div>
      <div><span>Logo oficial</span><strong>{af.logo ? `${af.logo.posicao.replace(/_/g, ' ')} · ${af.logo.variante}` : 'Não aplicada'}</strong></div>
    </div>
    {!af.logo && <p className="notice" role="status">A logo oficial não foi colada nesta arte. Cadastre as logos da empresa em Empresas.</p>}
    {meta.ajustesCompliance.map((m, i) => <p className="notice" role="status" key={i}>{m}</p>)}
    {af.textosExatos.length > 0 && <><div className="muted small-text">Textos exatos enviados ao modelo</div><div className="chip-row">{af.textosExatos.map((t, i) => <span className="chip" key={i}>{t}</span>)}</div></>}
    {af.referencias.length > 0 && <><div className="muted small-text">Referências usadas</div><div className="arte-final-refs">{af.referencias.map(r => <a key={r} href={imageUrl(r)} target="_blank" rel="noreferrer" title={r.split('/').at(-1)}><img src={imageUrl(r)} alt={`Referência ${r.split('/').at(-1)}`} loading="lazy" decoding="async" /></a>)}</div></>}
  </section>;
}
