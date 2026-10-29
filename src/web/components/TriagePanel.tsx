import { AgentAvatar } from './AgentAvatar';
import { useEffect, useRef, useState } from 'react';
import { PROCEDIMENTO_LABELS } from '../../shared/types';
import type { BriefingItem, BriefingTipo, Triagem } from '../../shared/types';
import { useAppState, useRuntime } from '../state/context';
import { mergeTriagens } from '../state/store';
import { formatCusto, formatLatencia, withMinDelay } from '../state/format';
import { templateDescriptions } from '../state/describe';
import { getSettings, useSettings } from '../state/settings';
import { CountPct, RevealCard, NameText, RevealProvider, useFill, useRevealDelay, useRevealDelays } from './Reveal';

const metodoEmpresa = { cadastro: 'nome encontrado no cadastro', ia: 'identificada pela classificação/triagem', extracao: 'nome extraído do texto (não cadastrado)', nenhum: 'empresa não citada' } as const;
import { AcervoCheck } from './AcervoCheck';
import { actorLabels, Badge, errorMessage, templateLabel } from './ui';

export function TriagePanel() {
  const {api,store} = useRuntime(); const state = useAppState(); const settings = useSettings();
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
      const {triagem} = await withMinDelay(api.triagem(texto), getSettings().triagemMinMs);
      store.update(s => ({...s,triagens:mergeTriagens(s.triagens,triagem)}));
      if (mounted.current) setResult(triagem);
    } catch (e) {if (mounted.current) setError(errorMessage(e));}
    finally {pending.current=false;if (mounted.current) setBusy(false);}
  }
  const pct = (n:number) => `${Math.round(n*100)}%`;
  return <div className="triage-layout"><section className="card triage-main"><div className="eyebrow">NOVA DEMANDA / TRIAGEM</div><h2>Conte o que você precisa criar</h2><form onSubmit={e => {e.preventDefault();void submit();}}>
    <label htmlFor="triagem-texto">Descreva a demanda</label><textarea id="triagem-texto" value={texto} minLength={3} maxLength={4000} required disabled={busy} placeholder="Ex.: Preciso de um antes e depois de preenchimento labial para a Royal Face Castanhal" onChange={e => setTexto(e.target.value)} onKeyDown={e => {if ((e.ctrlKey || e.metaKey) && e.key==='Enter') {e.preventDefault();void submit();}}}/>
    <div className="form-footer"><span className="muted">Ctrl/Cmd + Enter para classificar · até 4.000 caracteres</span><button className="button primary" disabled={busy || texto.trim().length<3}>{busy?'Classificando…':'Classificar demanda'}</button></div>
  </form><div aria-live="polite" aria-atomic="true" aria-busy={busy}>
    <ol className="triage-steps" aria-label="Etapas da demanda">{['Texto recebido',busy?'Classificando…':'Classificação/triagem','Resultado','Criação da arte'].map((label,i) => <li key={i} className={(busy && i===1) || (result && i===2) ? 'current' : ''} aria-current={(busy && i===1) || (result && i===2) ? 'step' : undefined}><span className="step-number">{i+1}</span><strong>{label}</strong><small>{i===0?(busy||result?'Recebido':'Aguardando texto'):i===1?(busy?'Analisando empresa, procedimento e layout':result?'Concluída':error?'Não concluída':'Aguardando'):i===2?(result?'Classificação concluída':error?'Não foi possível classificar':'Aguardando classificação'):'Aguardando — será iniciada na próxima etapa do projeto'}</small>{busy && i===1 && <span className="triage-progress"/>}</li>)}</ol>
    {error && <div className="notice" role="alert"><p>{error}</p><button className="button outline" onClick={() => void submit()}>Tentar de novo</button></div>}
    {result && <RevealProvider ms={settings.revealMs} on={settings.animacoes} nomes={settings.nomesEstilo}><TriageResults key={result.id} result={result}/>{result.agente==='monalisa' && <AcervoCheck key={`ac-${result.id}`} startDelay={settings.animacoes ? settings.revealMs : 0}/>}</RevealProvider>}
  </div></section><aside className="card triage-metrics"><div className="eyebrow">MÉTRICAS DA CLASSIFICAÇÃO/TRIAGEM</div><h2>Resposta da classificação/triagem</h2>{result?<><p className="notice">Classificação/triagem respondeu em {formatLatencia(result.latenciaMs)}</p><dl><dt>Custo</dt><dd>{formatCusto(result.custo)}</dd><dt>Tokens de entrada / saída</dt><dd>{result.tokens.entrada} / {result.tokens.saida}</dd><dt>Modelo</dt><dd>{result.modelo}</dd><dt>Provedor</dt><dd>{result.provider}</dd></dl><p className="muted">Latência real da chamada. A etapa visual permanece por pelo menos 2 segundos.</p></>:<p className="muted">{busy?'Aguardando a resposta da classificação/triagem…':'As métricas aparecem após a classificação.'}</p>}</aside>
  <section className="card triage-history"><h2>Últimas triagens da sessão</h2><p className="muted">Até 30 resultados, incluindo os recebidos de outras abas pelo stream ao vivo.</p>{state.triagens.length ? <ul>{[...state.triagens].filter(t => !busy || historyBeforeSubmit.current.has(t.id)).reverse().map(t => <li key={t.id}>{t.empresa.nome ?? 'Empresa não identificada'} · {PROCEDIMENTO_LABELS[t.procedimento]} · {t.tipoTemplate} · {formatLatencia(t.latenciaMs)} · {formatCusto(t.custo)}</li>)}</ul>:<p className="muted">Nenhuma triagem nesta sessão.</p>}</section></div>;
}

