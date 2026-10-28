import { PROCEDIMENTOS, PROCEDIMENTO_LABELS, TIPOS_TEMPLATE, SseEnvelopeSchema, OrchestratorConfigSchema, TriagemRequestSchema } from '../../shared/types';
import type { AcervoGrid, Demanda, EstadoDemanda, InboxMessage, Learning, ReviewResult, SkillDetail, SseEvent, SseEnvelope, SubmitDemandInput, Triagem } from '../../shared/types';
import type { EventHandlers } from '../transport/events';

const now = () => new Date().toISOString();
const rubric = [{id: 'R01', severidade: 'critico' as const, pergunta: 'A região do procedimento está livre de sobreposições?'}, {id: 'R02', severidade: 'normal' as const, pergunta: 'A hierarquia visual mantém headline e CTA legíveis?'}];
const review = (approved = true): ReviewResult => ({ aprovada: approved, score: approved ? 1 : .5, itens: rubric.map((r, i) => ({id: r.id, severidade: r.severidade, resposta: !approved && i === 0 ? 'nao' : 'sim', evidencia: !approved && i === 0 ? 'O selo ocupa a região tratada. Reposicionar na área segura.' : 'Área segura e contraste conferidos na composição.'})), feedback: {resumo: approved ? 'Composição aprovada pelo Diretor de Arte.' : 'Revisar a posição do selo.', correcoes: approved ? [] : [{itemId:'R01', instrucao:'Mover selo para o rodapé.'}]} });
export const seedLearning: Learning = {id: 'L01', createdAt: now(), procedimento:'botox', template:'banco_imagem_1', fonte:'awr_humano', demandaId:'DEM-0002', regra:'Manter o selo fora da região tratada e dentro da área segura.', motivoOriginal:'O selo cobriu o resultado.', status:'ativo', severidade:'critico'};
export function seedDemand(n: number, estado: EstadoDemanda = 'AGUARDANDO_APROVACAO_AWR'): Demanda {
  const procedimento = PROCEDIMENTOS[(n-1)%3]!;
  const id = `DEM-${String(n).padStart(4,'0')}`;
  const ts = now();
  const route: EstadoDemanda[] = ['CRIADA','CLASSIFICADA','EM_PRODUCAO','EM_REVISAO_DIRETOR','AGUARDANDO_APROVACAO_AWR','APROVADA_SALVA_NO_ACERVO'];
  const end = route.indexOf(estado);
  return { id, origem:n===3 ? 'acervo':'cliente', briefing:'Criar uma arte acolhedora sobre resultados naturais, com foco na avaliação individual.', clinicaNome:'Clínica Essência', headline:'Sua essência, em evidência.', cta:'Agende sua avaliação', estado, classificacao:{procedimento, tipoTemplate:TIPOS_TEMPLATE[(n-1)%4]!, agenteDesignado:n===3 ? 'monalisa':'van_gogh', skillFile:`brain/skills/${procedimento}.skill.md`, confianca:.97}, criadorAtual:n===3?'monalisa':'van_gogh', hop:n===2?5:0, tentativaDiretor:n===2?3:1, versaoAtual:estado==='EM_PRODUCAO'?0:1, ...(estado==='EM_PRODUCAO'?{}:{stagingPath:`_staging/${id}__v1.png`, ultimoReview:review(n!==2)}), escalada:n===2, ...(n===2?{motivoEscalada:'hop_limit' as const}:{}), historico:route.slice(1,Math.max(0,end)+1).map((para,i)=>({de:route[i]!,para,ts})), createdAt:ts, updatedAt:ts, ...(estado==='APROVADA_SALVA_NO_ACERVO'?{finalPath:`${procedimento}/${procedimento}__${TIPOS_TEMPLATE[(n-1)%4]}__${id}.png`}:{}) };
}

