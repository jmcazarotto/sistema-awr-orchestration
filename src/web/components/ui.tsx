import { createContext, useContext, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { Demanda, InboxMessage, ReviewResult } from '../../shared/types';
import { imageUrl } from '../transport/client';
import { mockImage } from '../dev/mockApi';
import { describeMessage, describeSaved, describeTriagem } from '../state/describe';
import { useAppState, useRuntime } from '../state/context';

export const stateLabels: Record<Demanda['estado'],string>={CRIADA:'Criada',CLASSIFICADA:'Classificada',EM_PRODUCAO:'Em produção',EM_REVISAO_DIRETOR:'Revisão do Diretor',EM_AJUSTE_IA:'Em ajuste IA',AGUARDANDO_APROVACAO_AWR:'Aguardando AWR',REPROVADA_HUMANO:'Ajuste solicitado',APROVADA_SALVA_NO_ACERVO:'Salva no acervo'};
export const actorLabels:Record<string,string>={art_director:'Diretor de Arte',van_gogh:'Van Gogh',monalisa:'Monalisa',system:'Sistema',awr_human:'Revisor AWR',acervo_watcher:'AcervoWatcher'};
export const templateLabel=(id:string)=>({antes_depois_1:'Antes e depois · 01',antes_depois_2:'Antes e depois · 02',banco_imagem_1:'Banco de imagem · 01',banco_imagem_2:'Banco de imagem · 02'}[id]??id);
export const dateTime=(value:string)=>new Intl.DateTimeFormat('pt-BR',{dateStyle:'short',timeStyle:'short'}).format(new Date(value));
export const time=(value:string)=>new Intl.DateTimeFormat('pt-BR',{hour:'2-digit',minute:'2-digit',second:'2-digit'}).format(new Date(value));
export function Icon({name='grid',size=20}:{name?:string;size?:number}) {
  const paths:Record<string,ReactNode>={grid:<><rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/></>,plus:<path d="M12 5v14M5 12h14"/>,list:<><path d="M9 5h12M9 12h12M9 19h12M3 5h1M3 12h1M3 19h1"/></>,check:<path d="m5 12 4 4L20 5"/>,brain:<><path d="M12 4c-4-5-10 2-6 5-5 2-3 9 1 9 0 4 5 4 5 0V4Zm0 0c4-5 10 2 6 5 5 2 3 9-1 9 0 4-5 4-5 0"/><path d="m6 9 3 2m9-2-3 2"/></>,activity:<path d="M2 12h5l3-8 4 16 3-8h5"/>,arrow:<path d="M4 12h16m-6-6 6 6-6 6"/>,code:<path d="m8 6-6 6 6 6m8-12 6 6-6 6m-3-15-2 18"/>,close:<path d="m6 6 12 12M6 18 18 6"/>,image:<><rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8" cy="8" r="2"/><path d="m3 18 6-6 4 4 4-7 4 8"/></>,clock:<><circle cx="12" cy="12" r="9"/><path d="M12 6v6l4 2"/></>,building:<><path d="M4 21V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v16M16 9h2a2 2 0 0 1 2 2v10M2 21h20M8 7h4M8 11h4M8 15h4"/></>,layout:<><rect x="3" y="3" width="18" height="18" rx="3"/><path d="M3 9h18M9 21V9"/></>,lock:<><rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></>,unlock:<><rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 7-2.6"/></>,copy:<><rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1"/></>,trash:<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>,undo:<path d="M9 14 4 9l5-5M4 9h10a6 6 0 0 1 0 12h-3"/>,redo:<path d="m15 14 5-5-5-5M20 9H10a6 6 0 0 0 0 12h3"/>,eye:<><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></>,up:<path d="m6 15 6-6 6 6"/>,down:<path d="m6 9 6 6 6-6"/>,save:<><path d="M5 3h11l4 4v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z"/><path d="M8 3v5h7V3M8 21v-7h8v7"/></>,upload:<path d="M12 16V4m-5 5 5-5 5 5M4 20h16"/>,guides:<path d="M3 8h18M3 16h18M8 3v18M16 3v18"/>,zoomin:<><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4M11 8v6M8 11h6"/></>,zoomout:<><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4M8 11h6"/></>,edit:<path d="M4 20h4L19 9l-4-4L4 16v4ZM13 7l4 4"/>,settings:<><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 0 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 0 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 0 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 0 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z"/></>};
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]??paths.grid}</svg>;
}
export function Badge({children,active=false}:{children:ReactNode;active?:boolean}){return <span className={`badge ${active?'active':''}`}>{children}</span>;}
export function StatusBadge({demand}:{demand:Demanda}){return <Badge active={demand.estado==='AGUARDANDO_APROVACAO_AWR'||demand.estado==='APROVADA_SALVA_NO_ACERVO'}>{stateLabels[demand.estado]}</Badge>;}
export function Empty({children}:{children:ReactNode}){return <div className="empty"><Icon name="image" size={28}/><p>{children}</p></div>;}
export function PageHeading({eyebrow,title,description,action}:{eyebrow:string;title:string;description:string;action?:ReactNode}){return <div className="page-heading"><div><div className="eyebrow">{eyebrow}</div><h1>{title}</h1><p>{description}</p></div>{action}</div>;}
export function ArtPreview({path,large=false}:{path?:string;large?:boolean}) {
  const {mock}=useRuntime();const [failed,setFailed]=useState(false);
  useEffect(()=>setFailed(false),[path]);
  if(!path||failed)return <Empty>{failed?'A imagem não está disponível.':'A arte aparecerá aqui após a geração.'}</Empty>;
  return <img className={`art-preview ${large?'large':''}`} src={mock?mockImage(path):imageUrl(path)} alt="Arte gerada para revisão" onError={()=>setFailed(true)}/>;
}
export function Rubric({review}:{review?:ReviewResult}) {
  if(!review)return <p className="muted">Aguardando a revisão visual do Diretor.</p>;
  return <div className="rubric"><div className="section-heading"><h2>Rubrica do Diretor</h2><Badge active={review.aprovada}>{Math.round(review.score*100)}% · {review.aprovada?'Aprovada':'Revisar'}</Badge></div><div className="score-track"><span style={{width:`${review.score*100}%`}}/></div>{review.itens.map(item=><div className={`rubric-item ${item.resposta==='nao'?'failed':''}`} key={item.id}><span className="rubric-answer">{item.resposta==='sim'?'✓':'×'}</span><div><strong>{item.id} <span className="muted">· {item.severidade==='critico'?'Crítico':'Normal'}</span></strong><p>{item.evidencia}</p></div><Badge active={item.resposta==='sim'}>{item.resposta==='sim'?'Sim':'Não'}</Badge></div>)}{review.feedback.resumo&&<p className="review-summary">{review.feedback.resumo}</p>}{review.feedback.correcoes.map(c=><p className="notice" key={c.itemId}>{c.itemId}: {c.instrucao}</p>)}</div>;
}
export function MessageFeed({messages,limit,includeActivity=false}:{messages:InboxMessage[];limit?:number;includeActivity?:boolean}) {
  const state=useAppState();const {mock}=useRuntime();const [open,setOpen]=useState<Record<string,boolean>>({});
  const entries = [
    ...messages.map(m => ({id:m.id,ts:m.createdAt,message:m,text:describeMessage(m,messages).text})),
    ...(includeActivity?state.triagens.map(t=>({id:t.id,ts:t.criadoEm,raw:t,text:describeTriagem(t)})):[]),
    ...(includeActivity?state.demandas.flatMap(d=>{const saved=describeSaved(d);return saved?[{id:`saved-${d.id}`,ts:d.updatedAt,text:saved.text,url:saved.url,raw:d}]:[];}):[]),
  ].sort((a,b)=>Date.parse(b.ts)-Date.parse(a.ts));
  const visible=limit?entries.slice(0,limit):entries;
  return <div className="message-feed">{visible.length?visible.map(entry=>{
    const m='message' in entry?entry.message:undefined;
    const described=m?describeMessage(m,messages):undefined;
    return <article key={entry.id} className="message human-message"><div className="human-message-heading"><time className="message-time">{time(entry.ts)}</time><p>{entry.text}</p>{m&&<a href={described!.demandaUrl}>{m.demandaId}</a>}<button className="icon-button raw-json-toggle" title={`Ver JSON bruto${m?` · hop ${m.hop}`:''}`} aria-label={`Ver JSON bruto${m?` · hop ${m.hop}`:''}`} aria-expanded={!!open[entry.id]} onClick={()=>setOpen(o=>({...o,[entry.id]:!o[entry.id]}))}><Icon name="code" size={16}/></button></div>
      {described?.art&&<div className="message-art">{m?.action==='ARTE_ENTREGUE'&&<a href={mock?mockImage(described.art.path):described.art.url} target="_blank" rel="noreferrer" aria-label={described.art.label}><ArtPreview path={described.art.path}/></a>}<a href={mock?mockImage(described.art.path):described.art.url} target="_blank" rel="noreferrer">{described.art.label}</a>{described.art.remade&&<Badge active>Arte refeita</Badge>}</div>}
      {'url' in entry&&<a href={entry.url} target="_blank" rel="noreferrer">Abrir arquivo final</a>}
      {open[entry.id]&&<pre>{JSON.stringify(m??('raw' in entry?entry.raw:entry),null,2)}</pre>}</article>;
  }):<Empty>As mensagens entre os agentes aparecerão aqui.</Empty>}</div>;
}