const pctTxt = (n:number) => `${Math.round(n*100)}%`;

function TriageResults({result}:{result:Triagem}) {
  const e = result.empresa; const delay = useRevealDelays();
  const empresaNome = e.rede?.nome ?? e.nome;
  const abastecimento = result.agente === 'monalisa'; // abastecimento do acervo não escolhe um tipo de arte
  return <div className="triage-results">
    <RevealCard index={0}><Field index={0} eyebrow="Empresa" title={empresaNome ?? 'Não identificada'}>
      {e.unidade && <p className="triage-unit">Unidade <NameText text={e.unidade.nome} delay={delay(0)+200}/>{!e.unidade.cadastrada && <> <Badge>unidade nova</Badge></>}</p>}
      <Badge active={e.cadastrada}>{e.cadastrada ? (e.rede ? 'franquia cadastrada' : 'cadastrada') : 'não cadastrada'}</Badge>
      <p className="muted">Certeza: <CountPct value={e.confianca} delay={delay(0)}/> · {metodoEmpresa[e.metodo]}</p>
      {result.probabilidades?.empresa && <ProbBars index={0} probs={result.probabilidades.empresa} escolha={e.rede?.id ?? 'nao_identificada'} label={k=>k==='nao_identificada'?'Não identificada':k.replace(/_/g,' ')}/>}
    </Field></RevealCard>
    <RevealCard index={1}><Field index={1} eyebrow="Procedimento" title={PROCEDIMENTO_LABELS[result.procedimento]}>
      <p className="muted">Certeza do modelo: <CountPct value={result.procedimentoConfianca} delay={delay(1)}/></p>
      <ProbBars index={1} probs={result.probabilidades?.procedimento} escolha={result.procedimento} label={k=>PROCEDIMENTO_LABELS[k as keyof typeof PROCEDIMENTO_LABELS] ?? k}/>
    </Field></RevealCard>
    {!abastecimento && <RevealCard index={2}><Field index={2} eyebrow="Tipo de arte" title={result.familiaArte==='antes_depois'?'Antes e depois':'Banco de imagem'}>
      <Badge>{templateLabel(result.tipoTemplate)}</Badge><p>{templateDescriptions[result.tipoTemplate]}</p>
      <p className="muted">Certeza do modelo: <CountPct value={result.tipoTemplateConfianca} delay={delay(2)}/></p>
      <ProbBars index={2} probs={result.probabilidades?.tipoTemplate} escolha={result.tipoTemplate} label={k=>templateLabel(k as Triagem['tipoTemplate'])}/>
    </Field></RevealCard>}
    <RevealCard index={abastecimento?2:3}><Field index={abastecimento?2:3} eyebrow="Agente de arte" title={actorLabels[result.agente] ?? result.agente} avatar={<AgentAvatar id={result.agente} size={64} active className="avatar-pop"/>}>
      <Badge active>{result.agente==='monalisa'?'abastecimento do acervo':'demanda de cliente'}</Badge><p>{result.agenteMotivo}</p>
      <p className="muted">{result.agenteRegra ? <>Regra aplicada: <CountPct value={1} delay={delay(abastecimento?2:3)}/></> : <>Certeza do modelo: <CountPct value={result.agenteConfianca} delay={delay(abastecimento?2:3)}/></>}</p>
      <ProbBars index={abastecimento?2:3} titulo={result.agenteRegra ? 'Leitura do classificador' : undefined} probs={result.probabilidades?.agente} escolha={result.agente} label={k=>actorLabels[k] ?? k} icon={k=><AgentAvatar id={k} size={20}/>}/>
    </Field></RevealCard>
    <BriefingCard index={abastecimento?3:4} itens={result.briefing ?? []} agente={actorLabels[result.agente] ?? result.agente}/>
  </div>;
}

