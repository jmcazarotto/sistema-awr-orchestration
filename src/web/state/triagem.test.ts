import { afterEach, describe, expect, it, vi } from 'vitest';
import { TriagemSchema, SseEnvelopeSchema } from '../../shared/types';
import type { InboxMessage, SseEvent, Triagem } from '../../shared/types';
import { formatBrl, formatLatencia, formatUsd, withMinDelay } from './format';
import { applyEvent, initialState, mergeTriagens, TRIAGEM_HISTORY_LIMIT } from './store';
import { describeActor, describeMessage, describeSaved, describeTriagem } from './describe';
import { createMockApi, seedDemand } from '../dev/mockApi';
import { createApi } from '../transport/client';

const triagem: Triagem = {id:'tri-1',texto:'Botox para Royal Face',empresa:{id:'royal_face_castanhal',nome:'Royal Face Castanhal',cadastrada:true,confianca:1,rede:{id:'royal_face',nome:'Royal Face'},unidade:{id:'royal_face_castanhal',nome:'Castanhal',cadastrada:true},metodo:'cadastro'},procedimento:'botox',procedimentoConfianca:.97,tipoTemplate:'antes_depois_1',familiaArte:'antes_depois',tipoTemplateConfianca:.96,provider:'jev',modelo:'jev-latest',latenciaMs:276,tokens:{entrada:400,saida:50},custo:{usd:.0000189,brl:.00010395,cotacaoUsdBrl:5.5},criadoEm:'2026-10-28T12:00:00Z'};
const envelope = (event:SseEvent,id='event-1') => SseEnvelopeSchema.parse({...event,id,ts:triagem.criadoEm});
afterEach(()=>vi.useRealTimers());
describe('formatadores pt-BR',()=>{
  it('preserva ao menos dois algarismos significativos nos custos minúsculos',()=>{
    expect(formatUsd(.0000189)).toBe('US$ 0,000019');expect(formatBrl(.00010395)).toBe('R$ 0,00010');
    expect(formatUsd(.0000000042)).toBe('US$ 0,0000000042');expect(formatUsd(0)).toBe('US$ 0,00');expect(formatBrl(5.5)).toBe('R$ 5,50');expect(formatLatencia(276)).toBe('276 ms');
  });
});
describe('espera visual mínima com relógio injetado',()=>{
  it('espera dois segundos mesmo com resposta imediata',async()=>{
    vi.useFakeTimers();const sleep=vi.fn((ms:number)=>new Promise<void>(resolve=>setTimeout(resolve,ms)));let done=false;
    const p=withMinDelay(Promise.resolve(42),2000,sleep).then(x=>{done=true;return x;});
    await vi.advanceTimersByTimeAsync(1999);expect(done).toBe(false);await vi.advanceTimersByTimeAsync(1);expect(await p).toBe(42);expect(sleep).toHaveBeenCalledWith(2000);
  });
  it('aguarda a API lenta sem somar outros dois segundos',async()=>{
    vi.useFakeTimers();let done=false;const p=withMinDelay(new Promise(resolve=>setTimeout(()=>resolve(7),3000))).then(x=>{done=true;return x;});
    await vi.advanceTimersByTimeAsync(2000);expect(done).toBe(false);await vi.advanceTimersByTimeAsync(1000);expect(await p).toBe(7);
  });
  it('mantém a espera também em falhas',async()=>{
    vi.useFakeTimers();const assertion=expect(withMinDelay(Promise.reject(new Error('Falhou')))).rejects.toThrow('Falhou');await vi.advanceTimersByTimeAsync(2000);await assertion;
  });
});
describe('triagem no store',()=>{
  it('aceita started/result, preserva outros atores e deduplica SSE e REST por triagem.id',()=>{
    const started=envelope({type:'triagem.started',payload:{triagemId:triagem.id,texto:triagem.texto,provider:'jev',modelo:'jev-latest'}});
    const a=applyEvent(initialState(),started);expect(a.triagemAtiva?.triagemId).toBe(triagem.id);expect(a.actors).toEqual(initialState().actors);
    const event=envelope({type:'triagem.result',payload:triagem},'result');const b=applyEvent(a,event);expect(b.triagemAtiva).toBeNull();expect(applyEvent(b,event)).toBe(b);
    expect(applyEvent({...b,triagens:mergeTriagens(b.triagens,triagem)},{...event,id:'replay'}).triagens).toEqual([triagem]);
  });
  it('limita o histórico a 30 sem apagar triagem concorrente',()=>{
    let s=initialState();for(let i=0;i<40;i++)s=applyEvent(s,envelope({type:'triagem.result',payload:{...triagem,id:`tri-${i}`,criadoEm:new Date(Date.parse(triagem.criadoEm)+i*1000).toISOString()}},`e-${i}`));
    expect(s.triagens).toHaveLength(TRIAGEM_HISTORY_LIMIT);expect(s.triagens[0]?.id).toBe('tri-10');
    s={...s,triagemAtiva:{triagemId:'other',texto:'Outra triagem',provider:'jev',modelo:'jev-latest'}};
    expect(applyEvent(s,envelope({type:'triagem.result',payload:triagem},'old')).triagemAtiva?.triagemId).toBe('other');
  });
});
describe('descrições humanas e links',()=>{
  const delivery:InboxMessage<'ARTE_ENTREGUE'>={id:'m1',demandaId:'DEM-0007',from:'van_gogh',to:'art_director',action:'ARTE_ENTREGUE',hop:1,createdAt:triagem.criadoEm,payload:{stagingPath:'_staging/DEM-0007__v2.png',versao:2,promptUsado:'Arte',engine:'mock'}};
  it('explica entrega, marca refeita e constrói URL pública',()=>{expect(describeMessage(delivery)).toMatchObject({text:'Van Gogh → Diretor de Arte: entregou a arte v2 de DEM-0007',art:{url:'/acervo/_staging/DEM-0007__v2.png',remade:true},demandaUrl:'#/demandas/DEM-0007'});});
  it('explica ajuste com IDs e link da versão anterior',()=>{
    const m:InboxMessage<'AJUSTAR_ARTE'>={...delivery,id:'m2',from:'art_director',to:'van_gogh',action:'AJUSTAR_ARTE',payload:{versaoAnterior:2,feedbackDiretor:{resumo:'Mover selo',correcoes:[{itemId:'R04',instrucao:'Mover'},{itemId:'R07',instrucao:'Contraste'}]}}};
    expect(describeMessage(m,[delivery]).text).toContain('corrigir R04, R07');expect(describeMessage(m,[delivery]).art?.url).toBe('/acervo/_staging/DEM-0007__v2.png');expect(describeMessage(m).art?.url).toBe('/acervo/_staging/DEM-0007__v2.png');
  });
  it('explica atividade, revisão e aprovação final',()=>{
    const d=seedDemand(1);expect(describeActor({status:'idle',demandaId:null})).toBe('Aguardando ordens');expect(describeActor({status:'generating',demandaId:d.id},d)).toContain('Gerando v2');expect(describeActor({status:'reviewing',demandaId:d.id},{...d,tentativaDiretor:2},3)).toContain('tentativa 2/3');
    expect(describeSaved(seedDemand(4,'APROVADA_SALVA_NO_ACERVO'))?.url).toMatch(/^\/acervo\//);expect(describeSaved(d)).toBeNull();expect(describeTriagem(triagem)).toContain('276 ms · US$ 0,000019 (R$ 0,00010)');
  });
  it('explica classificação, produção, acervo e decisão humana',()=>{
    const base={id:'msg',demandaId:'DEM-0001',hop:0,createdAt:triagem.criadoEm};
    const c=seedDemand(1).classificacao!;
    expect(describeMessage({...base,action:'DEMANDA_CLASSIFICADA',from:'system',to:'art_director',payload:{classificacao:c}}).text).toContain('classificou DEM-0001');
    expect(describeMessage({...base,action:'PRODUZIR_ARTE',from:'art_director',to:'van_gogh',payload:{...c,briefing:'Arte para clínica'}}).text).toContain('produzir a arte DEM-0001');
    expect(describeMessage({...base,action:'PREENCHER_ACERVO',from:'acervo_watcher',to:'art_director',payload:c}).text).toContain('solicitou arte para o acervo');
    expect(describeMessage({...base,action:'FEEDBACK_HUMANO',from:'awr_human',to:'art_director',payload:{decisao:'ajustar',revisor:'AWR',motivo:'Mover selo'}}).text).toContain('solicitou ajuste em DEM-0001: Mover selo');
  });
});
describe('API de triagem e mock',()=>{
  it('usa só /api/triagem e transmite started/result válidos, sem criar demanda',async()=>{
    vi.useFakeTimers();const mock=createMockApi();const fetcher=vi.fn(mock.fetch);const api=createApi(fetcher);const events:SseEvent[]=[];
    const close=mock.connect({event:e=>events.push(e),opened:()=>{},connection:()=>{},invalid:()=>{}});
    const pending=api.triagem('Antes e depois de preenchimento labial para a Royal Face Castanhal');await vi.advanceTimersByTimeAsync(401);const {triagem:t}=await pending;
    expect(TriagemSchema.safeParse(t).success).toBe(true);expect(t.custo.usd).toBeCloseTo(.0000189,10);expect(t.procedimento).toBe('preenchimento_labial');expect(t.empresa.cadastrada).toBe(true);expect(events.filter(e=>e.type.startsWith('triagem.')).map(e=>e.type)).toEqual(['triagem.started','triagem.result']);expect(fetcher).toHaveBeenCalledTimes(1);expect(fetcher.mock.calls[0]?.[0]).toBe('/api/triagem');expect((await api.demandas()).demandas).toHaveLength(4);close();
  });
  it.each([400,502])('preserva a mensagem pública e o status %i',async status=>{
    const api=createApi(vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({error:{code:status===502?'UPSTREAM_ERROR':'VALIDATION_ERROR',message:'Não foi possível classificar. Tente de novo.'}}),{status})));
    await expect(api.triagem('Criar botox')).rejects.toMatchObject({status,message:'Não foi possível classificar. Tente de novo.'});
  });
});
