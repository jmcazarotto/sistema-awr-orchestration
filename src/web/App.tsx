import { useEffect, useState } from 'react';
import { useAppState, useRuntime } from './state/context';
import { approvalQueue } from './state/store';
import { Badge, Icon } from './components/ui';
import { LivePage } from './pages/LivePage';
import { NewDemandPage } from './pages/NewDemandPage';
import { DemandDetailPage, DemandsPage } from './pages/DemandsPage';
import { ApprovalPage } from './pages/ApprovalPage';
import { AcervoPage } from './pages/AcervoPage';
import { BrainPage } from './pages/BrainPage';
import { LogsPage } from './pages/LogsPage';
import { EmpresasPage } from './pages/EmpresasPage';
import { TemplatesPage } from './pages/TemplatesPage';
import { TemplateEditorPage } from './pages/TemplateEditorPage';
import { SettingsPage } from './pages/SettingsPage';

const nav=[{path:'/',label:'Painel ao vivo',icon:'activity'},{path:'/nova',label:'Nova demanda',icon:'plus'},{path:'/demandas',label:'Demandas',icon:'list'},{path:'/aprovacoes',label:'Aprovação AWR',icon:'check'},{path:'/acervo',label:'Acervo',icon:'image'},{path:'/empresas',label:'Empresas',icon:'building'},{path:'/templates',label:'Templates',icon:'layout'},{path:'/cerebro',label:'Cérebro (Skills)',icon:'brain'},{path:'/logs',label:'Logs técnicos',icon:'code'}];
/** Fixo na extremidade inferior da lista do menu. */
const navSettings={path:'/configuracoes',label:'Configurações',icon:'settings'};
function readMode(){try{return localStorage.getItem('awr-visual-mode')==='2'?'2':'1';}catch{return '1';}}
export function App(){
  const state=useAppState();const runtime=useRuntime();const [hash,setHash]=useState(location.hash.slice(1)||'/');const [mode,setMode]=useState(readMode);const [menu,setMenu]=useState(false);
  useEffect(()=>runtime.start(),[runtime]);
  useEffect(()=>{const listener=()=>{setHash(location.hash.slice(1)||'/');setMenu(false);window.scrollTo({top:0});};window.addEventListener('hashchange',listener);return()=>window.removeEventListener('hashchange',listener);},[]);
  useEffect(()=>{document.body.dataset.visualMode=mode;try{localStorage.setItem('awr-visual-mode',mode);}catch{/* Storage can be disabled by the browser. */}},[mode]);
  const path=hash.split('?')[0]??'/';const active=[...nav,navSettings].find(n=>n.path==='/'?path==='/':path===n.path||path.startsWith(n.path+'/'));
  useEffect(()=>{document.title=`${active?.label??'Página não encontrada'} · AWR`;},[active?.label]);
  const demandId=path.startsWith('/demandas/')?decodeURIComponent(path.slice('/demandas/'.length)):null;
  const approvalId=path.startsWith('/aprovacoes/')?decodeURIComponent(path.slice('/aprovacoes/'.length)):undefined;
  const templateId=path.startsWith('/templates/')?decodeURIComponent(path.slice('/templates/'.length)):null;
  let page;
  if(path==='/')page=<LivePage/>;
  else if(path==='/nova')page=<NewDemandPage/>;
  else if(demandId)page=<DemandDetailPage id={demandId} key={demandId}/>;
  else if(path==='/demandas')page=<DemandsPage key={hash} initialFilter={new URLSearchParams(hash.split('?')[1]).get('estado')??''}/>;
  else if(path==='/aprovacoes'||approvalId)page=<ApprovalPage id={approvalId}/>;
  else if(path==='/acervo')page=<AcervoPage/>;
  else if(path==='/empresas')page=<EmpresasPage/>;
  else if(path==='/templates')page=<TemplatesPage query={new URLSearchParams(hash.split('?')[1])}/>;
  else if(templateId)page=<TemplateEditorPage id={templateId} key={templateId}/>;
  else if(path==='/cerebro')page=<BrainPage/>;
  else if(path==='/logs')page=<LogsPage/>;
  else if(path==='/configuracoes')page=<SettingsPage/>;
  else page=<section className="card"><h1>Página não encontrada</h1><a href="#/">Voltar para o painel</a></section>;
  return <><a className="skip-link" href="#main-content" onClick={e=>{e.preventDefault();document.getElementById('main-content')?.focus();}}>Pular para o conteúdo</a><aside className={`sidebar ${menu?'open':''}`}><a className="brand" href="#/" aria-label="AWR, início">AWR<span>.</span></a><div className="brand-sub">DESIGN AUTÔNOMO</div><div className="sidebar-caption">SEU WORKSPACE</div><nav aria-label="Navegação principal">{nav.map(n=><a key={n.path} href={`#${n.path}`} className={active?.path===n.path?'nav-item active':'nav-item'} aria-current={active?.path===n.path?'page':undefined}><Icon name={n.icon}/><span>{n.label}</span>{n.path==='/aprovacoes'&&approvalQueue(state).length>0&&<span className="nav-count">{approvalQueue(state).length}</span>}</a>)}<a href={`#${navSettings.path}`} className={`nav-item nav-settings${active?.path===navSettings.path?' active':''}`} aria-current={active?.path===navSettings.path?'page':undefined}><Icon name={navSettings.icon}/><span>{navSettings.label}</span></a></nav><div className="sidebar-bottom"><div className="workspace-avatar">A</div><div><strong>AWR Digital</strong><small>Studio de criação</small></div><span className="dot"/></div></aside><div className="workspace"><header className="topbar"><div className="topbar-breadcrumb"><button className="icon-button menu-toggle" aria-label="Abrir navegação" aria-expanded={menu} onClick={()=>setMenu(!menu)}><Icon name="list"/></button><span>Workspace</span><span className="muted">/</span><strong>{active?.label??'Página'}</strong></div><div className="topbar-actions">{runtime.mock&&<Badge>Demonstração local</Badge>}<span className={`connection ${state.connection==='connected'?'connected':''}`} role="status"><i className="dot"/>{state.connection==='connected'?'SSE conectado':state.connection==='connecting'?'Conectando SSE':'Reconectando SSE'}</span><label className="mode-picker"><span className="sr-only">Modo visual</span><select value={mode} onChange={e=>setMode(e.target.value)}><option value="1">Modo 1 · Lime</option><option value="2">Modo 2 · Azul</option></select></label><div className="user-avatar" aria-label="Equipe AWR">AW</div></div></header><main id="main-content" tabIndex={-1}>{state.error&&<div className="error-banner" role="alert"><span>{state.error}</span><button className="button outline" onClick={()=>void runtime.refresh()}>Tentar novamente</button></div>}{state.loading?<section className="card loading-state" role="status"><span className="loader"/><h2>Conectando ao seu time criativo…</h2><p className="muted">Carregando demandas, acervo e skills.</p></section>:page}<footer className="page-footer"><span>AWR Digital · Design Autônomo</span><span>Da ideia ao acervo, com intenção.</span></footer></main></div></>;
}