export function createMockApi() {
  let demandas = [seedDemand(1),seedDemand(2),seedDemand(3,'EM_PRODUCAO'),seedDemand(4,'APROVADA_SALVA_NO_ACERVO')];
  let messages: InboxMessage[] = demandas.flatMap(d => d.stagingPath ? [{ id:`msg-seed-${d.id}`, demandaId:d.id, from:d.criadorAtual!, to:'art_director' as const, hop:d.hop, action:'ARTE_ENTREGUE' as const, createdAt:d.createdAt, payload:{stagingPath:d.stagingPath,versao:d.versaoAtual,promptUsado:'Composição demonstrativa em modo local.',engine:'mock' as const} }] : []);
  let serial=0;
  const history: SseEnvelope[]=[];
  const listeners = new Set<(e:SseEnvelope)=>void>();
  let channel: BroadcastChannel | null = null;
  const timers = new Set<ReturnType<typeof setTimeout>>();
  const skills: SkillDetail[] = [...PROCEDIMENTOS,'template_composition' as const].map(id=>({id,label:id==='template_composition'?'Composição de templates':PROCEDIMENTO_LABELS[id],skillFile:`brain/skills/${id}.skill.md`,...(id==='template_composition'?{}:{procedimento:id}),versao:1,atualizadoEm:'2026-10-28',conteudo:'# Skill de demonstração\n\nComposição, área segura, hierarquia e revisão visual.',rubrica:id==='template_composition'?[]:rubric,aprendizados:id==='botox'?[seedLearning]:[]}));
  const later = (fn:()=>void, delay:number) => { const t = setTimeout(()=>{timers.delete(t);fn();},delay);timers.add(t); };
  function emit(event:SseEvent) {
    const envelope = SseEnvelopeSchema.parse({...event,id:`mock-${crypto.randomUUID()}`,ts:now()});
    history.push(envelope);listeners.forEach(fn=>fn(envelope));
    if (event.type.startsWith('triagem.')) channel?.postMessage(envelope);
  }
  function grid():AcervoGrid {
    const slots=PROCEDIMENTOS.flatMap(procedimento=>TIPOS_TEMPLATE.map(tipoTemplate=>{
      const related=demandas.filter(d=>d.classificacao?.procedimento===procedimento&&d.classificacao.tipoTemplate===tipoTemplate);
      const arquivos=related.flatMap(d=>d.finalPath?[d.finalPath]:[]);
      const open=related.find(d=>d.estado!=='APROVADA_SALVA_NO_ACERVO');
      return {procedimento,tipoTemplate,preenchido:arquivos.length>0,arquivos,...(open?{demandaAbertaId:open.id}:{})};
    }));
    const filled=slots.filter(s=>s.preenchido).length;
    return {slots,total:12,preenchidos:filled,vazios:12-filled,emProducao:slots.filter(s=>s.demandaAbertaId).length};
  }
  function save(d:Demanda) {demandas=demandas.map(x=>x.id===d.id?d:x);emit({type:'demand.updated',payload:d});}
  function transition(d:Demanda,estado:EstadoDemanda) { const ts=now();const next={...d,estado,updatedAt:ts,historico:[...d.historico,{de:d.estado,para:estado,ts}]};save(next);return next; }
  function send(message:InboxMessage) {messages=[...messages,message];emit({type:'message.sent',payload:message});}
  function finishReview(id:string) {
    const current=demandas.find(x=>x.id===id);
    if (!current || current.estado !== 'EM_REVISAO_DIRETOR') return;
    const result=review();
    emit({type:'review.result',payload:{demandaId:id,versao:current.versaoAtual,tentativaDiretor:1,review:result}});
    transition({...current,ultimoReview:result},'AGUARDANDO_APROVACAO_AWR');
    emit({type:'actor.status',payload:{actorId:'art_director',status:'idle',demandaId:null}});
  }
  function produce(id:string) {
    const initial=demandas.find(d=>d.id===id);
    if (!initial || initial.estado !== 'EM_PRODUCAO') return;
    emit({type:'actor.status',payload:{actorId:initial.criadorAtual!,status:'generating',demandaId:id}});
    later(()=>{
      let d=demandas.find(d=>d.id===id)!;
      if (d.estado !== 'EM_PRODUCAO') return;
      d={...d,versaoAtual:d.versaoAtual+1,stagingPath:`_staging/${id}__v${d.versaoAtual+1}.png`,tentativaDiretor:1};
      send({id:`msg-${++serial}`,demandaId:id,from:d.criadorAtual!,to:'art_director',hop:d.hop,action:'ARTE_ENTREGUE',createdAt:now(),payload:{stagingPath:d.stagingPath!,versao:d.versaoAtual,promptUsado:'Arte demonstrativa gerada pelo mock local.',engine:'mock'}});
      d=transition(d,'EM_REVISAO_DIRETOR');
      emit({type:'actor.status',payload:{actorId:d.criadorAtual!,status:'idle',demandaId:null}});
      emit({type:'actor.status',payload:{actorId:'art_director',status:'reviewing',demandaId:id}});
      later(()=>finishReview(id),1000);
    },1800);
  }
  function create(input:SubmitDemandInput,origin:'cliente'|'acervo'='cliente') {
    const idNumber=Math.max(...demandas.map(d=>Number(d.id.slice(4))))+1;
    const base=seedDemand(idNumber,'EM_PRODUCAO');
    const p=input.procedimento??(/l[aá]bi/i.test(input.briefing)?'preenchimento_labial':/fio/i.test(input.briefing)?'fios_sustentacao':'botox');
    const d:Demanda={...base,...input,origem:origin,hop:0,escalada:false,motivoEscalada:undefined,tentativaDiretor:0,criadorAtual:origin==='acervo'?'monalisa':'van_gogh',classificacao:{procedimento:p,tipoTemplate:input.tipoTemplate??'banco_imagem_1',agenteDesignado:origin==='acervo'?'monalisa':'van_gogh',skillFile:`brain/skills/${p}.skill.md`,confianca:.96}};
    demandas.push(d);
    emit({type:'demand.updated',payload:d});
    if (origin === 'acervo') send({id:`msg-${++serial}`,demandaId:d.id,from:'acervo_watcher',to:'art_director',hop:0,action:'PREENCHER_ACERVO',createdAt:now(),payload:{procedimento:p,tipoTemplate:d.classificacao!.tipoTemplate}});
    else send({id:`msg-${++serial}`,demandaId:d.id,from:'system',to:'art_director',hop:0,action:'DEMANDA_CLASSIFICADA',createdAt:now(),payload:{classificacao:d.classificacao!}});
    send({id:`msg-${++serial}`,demandaId:d.id,from:'art_director',to:d.criadorAtual!,hop:0,action:'PRODUZIR_ARTE',createdAt:now(),payload:{procedimento:p,tipoTemplate:d.classificacao!.tipoTemplate,skillFile:d.classificacao!.skillFile,briefing:d.briefing}});
    produce(d.id);emit({type:'acervo.updated',payload:grid()});return d;
  }
  const response=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json'}});
  const error=(message:string,status=409,code='INVALID_TRANSITION')=>response({error:{code,message}},status);
  const transport:typeof fetch=async (input,init)=>{
    const url=new URL(String(input),'http://mock.local');const path=url.pathname;const post=init?.method==='POST';
    const body=init?.body?JSON.parse(String(init.body)):{};
    if(path==='/api/triagem' && post) {
      const parsed = TriagemRequestSchema.safeParse(body);
      if (!parsed.success) return error('Descreva a demanda com 3 a 4.000 caracteres.',400,'VALIDATION_ERROR');
      const texto = parsed.data.texto;
      const id = `triagem-mock-${crypto.randomUUID()}`;
      const started = performance.now();
      emit({type:'triagem.started',payload:{triagemId:id,texto,provider:'mock',modelo:'jev-mock'}});
      await new Promise(resolve => setTimeout(resolve,150 + Math.random()*250));
      const procedimento = /l[aá]bi/i.test(texto) ? 'preenchimento_labial' : /fio/i.test(texto) ? 'fios_sustentacao' : 'botox';
      const familiaArte = /antes|depois/i.test(texto) ? 'antes_depois' : 'banco_imagem';
      const tipoTemplate = `${familiaArte}_${/varia[çc][aã]o 2|template 2/i.test(texto) ? 2 : 1}` as Triagem['tipoTemplate'];
      const royal = /royal\s*face/i.test(texto);
      const cidade = royal ? texto.match(/royal\s*face\s+(?:de\s+)?(\p{Lu}\p{L}+(?:\s+\p{Lu}\p{L}+)*)/u)?.[1] ?? null : null;
      const unidadeCadastrada = cidade ? ['castanhal','maringá'].includes(cidade.toLowerCase()) : false;
      const nome = royal ? `Royal Face${cidade ? ` ${cidade}` : ''}` : texto.match(/(?:para a|clínica|empresa)\s+(.+)$/i)?.[1] ?? null;
      const usd = 450 * .042 / 1_000_000;
      const triagem: Triagem = {id,texto,empresa:{id:royal?'royal_face':null,nome,cadastrada:royal,confianca:royal?1:nome?.length ? .5 : 0,rede:royal?{id:'royal_face',nome:'Royal Face'}:null,unidade:cidade?{id:null,nome:cidade,cadastrada:unidadeCadastrada}:null,metodo:royal?'cadastro':nome?'extracao':'nenhum'},procedimento,procedimentoConfianca:.97,tipoTemplate,familiaArte,tipoTemplateConfianca:.95,...(/acervo|abastec/i.test(texto)&&!royal?{agente:'monalisa' as const,agenteConfianca:1,agenteMotivo:'Pedido de abastecimento do acervo → Monalisa.'}:{agente:'van_gogh' as const,agenteConfianca:royal?1:.5,agenteMotivo:'Demanda de cliente → Van Gogh.'}),provider:'mock',modelo:'jev-mock',latenciaMs:Math.round(performance.now()-started),tokens:{entrada:400,saida:50},custo:{usd,brl:usd*5.5,cotacaoUsdBrl:5.5},criadoEm:now()};
      emit({type:'triagem.result',payload:triagem});
      return response({triagem});
    }
    if(path==='/api/config') return response({config:OrchestratorConfigSchema.parse({})});
    if(path==='/api/messages')return response({messages});
    if(path==='/api/demandas')return post?response({demanda:create(body)},201):response({demandas});
    if(path==='/api/acervo')return response(grid());
    if(path==='/api/acervo/fill') {
      grid().slots.filter(s=>!s.preenchido&&!s.demandaAbertaId).forEach(s=>create({briefing:`Compor arte de ${PROCEDIMENTO_LABELS[s.procedimento]} para o acervo.`,procedimento:s.procedimento,tipoTemplate:s.tipoTemplate},'acervo'));
      emit({type:'log',payload:{level:'info',message:'Solicitações de acervo enfileiradas no mock local.'}});return response({accepted:true},202);
    }
    if(path==='/api/brain/skills')return response({skills:skills.map(({conteudo,rubrica,aprendizados,...summary})=>summary)});
    if(path.startsWith('/api/brain/skills/')) {const skill=skills.find(s=>s.id===path.split('/').at(-1));return skill?response({skill}):error('Skill não encontrada.',404,'NOT_FOUND');}
    const match=path.match(/^\/api\/demandas\/(DEM-\d{4,})(?:\/(feedback|reset-hops))?$/);
    if(match) {
      const found=demandas.find(d=>d.id===match[1]);if(!found)return error('Demanda não encontrada.',404,'NOT_FOUND');
      let d:Demanda=found;
      if(!post)return response({demanda:d,messages:messages.filter(m=>m.demandaId===d.id)});
      if(d.estado!=='AGUARDANDO_APROVACAO_AWR')return error('Esta demanda já saiu da fila de aprovação.');
      if(match[2]==='reset-hops'){d={...d,hop:0,escalada:d.motivoEscalada==='director_attempts',motivoEscalada:d.motivoEscalada==='director_attempts'?'director_attempts':undefined,updatedAt:now()};save(d);return response({demanda:d});}
      if(body.decisao==='ajustar'&&d.motivoEscalada==='hop_limit')return error('Limite de hops atingido. Resete os hops antes de solicitar ajuste.',409,'HOP_LIMIT');
      send({id:`msg-${++serial}`,demandaId:d.id,from:'awr_human',to:'art_director',action:'FEEDBACK_HUMANO',hop:d.hop,createdAt:now(),payload:body});
      if(body.decisao==='aprovar') {
        const c=d.classificacao!;d=transition({...d,finalPath:`${c.procedimento}/${c.procedimento}__${c.tipoTemplate}__${d.id}.png`},'APROVADA_SALVA_NO_ACERVO');
      } else {
        const skill=skills.find(s=>s.skillFile===d.classificacao?.skillFile)!;
        const learning:Learning={...seedLearning,id:`L${String(skill.aprendizados.length+1).padStart(2,'0')}`,procedimento:d.classificacao!.procedimento,template:d.classificacao!.tipoTemplate,regra:body.motivo,motivoOriginal:body.motivo,demandaId:d.id,createdAt:now()};
        skill.aprendizados.push(learning);emit({type:'brain.learning',payload:{skillFile:skill.skillFile,learning}});
        d=transition(d,'REPROVADA_HUMANO');d=transition({...d,hop:d.hop+1,tentativaDiretor:0,escalada:false,motivoEscalada:undefined},'EM_PRODUCAO');
        send({id:`msg-${++serial}`,demandaId:d.id,from:'art_director',to:d.criadorAtual!,action:'AJUSTAR_ARTE',hop:d.hop,createdAt:now(),payload:{versaoAnterior:d.versaoAtual,feedbackDiretor:{resumo:body.motivo,correcoes:[]}}});produce(d.id);
      }
      emit({type:'acervo.updated',payload:grid()});return response({demanda:d});
    }
    return error('Rota não encontrada no mock.',404,'NOT_FOUND');
  };
  return {
    fetch:transport,
    connect(handlers:EventHandlers) {
      const replay = [...history];
      if (typeof window !== 'undefined' && typeof BroadcastChannel !== 'undefined' && !channel) {
        channel = new BroadcastChannel('awr-triagem-mock');
        channel.onmessage = ({data}) => {
          const event = SseEnvelopeSchema.safeParse(data);
          if (event.success && event.data.type.startsWith('triagem.')) {
            history.push(event.data);listeners.forEach(fn=>fn(event.data));
          }
        };
      }
      const listener=(e:SseEnvelope)=>handlers.event(e);listeners.add(listener);
      later(()=>{
        handlers.connection('connected');handlers.opened();replay.forEach(listener);
        emit({type:'log',payload:{level:'info',message:'Demonstração local conectada. Nenhuma chamada de IA é realizada.'}});
        // Fast Refresh can remount the UI: resume active work without reopening finished demands.
        demandas.forEach(d=>{if(d.estado==='EM_PRODUCAO')produce(d.id);else if(d.estado==='EM_REVISAO_DIRETOR')later(()=>finishReview(d.id),1000);});
      },50);
      const tick=setInterval(()=>{const d=demandas.find(d=>d.estado==='AGUARDANDO_APROVACAO_AWR');if(d)send({id:`msg-${++serial}`,demandaId:d.id,from:d.criadorAtual!,to:'art_director',hop:d.hop,action:'ARTE_ENTREGUE',createdAt:now(),payload:{stagingPath:d.stagingPath!,versao:d.versaoAtual,promptUsado:'Pulso de demonstração do fluxo Bot-to-Bot.',engine:'mock'}});},12000);
      return ()=>{listeners.delete(listener);clearInterval(tick);timers.forEach(clearTimeout);timers.clear();if (!listeners.size) {channel?.close();channel=null;}};
    },
  };
}
export function mockImage(path:string) {
  const isBotox=path.includes('botox')||path.includes('0002');
  const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1350" viewBox="0 0 1080 1350"><rect width="1080" height="1350" fill="#eff8e6"/><path d="M650 90C340 80 240 410 350 690S630 1150 950 1030V100H650Z" fill="#d7efb8"/><circle cx="780" cy="470" r="230" fill="#b6e77a"/><path d="M720 250Q570 330 640 530Q670 600 745 630L710 760Q860 830 930 700L880 570Q975 380 860 280Z" fill="#f6f7f9"/><path d="M740 470Q800 450 850 470M750 540Q800 565 840 535" fill="none" stroke="#737c91" stroke-width="8"/><text x="85" y="120" font-family="sans-serif" font-size="42" fill="#10172f">ESSÊNCIA • ESTÉTICA</text><text x="85" y="895" font-family="sans-serif" font-size="78" font-weight="700" fill="#10172f">Sua essência,</text><text x="85" y="990" font-family="sans-serif" font-size="78" font-weight="700" fill="#10172f">em evidência.</text><text x="85" y="1060" font-family="sans-serif" font-size="29" fill="#737c91">${isBotox?'Toxina botulínica':'Cuidado e beleza natural'}</text><rect x="85" y="1130" width="500" height="85" rx="20" fill="#10172f"/><text x="125" y="1184" font-family="sans-serif" font-size="30" fill="#ffffff">Agende sua avaliação →</text><text x="85" y="1290" font-family="sans-serif" font-size="20" fill="#737c91">IMAGEM ILUSTRATIVA • DEMONSTRAÇÃO LOCAL</text></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}