const briefingLabels: Record<BriefingTipo, string> = { preco: 'Preço', promocao: 'Promoção', chamada_cta: 'Chamada (CTA)', headline: 'Título / mensagem', texto_literal: 'Texto', tom_estilo: 'Tom e estilo', publico: 'Público', prazo_data: 'Data / evento', data_entrega: 'Data de entrega', contato: 'Contato', outro_briefing: 'Observação' };

/** Informações do texto que seguem para o agente criador como briefing da arte final, no formato "Rótulo: valor". */
function BriefingCard({index,itens,agente}:{index:number;itens:BriefingItem[];agente:string}) {
  const delay = useRevealDelays()(index);
  return <RevealCard index={index}><div className="briefing-card">
    <span className="eyebrow">Briefing da arte</span>
    <h2><NameText text={itens.length ? `${itens.length} ${itens.length===1?'informação':'informações'} para o ${agente}` : 'Nenhum briefing no texto'} delay={delay}/></h2>
    {itens.length ? <ul>{itens.map((item,i)=><li key={i}>
      <p className="briefing-line"><span className="briefing-label">{briefingLabels[item.tipo]}:</span> <NameText text={item.valor ?? item.texto} delay={delay+120+i*80}/></p>
      <span className="muted briefing-meta"><CountPct value={item.confianca} delay={delay+i*80}/> · {item.metodo==='regra'?'padrão reconhecido':item.metodo==='ia'?'classificação/triagem':'heurística'}{item.valor ? <> · “{item.texto}”</> : null}</span>
    </li>)}</ul> : <p className="muted">Inclua no texto o que deve aparecer na arte (preço, chamada, tom, público, data de entrega…) e isso vira briefing para o agente criador.</p>}
  </div></RevealCard>;
}

function Field({index,eyebrow,title,avatar,children}:{index:number;eyebrow:string;title:string;avatar?:React.ReactNode;children:React.ReactNode}) {
  const head = <><span className="eyebrow">{eyebrow}</span><h2><NameText text={title} delay={useRevealDelay(index)}/></h2></>;
  return <>{avatar ? <div className="field-head">{avatar}<div>{head}</div></div> : head}{children}</>;
}

/** Probabilidade de cada opção segundo o classificador, em ordem decrescente, com barras preenchendo. */
function ProbBars({index,probs,escolha,label,icon,titulo='Probabilidade por opção'}:{index:number;probs?:Record<string,number>;escolha:string;label:(k:string)=>string;icon?:(k:string)=>React.ReactNode;titulo?:string}) {
  const delay = useRevealDelay(index);
  if (!probs || !Object.keys(probs).length) return null;
  return <div className="prob-bars"><span className="eyebrow">{titulo}</span><ul>{Object.entries(probs).sort((a,b)=>b[1]-a[1]).map(([k,v],i)=><ProbRow key={k} chosen={k===escolha} label={label(k)} icon={icon?.(k)} value={v} delay={delay+100+i*60}/>)}</ul></div>;
}
function ProbRow({chosen,label,icon,value,delay}:{chosen:boolean;label:string;icon?:React.ReactNode;value:number;delay:number}) {
  const width = useFill(value, delay);
  return <li className={chosen?'chosen':''} title={`${label}: ${pctTxt(value)}`}><span className="prob-label">{icon}{label}</span><span className="prob-track"><span className="prob-fill" style={{width}}/></span><span className="prob-value"><CountPct value={value} delay={delay}/></span></li>;
}
