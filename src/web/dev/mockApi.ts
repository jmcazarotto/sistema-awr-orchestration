import { adicionarLogo, atualizarLogos } from '../../shared/logos';
import { PROCEDIMENTOS, PROCEDIMENTO_LABELS, TIPOS_TEMPLATE, SseEnvelopeSchema, OrchestratorConfigSchema, TriagemRequestSchema, EmpresaInputSchema, ReferenciaCategoriaSchema, SaveTemplateRequestSchema, TemplatesQuerySchema } from '../../shared/types';
import type { ActorId, AcervoGrid, Demanda, EstadoDemanda, InboxMessage, Learning, ReviewResult, SkillDetail, SseEvent, SseEnvelope, SubmitDemandInput, Triagem } from '../../shared/types';
import type { EventHandlers } from '../transport/events';
import type { Empresa, TemplateArte } from '../../shared/types';
import { seedEmpresas, seedTemplates } from './mockTemplates';
import { IA_SITUACOES, IA_SITUACAO_INFO, IA_EFFORT_API, IaModelosSchema, iaModelo, iaModeloLabel } from '../../shared/types';
import type { MarcaSkill } from '../../shared/types';
import type { EtapaProducao, IaModelos, IaUsoResponse } from '../../shared/types';

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
  let pausados: ActorId[] = [];
  let iaModelos = Object.fromEntries(IA_SITUACOES.map(s=>[s,{modelo:IA_SITUACAO_INFO[s].modelos[0]!,effort:iaModelo(IA_SITUACAO_INFO[s].modelos[0]!)?.efforts.includes('medio')?'medio':null}])) as IaModelos;
  iaModelos.imagem_van_gogh={modelo:'gpt-image-2.5-flare',effort:'medio'};iaModelos.imagem_monalisa={modelo:'gpt-image-2.5-flare',effort:'medio'};
  // Uso de imagem por modelo (mock): ~US$ 0,04 por imagem de qualidade média.
  const usoImg: Record<string,{chamadas:number;tokensEntrada:number;tokensSaida:number;usd:number}> = {};
  const CUSTO_IMAGEM: Record<string,number> = {low:.011,medium:.04,high:.17,xhigh:.25,max:.35};
  const usdImg = () => Object.values(usoImg).reduce((a,u)=>a+u.usd,0);
  let usoJev = {chamadas:0,tokensEntrada:0,usd:0,desde:null as string|null};
  const iaUso = (): IaUsoResponse => ({desde:usoJev.desde,cotacaoUsdBrl:5.5,itens:[{provedor:'jev' as const,modelo:'jev-latest',chamadas:usoJev.chamadas,tokensEntrada:usoJev.tokensEntrada,tokensSaida:0,usd:usoJev.usd,brl:usoJev.usd*5.5,precificado:true},{provedor:'openai_decisions' as const,modelo:'gpt-6-luna-decisions',chamadas:0,tokensEntrada:0,tokensSaida:0,usd:0,brl:0,precificado:true}].map((i):IaUsoResponse['itens'][number]=>({...i,tipo:'texto'})).concat(['gpt-image-2','gpt-image-2.5-flare','gpt-image-2.5-sunburst','simulado'].map(modelo=>{const u=usoImg[modelo]??{chamadas:0,tokensEntrada:0,tokensSaida:0,usd:0};return {provedor:modelo==='simulado'?'local' as const:'openai' as const,modelo,tipo:'imagem' as const,...u,brl:u.usd*5.5,precificado:true};})),total:{chamadas:usoJev.chamadas+Object.values(usoImg).reduce((a,u)=>a+u.chamadas,0),usd:usoJev.usd+usdImg(),brl:(usoJev.usd+usdImg())*5.5}});
  let empresas: Empresa[] = seedEmpresas();
  let templates: TemplateArte[] = seedTemplates();
  const history: SseEnvelope[]=[];
  const listeners = new Set<(e:SseEnvelope)=>void>();
  let channel: BroadcastChannel | null = null;
  const timers = new Set<ReturnType<typeof setTimeout>>();
  const R='_marcas/royal_face/referencias/';
  const marcaRoyal:MarcaSkill={id:'royal_face',label:'Royal Face',versao:1,atualizadoEm:'2026-10-29',empresas:['royal_face'],skillFile:'brain/skills/marcas/royal_face/royal_face.skill.md',conteudo:'# Royal Face\n\nSkill de marca de demonstração: tom acolhedor, luxo discreto, sem promessas de resultado.',visualSystem:'# Sistema visual\n\nPaleta dourada sobre neutros quentes; tipografia serifada nos títulos.',rubrica:[{id:'M01',pergunta:'A arte segue a paleta e a tipografia da Royal Face?',severidade:'critico'},{id:'M02',pergunta:'A logo oficial está legível e sem distorção?',severidade:'normal'}],referencias:[{id:'botox_light_editorial',arquivo:R+'botox/botox_light_editorial.jpg',procedimento:'botox',composicao:'informativa_clean',oferta:false,usarCopy:true,notas:'Fundo claro editorial.'},{id:'labial_close_central',arquivo:R+'preenchimento_labial/labial_close_central.jpg',procedimento:'preenchimento_labial',composicao:'close_procedimento',oferta:false,usarCopy:false,notas:'Usar só o layout.'},{id:'fios_mosaico_resultados',arquivo:R+'fios_sustentacao/fios_mosaico_resultados.jpg',procedimento:'fios_sustentacao',composicao:'antes_depois_editorial',oferta:true,usarCopy:true,notas:''}]};
  const skills: SkillDetail[] = [...PROCEDIMENTOS,'template_composition' as const,'arte_final_ia' as const].map(id=>({id,label:id==='template_composition'?'Composição de templates':id==='arte_final_ia'?'Arte final por IA':PROCEDIMENTO_LABELS[id],skillFile:`brain/skills/${id==='template_composition'||id==='arte_final_ia'?'tecnicas/':''}${id}.skill.md`,...(id==='template_composition'||id==='arte_final_ia'?{}:{procedimento:id}),versao:1,atualizadoEm:'2026-10-28',conteudo:'# Skill de demonstração\n\nComposição, área segura, hierarquia e revisão visual.',rubrica:id==='template_composition'||id==='arte_final_ia'?[]:rubric,aprendizados:id==='botox'?[seedLearning]:[]}));
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
  function produce(id:string,delay=1800) {
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
    },delay);
  }
  function stage(id:string,etapa:EtapaProducao,extra:Partial<NonNullable<Demanda['producao']>>={},detalhe?:string) {
    const d=demandas.find(x=>x.id===id);if(!d?.producao)return;
    save({...d,updatedAt:now(),producao:{...d.producao,...extra,etapa,etapas:[...d.producao.etapas,{etapa,em:now(),...(detalhe?{detalhe}:{})}]}});
  }
  function produzir(id:string) {
    const d=demandas.find(x=>x.id===id)!;const modelo=iaModelos.imagem_van_gogh;const qualidade=modelo.effort?IA_EFFORT_API[modelo.effort]:null;
    const ts=now();
    save({...d,producao:{etapa:'na_fila',modelo:modelo.modelo,qualidade,versao:d.versaoAtual+1,solicitadoEm:ts,etapas:[{etapa:'na_fila',em:ts}]}});
    transition(demandas.find(x=>x.id===id)!,'EM_PRODUCAO');
    send({id:`msg-${++serial}`,demandaId:id,from:'art_director',to:'van_gogh',hop:d.hop,action:'PRODUZIR_ARTE',createdAt:ts,payload:{procedimento:d.classificacao!.procedimento,tipoTemplate:d.classificacao!.tipoTemplate,skillFile:d.classificacao!.skillFile,briefing:d.briefing}});
    later(()=>stage(id,'planejando',{},'Montando o prompt a partir do briefing e da skill.'),800);
    later(()=>stage(id,'gerando',{},`Gerando com ${iaModeloLabel(modelo.modelo)}.`),1600);
    later(()=>stage(id,'compondo',{},'Aplicando template, headline e CTA.'),4100);
    later(()=>{
      const unit=modelo.modelo==='simulado'?0:CUSTO_IMAGEM[qualidade??'medium']??.04;
      const prev=usoImg[modelo.modelo]??{chamadas:0,tokensEntrada:0,tokensSaida:0,usd:0};
      const tokensEntrada=modelo.modelo==='simulado'?0:900,tokensSaida=Math.round(unit/30*1_000_000);
      usoImg[modelo.modelo]={chamadas:prev.chamadas+1,tokensEntrada:prev.tokensEntrada+tokensEntrada,tokensSaida:prev.tokensSaida+tokensSaida,usd:prev.usd+unit};
      stage(id,'entregue',modelo.modelo==='simulado'?{}:{custo:{usd:unit,brl:unit*5.5,tokensEntrada,tokensSaida}},'Arte enviada ao Diretor de Arte.');
      produce(id,200);
    },5100);
  }
  function create(input:SubmitDemandInput,origin:'cliente'|'acervo'='cliente') {
    const idNumber=Math.max(...demandas.map(d=>Number(d.id.slice(4))))+1;
    const base=seedDemand(idNumber,origin==='cliente'?'CLASSIFICADA':'EM_PRODUCAO');
    const p=input.procedimento??(/l[aá]bi/i.test(input.briefing)?'preenchimento_labial':/fio/i.test(input.briefing)?'fios_sustentacao':'botox');
    const d:Demanda={...base,...input,anexos:[],origem:origin,hop:0,escalada:false,motivoEscalada:undefined,tentativaDiretor:0,criadorAtual:origin==='acervo'?'monalisa':'van_gogh',classificacao:{procedimento:p,tipoTemplate:input.tipoTemplate??'banco_imagem_1',agenteDesignado:origin==='acervo'?'monalisa':'van_gogh',skillFile:`brain/skills/${p}.skill.md`,confianca:.96}};
    if(origin==='cliente'){const m=iaModelos.imagem_van_gogh;d.producao={etapa:'aguardando',modelo:m.modelo,qualidade:m.effort?IA_EFFORT_API[m.effort]:null,versao:0,etapas:[{etapa:'aguardando',em:now()}]};d.versaoAtual=0;delete d.stagingPath;}
    demandas.push(d);
    emit({type:'demand.updated',payload:d});
    if (origin === 'acervo') send({id:`msg-${++serial}`,demandaId:d.id,from:'acervo_watcher',to:'art_director',hop:0,action:'PREENCHER_ACERVO',createdAt:now(),payload:{procedimento:p,tipoTemplate:d.classificacao!.tipoTemplate}});
    else send({id:`msg-${++serial}`,demandaId:d.id,from:'system',to:'art_director',hop:0,action:'DEMANDA_CLASSIFICADA',createdAt:now(),payload:{classificacao:d.classificacao!}});
    if(origin==='acervo'){send({id:`msg-${++serial}`,demandaId:d.id,from:'art_director',to:d.criadorAtual!,hop:0,action:'PRODUZIR_ARTE',createdAt:now(),payload:{procedimento:p,tipoTemplate:d.classificacao!.tipoTemplate,skillFile:d.classificacao!.skillFile,briefing:d.briefing}});produce(d.id);}
    emit({type:'acervo.updated',payload:grid()});return d;
  }
  const response=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json'}});
  const error=(message:string,status=409,code='INVALID_TRANSITION')=>response({error:{code,message}},status);
  const transport:typeof fetch=async (input,init)=>{
    const url=new URL(String(input),'http://mock.local');const path=url.pathname;const post=init?.method==='POST';const put=init?.method==='PUT';
    const form=init?.body instanceof FormData?init.body:null;
    const body=init?.body&&!form?JSON.parse(String(init.body)):{};
    if(path==='/api/demandas/anexos' && post) return error('Envio de imagens disponível com a API local conectada. Saia do modo de demonstração.',400,'VALIDATION_ERROR');
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
      const triagem: Triagem = {id,texto,empresa:{id:royal?'royal_face':null,nome,cadastrada:royal,confianca:royal?1:nome?.length ? .5 : 0,rede:royal?{id:'royal_face',nome:'Royal Face'}:null,unidade:cidade?{id:null,nome:cidade,cadastrada:unidadeCadastrada}:null,metodo:royal?'cadastro':nome?'extracao':'nenhum'},procedimento,procedimentoConfianca:.97,tipoTemplate,familiaArte,tipoTemplateConfianca:.95,briefing:[],anexos:parsed.data.anexos??[],alertas:[],etapas:[{id:'decisoes',modelo:'simulado',status:'simulada',campos:['procedimento','tipo_arte','agente'],latenciaMs:0,tokens:{entrada:0,saida:0},usd:0}],...(/acervo|abastec/i.test(texto)&&!royal?{agente:'monalisa' as const,agenteConfianca:1,agenteMotivo:'Pedido de abastecimento do acervo → Monalisa.',agenteRegra:true}:{agente:'van_gogh' as const,agenteConfianca:royal?1:.5,agenteMotivo:'Demanda de cliente → Van Gogh.',agenteRegra:royal}),provider:'mock',modelo:'jev-mock',latenciaMs:Math.round(performance.now()-started),tokens:{entrada:400,saida:50},custo:{usd,brl:usd*5.5,cotacaoUsdBrl:5.5},criadoEm:now()};
      usoJev={chamadas:usoJev.chamadas+1,tokensEntrada:usoJev.tokensEntrada+400,usd:usoJev.usd+usd,desde:usoJev.desde??now()};
      emit({type:'triagem.result',payload:triagem});
      return response({triagem});
    }
    if(path==='/api/empresas') {
      if(!post)return response({empresas});
      const parsed=EmpresaInputSchema.safeParse(body);if(!parsed.success)return error('Dados da empresa inválidos.',400,'VALIDATION_ERROR');
      const previous=empresas.find(e=>e.id===parsed.data.id);const empresa:Empresa=atualizarLogos({...previous,...parsed.data,logo:parsed.data.logo===undefined?previous?.logo??null:parsed.data.logo,logos:parsed.data.logos??previous?.logos??{claro:null,escuro:null}});
      empresas=previous?empresas.map(e=>e.id===empresa.id?empresa:e):[...empresas,empresa];
      if(!previous)templates=[...templates,...seedTemplates(empresa.id).filter(t=>empresa.procedimentos.includes(t.procedimento))];
      return response({empresa},previous?200:201);
    }
    const refsMatch=path.match(/^\/api\/empresas\/([a-z0-9_]+)\/referencias(?:\/([a-z0-9_]+))?$/);
    if(refsMatch) {
      const found=empresas.find(e=>e.id===refsMatch[1]); if(!found)return error('Empresa não encontrada.',404,'NOT_FOUND');
      const referencias=found.referencias ?? (found.id===marcaRoyal.id ? marcaRoyal.referencias : []);
      if(!post && !put)return response({referencias});
      const categoria=ReferenciaCategoriaSchema.safeParse(post?{procedimento:form?.get('procedimento'),composicao:form?.get('composicao')}:body);
      if(!categoria.success)return error('Categoria inválida.',400,'VALIDATION_ERROR');
      let next;
      if(post) {
        const file=form?.get('arquivo'); if(!(file instanceof File) || !['image/png','image/jpeg','image/webp'].includes(file.type) || !file.size || file.size>10*1024*1024)return error('Arquivo inválido.',400,'VALIDATION_ERROR');
        const dataUrl=await new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result));reader.onerror=()=>reject(reader.error);reader.readAsDataURL(file);});
        next=[...referencias,{id:`ref_${crypto.randomUUID().replace(/-/g,'')}`,arquivo:dataUrl,...categoria.data,oferta:false,usarCopy:false,notas:''}];
      } else {
        if(!referencias.some(ref=>ref.id===refsMatch[2]))return error('Referência não encontrada.',404,'NOT_FOUND');
        next=referencias.map(ref=>ref.id===refsMatch[2]?{...ref,...categoria.data}:ref);
      }
      empresas=empresas.map(e=>e.id===found.id?{...e,referencias:next}:e); if(found.id===marcaRoyal.id)marcaRoyal.referencias=next;
      return response({referencias:next});
    }
    const empresaMatch=path.match(/^\/api\/empresas\/([a-z0-9_]+)(\/logo)?$/);
    if(empresaMatch) {
      const found=empresas.find(e=>e.id===empresaMatch[1]);if(!found)return error('Empresa não encontrada.',404,'NOT_FOUND');
      if(!empresaMatch[2])return response({empresa:found});
      const file=form?.get('arquivo');if(!(file instanceof Blob))return error('Envie a logo no campo "arquivo".',400,'VALIDATION_ERROR');
      if(file.size>2*1024*1024)return error('A logo deve ter no máximo 2 MB.',400,'VALIDATION_ERROR');
      const dataUrl=await new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result));reader.onerror=()=>reject(reader.error);reader.readAsDataURL(file);});
      const variante=form?.get('variante');const empresa=variante==='claro'||variante==='escuro'?adicionarLogo(found, dataUrl, variante, form?.get('principal') !== 'false'):{...found,logo:dataUrl};empresas=empresas.map(e=>e.id===empresa.id?empresa:e);return response({empresa});
    }
    if(path==='/api/templates' && !post && !put) {
      const q=TemplatesQuerySchema.safeParse(Object.fromEntries(url.searchParams));if(!q.success)return error('Filtro inválido.',400,'VALIDATION_ERROR');
      return response({templates:templates.filter(t=>(!q.data.empresaId||t.empresaId===q.data.empresaId)&&(!q.data.procedimento||t.procedimento===q.data.procedimento)&&(!q.data.familia||t.familia===q.data.familia))});
    }
    const templateMatch=path.match(/^\/api\/templates\/([a-z0-9_]+)$/);
    if(templateMatch) {
      const found=templates.find(t=>t.id===templateMatch[1]);if(!found)return error('Template não encontrado.',404,'NOT_FOUND');
      if(!put)return response({template:found});
      const parsed=SaveTemplateRequestSchema.safeParse(body);if(!parsed.success)return error('Template inválido.',400,'VALIDATION_ERROR');
      const template={...found,...parsed.data,atualizadoEm:now()};templates=templates.map(t=>t.id===template.id?template:t);return response({template});
    }
    if(path==='/api/ia/modelos'){if(!put)return response({modelos:iaModelos});const parsed=IaModelosSchema.safeParse(body);if(!parsed.success)return error('Modelos inválidos.',400,'VALIDATION_ERROR');iaModelos=parsed.data;return response({modelos:iaModelos});}
    if(path==='/api/ia/uso')return response(iaUso());
    if(path==='/api/ia/uso/zerar'&&post){usoJev={chamadas:0,tokensEntrada:0,usd:0,desde:null};for(const k of Object.keys(usoImg))delete usoImg[k];return response(iaUso());}
    if(path==='/api/agentes')return response({pausados});
    const pausaMatch=path.match(/^\/api\/agentes\/(van_gogh|monalisa|art_director)\/(pausar|retomar)$/);
    if(pausaMatch&&post){const id=pausaMatch[1] as ActorId;pausados=pausaMatch[2]==='pausar'?[...new Set([...pausados,id])]:pausados.filter(v=>v!==id);emit({type:'agentes.pausa',payload:{pausados}});return response({pausados});}
    if(path==='/api/config') return response({config:OrchestratorConfigSchema.parse({})});
    if(path==='/api/messages')return response({messages});
    if(path==='/api/demandas')return post?response({demanda:create(body)},201):response({demandas});
    if(path==='/api/acervo')return response(grid());
    if(path==='/api/acervo/fill') {
      grid().slots.filter(s=>!s.preenchido&&!s.demandaAbertaId).forEach(s=>create({briefing:`Compor arte de ${PROCEDIMENTO_LABELS[s.procedimento]} para o acervo.`,procedimento:s.procedimento,tipoTemplate:s.tipoTemplate},'acervo'));
      emit({type:'log',payload:{level:'info',message:'Solicitações de acervo enfileiradas no mock local.'}});return response({accepted:true},202);
    }
    if(path==='/api/brain/marcas')return response({marcas:[marcaRoyal].map(({conteudo,visualSystem,...summary})=>summary)});
    if(path.startsWith('/api/brain/marcas/')){const m=path.split('/').at(-1)===marcaRoyal.id?marcaRoyal:undefined;return m?response({marca:m}):error('Marca não encontrada.',404,'NOT_FOUND');}
    if(path==='/api/brain/skills')return response({skills:skills.map(({conteudo,rubrica,aprendizados,...summary})=>summary)});
    if(path.startsWith('/api/brain/skills/')) {const skill=skills.find(s=>s.id===path.split('/').at(-1));return skill?response({skill}):error('Skill não encontrada.',404,'NOT_FOUND');}
    const produzirMatch=path.match(/^\/api\/demandas\/(DEM-\d{4,})\/produzir$/);
    if(produzirMatch&&post) {
      const found=demandas.find(d=>d.id===produzirMatch[1]);if(!found)return error('Demanda não encontrada.',404,'NOT_FOUND');
      if(found.producao?.etapa!=='aguardando'&&found.producao?.etapa!=='erro')return error('Esta demanda não está aguardando produção.');
      produzir(found.id);return response({demanda:demandas.find(d=>d.id===found.id)});
    }
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
        demandas.forEach(d=>{if(d.estado==='EM_PRODUCAO'&&!(d.producao&&d.producao.etapa!=='entregue'))produce(d.id);else if(d.estado==='EM_REVISAO_DIRETOR')later(()=>finishReview(d.id),1000);});
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
