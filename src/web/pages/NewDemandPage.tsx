import { useState } from 'react';
import type { FormEvent } from 'react';
import { CreateDemandaRequestSchema, PROCEDIMENTOS, PROCEDIMENTO_LABELS, TIPOS_TEMPLATE } from '../../shared/types';
import type { Demanda } from '../../shared/types';
import { useRuntime } from '../state/context';
import { upsertDemand } from '../state/store';
import { Badge, Icon, PageHeading, errorMessage, templateLabel, useToast } from '../components/ui';
import { TriagePanel } from '../components/TriagePanel';
import { SettingsPanel } from '../components/SettingsPanel';

const TABS = [['auto','Automático'],['manual','Manual'],['config','Configurações']] as const;
type Aba = typeof TABS[number][0];
const abaDaUrl = (): Aba => { const a = new URLSearchParams(location.hash.split('?')[1] ?? '').get('aba'); return TABS.some(([id]) => id === a) ? a as Aba : 'auto'; };

/** Nova demanda: Automático (texto livre + classificação/triagem), Manual (formulário) e Configurações. */
export function NewDemandPage(){
  const [tab,setTab]=useState<Aba>(abaDaUrl);
  const select=(next:Aba)=>{setTab(next);history.replaceState(null,'',`#/nova${next==='auto'?'':`?aba=${next}`}`);};
  return <><PageHeading eyebrow="WORKSPACE / NOVA DEMANDA" title="Vamos criar algo novo?" description="Descreva a demanda em texto livre e deixe a classificação/triagem organizar, ou preencha manualmente."/>
    <div className="live-tabs" role="tablist" aria-label="Nova demanda">{TABS.map(([id,label])=><button key={id} id={`tab-${id}`} role="tab" aria-selected={tab===id} aria-controls={`panel-${id}`} tabIndex={tab===id?0:-1} onClick={()=>select(id)} onKeyDown={e=>{if(e.key==='ArrowLeft'||e.key==='ArrowRight'){e.preventDefault();const i=TABS.findIndex(([t])=>t===tab);const next=TABS[(i+(e.key==='ArrowRight'?1:TABS.length-1))%TABS.length]![0];select(next);document.getElementById(`tab-${next}`)?.focus();}}}>{label}</button>)}</div>
    <div id="panel-auto" role="tabpanel" aria-labelledby="tab-auto" hidden={tab!=='auto'}><TriagePanel/></div>
    <div id="panel-manual" role="tabpanel" aria-labelledby="tab-manual" hidden={tab!=='manual'}><ManualDemandForm/></div>
    <div id="panel-config" role="tabpanel" aria-labelledby="tab-config" hidden={tab!=='config'}><SettingsPanel/></div></>;
}

/** Formulário manual: o usuário escolhe procedimento/template e preenche o briefing (cliente → Van Gogh). */
function ManualDemandForm(){
  const runtime=useRuntime();const toast=useToast();const [busy,setBusy]=useState(false);const [created,setCreated]=useState<Demanda|null>(null);
  async function submit(e:FormEvent<HTMLFormElement>){
    e.preventDefault();const form=new FormData(e.currentTarget);const raw=Object.fromEntries([...form.entries()].filter(([,v])=>String(v).trim()).map(([k,v])=>[k,String(v).trim()]));
    const input=CreateDemandaRequestSchema.safeParse(raw);if(!input.success){toast('Preencha o briefing para enviar sua demanda.',true);return;}
    setBusy(true);try{const {demanda}=await runtime.api.create(input.data);runtime.store.update(s=>({...s,demandas:upsertDemand(s.demandas,demanda)}));setCreated(demanda);toast('Demanda classificada e enviada ao Diretor de Arte.');}catch(error){toast(errorMessage(error),true);}finally{setBusy(false);}
  }
  return <><div className="form-layout"><section className="card"><div className="section-heading"><h2>Briefing da arte</h2><Badge>Cliente → Van Gogh</Badge></div><form onSubmit={submit} className="form-stack"><div className="form-row"><label>Procedimento<select name="procedimento" defaultValue=""><option value="">Deixar a IA classificar</option>{PROCEDIMENTOS.map(p=><option value={p} key={p}>{PROCEDIMENTO_LABELS[p]}</option>)}</select></label><label>Template<select name="tipoTemplate" defaultValue=""><option value="">Deixar a IA escolher</option>{TIPOS_TEMPLATE.map(t=><option value={t} key={t}>{templateLabel(t)}</option>)}</select></label></div><label>O que você quer comunicar? <span className="muted">(obrigatório)</span><textarea name="briefing" required rows={6} placeholder="Ex.: Uma arte sobre botox com resultado natural. Quero transmitir confiança e convidar para uma avaliação."/></label><label>Nome da clínica<input name="clinicaNome" placeholder="Ex.: Clínica Essência"/></label><div className="form-row"><label>Headline<input name="headline" placeholder="A mensagem principal da arte"/></label><label>Chamada para ação (CTA)<input name="cta" placeholder="Ex.: Agende sua avaliação"/></label></div><div className="form-footer"><span className="muted">Os campos opcionais complementam a criação.</span><button className="button primary" disabled={busy}>{busy?'Classificando…':'Criar demanda'}<Icon name="arrow"/></button></div></form></section><aside className="card guide-card"><div className="stat-icon"><Icon name="brain"/></div><h2>Da sua ideia à arte</h2><ol className="guide-list"><li><strong>Triagem inteligente</strong><p>A classificação/triagem identifica o procedimento e o template ideal.</p></li><li><strong>Criação e revisão</strong><p>Van Gogh produz. O Diretor verifica a rubrica visual.</p></li><li><strong>Seu olhar final</strong><p>A arte chega à fila AWR para aprovação ou ajustes.</p></li></ol></aside></div>{created&&<section className="card result-card" role="status"><Badge active>Classificação concluída</Badge><h2>{created.id} · {created.classificacao?PROCEDIMENTO_LABELS[created.classificacao.procedimento]:'Em classificação'}</h2><p>{created.classificacao&&`${templateLabel(created.classificacao.tipoTemplate)} · Confiança ${Math.round(created.classificacao.confianca*100)}%`}</p><a className="button primary" href={`#/demandas/${created.id}`}>Acompanhar demanda <Icon name="arrow"/></a></section>}</>;
}
