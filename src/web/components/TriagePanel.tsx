import { useEffect, useRef, useState } from 'react';
import { PROCEDIMENTO_LABELS } from '../../shared/types';
import type { Triagem } from '../../shared/types';
import { useAppState, useRuntime } from '../state/context';
import { mergeTriagens } from '../state/store';
import { formatCusto, formatLatencia, withMinDelay } from '../state/format';
import { templateDescriptions } from '../state/describe';

const metodoEmpresa = { cadastro: 'nome encontrado no cadastro', ia: 'identificada pelo classificador', extracao: 'nome extraído do texto (não cadastrado)', nenhum: 'empresa não citada' } as const;
import { Badge, errorMessage, templateLabel } from './ui';

export function TriagePanel() {
  const {api,store} = useRuntime(); const state = useAppState();
  const [texto,setTexto] = useState(''); const [busy,setBusy] = useState(false);
  const [result,setResult] = useState<Triagem | null>(null); const [error,setError] = useState<string | null>(null);
  const mounted = useRef(true); const pending = useRef(false);
  const historyBeforeSubmit = useRef(new Set<string>());
  useEffect(() => {mounted.current=true;return () => {mounted.current=false;};},[]);
  async function submit() {
    if (pending.current || texto.trim().length < 3) return;
    historyBeforeSubmit.current = new Set(state.triagens.map(t => t.id));
    pending.current=true;setBusy(true);setError(null);setResult(null);
    try {
      const {triagem} = await withMinDelay(api.triagem(texto));
      store.update(s => ({...s,triagens:mergeTriagens(s.triagens,triagem)}));
      if (mounted.current) setResult(triagem);
    } catch (e) {if (mounted.current) setError(errorMessage(e));}
    finally {pending.current=false;if (mounted.current) setBusy(false);}
  }
  const pct = (n:number) => `${Math.round(n*100)}% de confiança`;
  return <div className="triage-layout"><section className="card triage-main"><div className="eyebrow">NOVA DEMANDA / TRIAGEM</div><h2>Conte o que você precisa criar</h2><form onSubmit={e => {e.preventDefault();void submit();}}>
    <label htmlFor="triagem-texto">Descreva a demanda</label><textarea id="triagem-texto" value={texto} minLength={3} maxLength={4000} required disabled={busy} placeholder="Ex.: Preciso de um antes e depois de preenchimento labial para a Royal Face Castanhal" onChange={e => setTexto(e.target.value)} onKeyDown={e => {if ((e.ctrlKey || e.metaKey) && e.key==='Enter') {e.preventDefault();void submit();}}}/>
    <div className="form-footer"><span className="muted">Ctrl/Cmd + Enter para classificar · até 4.000 caracteres</span><button className="button primary" disabled={busy || texto.trim().length<3}>{busy?'Classificando…':'Classificar demanda'}</button></div>
  </form><div aria-live="polite" aria-atomic="true" aria-busy={busy}>
    <ol className="triage-steps" aria-label="Etapas da demanda">{['Texto recebido',busy?'Classificando… (Jev)':'Classificação (Jev)','Resultado','Criação da arte'].map((label,i) => <li key={i} className={(busy && i===1) || (result && i===2) ? 'current' : ''} aria-current={(busy && i===1) || (result && i===2) ? 'step' : undefined}><span className="step-number">{i+1}</span><strong>{label}</strong><small>{i===0?(busy||result?'Recebido':'Aguardando texto'):i===1?(busy?'Analisando empresa, procedimento e layout':result?'Concluída':error?'Não concluída':'Aguardando'):i===2?(result?'Classificação concluída':error?'Não foi possível classificar':'Aguardando classificação'):'Aguardando — será iniciada na próxima etapa do projeto'}</small>{busy && i===1 && <span className="triage-progress"/>}</li>)}</ol>
    {error && <div className="notice" role="alert"><p>{error}</p><button className="button outline" onClick={() => void submit()}>Tentar de novo</button></div>}
    {result && <div className="triage-results"><article><span className="eyebrow">Empresa</span><h2>{result.empresa.nome ?? 'Não identificada'}</h2><Badge active={result.empresa.cadastrada}>{result.empresa.cadastrada?'cadastrada':'não cadastrada'}</Badge>{result.empresa.unidade && !result.empresa.unidade.cadastrada && <> <Badge>unidade nova</Badge></>}{result.empresa.rede && <p>Franquia {result.empresa.rede.nome}{result.empresa.unidade ? ` · unidade ${result.empresa.unidade.nome}` : ''}</p>}<p className="muted">{pct(result.empresa.confianca)} · {metodoEmpresa[result.empresa.metodo]}</p></article><article><span className="eyebrow">Procedimento</span><h2>{PROCEDIMENTO_LABELS[result.procedimento]}</h2><p className="muted">{pct(result.procedimentoConfianca)}</p></article><article><span className="eyebrow">Tipo de arte</span><h2>{result.familiaArte==='antes_depois'?'Antes e depois':'Banco de imagem'}</h2><Badge>{templateLabel(result.tipoTemplate)}</Badge><p>{result.tipoTemplate}</p><p>{templateDescriptions[result.tipoTemplate]}</p><p className="muted">{pct(result.tipoTemplateConfianca)}</p></article></div>}
  </div></section><aside className="card triage-metrics"><div className="eyebrow">MÉTRICAS DO CLASSIFICADOR</div><h2>Resposta do Jev</h2>{result?<><p className="notice">Jev respondeu em {formatLatencia(result.latenciaMs)}</p><dl><dt>Custo</dt><dd>{formatCusto(result.custo)}</dd><dt>Tokens de entrada / saída</dt><dd>{result.tokens.entrada} / {result.tokens.saida}</dd><dt>Modelo</dt><dd>{result.modelo}</dd><dt>Provedor</dt><dd>{result.provider}</dd></dl><p className="muted">Latência real da chamada. A etapa visual permanece por pelo menos 2 segundos.</p></>:<p className="muted">{busy?'Aguardando a resposta do classificador…':'As métricas aparecem após a classificação.'}</p>}</aside>
  <section className="card triage-history"><h2>Últimas triagens da sessão</h2><p className="muted">Até 30 resultados, incluindo os recebidos de outras abas pelo stream ao vivo.</p>{state.triagens.length ? <ul>{[...state.triagens].filter(t => !busy || historyBeforeSubmit.current.has(t.id)).reverse().map(t => <li key={t.id}>{t.empresa.nome ?? 'Empresa não identificada'} · {PROCEDIMENTO_LABELS[t.procedimento]} · {t.tipoTemplate} · {formatLatencia(t.latenciaMs)} · {formatCusto(t.custo)}</li>)}</ul>:<p className="muted">Nenhuma triagem nesta sessão.</p>}</section></div>;
}