type Toast={id:number;message:string;error:boolean};
export const ToastContext=createContext<(message:string,error?:boolean)=>void>(()=>{});
export function ToastProvider({children}:{children:ReactNode}) {
  const [toasts,setToasts]=useState<Toast[]>([]);const counter=useRef(0);const timers=useRef<ReturnType<typeof setTimeout>[]>([]);
  useEffect(()=>()=>timers.current.forEach(clearTimeout),[]);
  function notify(message:string,error=false){const id=++counter.current;setToasts(s=>[...s,{id,message,error}]);timers.current.push(setTimeout(()=>setToasts(s=>s.filter(t=>t.id!==id)),9000));}
  return <ToastContext.Provider value={notify}>{children}<div className="toasts" aria-live="polite" aria-atomic="false">{toasts.map(t=><div role={t.error?'alert':'status'} className={`toast ${t.error?'error':''}`} key={t.id}><Icon name={t.error?'activity':'check'}/><span>{t.message}</span><button className="icon-button" aria-label="Fechar aviso" onClick={()=>setToasts(s=>s.filter(x=>x.id!==t.id))}><Icon name="close"/></button></div>)}</div></ToastContext.Provider>;
}
export const useToast=()=>useContext(ToastContext);
export function errorMessage(error:unknown){return error instanceof Error?error.message:'Não foi possível concluir a operação.';}
