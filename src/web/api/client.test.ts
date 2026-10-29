import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApi, imageUrl } from './client';
import { createMockApi } from '../dev/mockApi';
import { parseEvent } from './events';
import { SseEnvelopeSchema } from '../../shared/types';

afterEach(()=>vi.useRealTimers());
describe('cliente HTTP validado',()=>{
  it('rejeita resposta inválida em vez de entregar dados à UI',async()=>{const api=createApi(vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({demandas:[{id:'qualquer'}]}))));await expect(api.demandas()).rejects.toThrow('contrato esperado');});
  it('expõe mensagens legíveis de 400 e 409',async()=>{for(const status of [400,409]){const api=createApi(vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({error:{code:status===400?'VALIDATION_ERROR':'HOP_LIMIT',message:'Resete os hops antes de ajustar.'}}),{status})));await expect(api.demandas()).rejects.toMatchObject({status,message:'Resete os hops antes de ajustar.'});}});
  it('trata JSON ilegível e erros fora do contrato',async()=>{const invalid=createApi(vi.fn<typeof fetch>().mockResolvedValue(new Response('html',{status:200})));await expect(invalid.acervo()).rejects.toThrow('ilegível');const down=createApi(vi.fn<typeof fetch>().mockResolvedValue(new Response('',{status:500})));await expect(down.acervo()).rejects.toThrow('A API não respondeu');const error=createApi(vi.fn<typeof fetch>().mockResolvedValue(new Response('{}',{status:409})));await expect(error.acervo()).rejects.toThrow('(409)');});
  it('omite vazios e valida requests antes de chamar fetch',async()=>{const transport=vi.fn<typeof fetch>();const api=createApi(transport);expect(()=>api.create({briefing:'   '})).toThrow();expect(transport).not.toHaveBeenCalled();});
  it('constrói URL pública de arte sem expor outro endpoint',()=>expect(imageUrl('_staging/DEM-0001__v2.png')).toBe('/acervo/_staging/DEM-0001__v2.png'));
  it('explica falhas de rede em português',async()=>{const api=createApi(vi.fn<typeof fetch>().mockRejectedValue(new TypeError('Failed to fetch')));await expect(api.demandas()).rejects.toMatchObject({code:'NETWORK_ERROR',message:'Não foi possível conectar à API. Verifique se o servidor está disponível.'});});
});
describe('transporte SSE',()=>{
  const event={id:'e-1',ts:'2026-10-28T12:00:00Z',type:'log',payload:{level:'info',message:'Conectado'}};
  it('valida JSON, tipo e ID do frame',()=>{expect(parseEvent(JSON.stringify(event),'log','e-1')).toEqual(event);expect(()=>parseEvent(JSON.stringify(event),'log','e-2')).toThrow('divergente');expect(()=>parseEvent(JSON.stringify(event),'actor.status','e-1')).toThrow('divergente');expect(()=>parseEvent('{}','log','e-1')).toThrow();});
});
describe('mock local contra os mesmos contratos',()=>{
  it('reconecta sem reabrir demandas já revisadas e retoma revisões interrompidas',async()=>{
    vi.useFakeTimers();const mock=createMockApi();const api=createApi(mock.fetch);
    const handlers={event:()=>{},connection:()=>{},opened:()=>{},invalid:()=>{}};
    let close=mock.connect(handlers);await vi.advanceTimersByTimeAsync(1900);
    expect((await api.demanda('DEM-0003')).demanda.estado).toBe('EM_REVISAO_DIRETOR');close();
    close=mock.connect(handlers);await vi.advanceTimersByTimeAsync(1200);
    expect((await api.demanda('DEM-0003')).demanda.estado).toBe('AGUARDANDO_APROVACAO_AWR');close();
    close=mock.connect(handlers);await vi.advanceTimersByTimeAsync(3200);
    expect((await api.demanda('DEM-0003')).demanda.estado).toBe('AGUARDANDO_APROVACAO_AWR');close();expect(vi.getTimerCount()).toBe(0);
  });
  it('valida todas as leituras e o ciclo de aprovação, reset e aprendizado',async()=>{
    vi.useFakeTimers();const mock=createMockApi();const api=createApi(mock.fetch);const events:unknown[]=[];
    const close=mock.connect({event:e=>events.push(e),connection:()=>{},opened:()=>{},invalid:()=>{}});
    await vi.advanceTimersByTimeAsync(60);
    expect((await api.demandas()).demandas).toHaveLength(4);expect((await api.acervo()).slots).toHaveLength(12);expect((await api.skills()).skills).toHaveLength(5);expect((await api.skill('botox')).skill.aprendizados).toHaveLength(1);expect((await api.config()).config.MAX_HOPS).toBe(5);await api.messages();await api.demanda('DEM-0001');
    await expect(api.feedback('DEM-0002',{decisao:'ajustar',motivo:'Mover o selo.',revisor:'Teste'})).rejects.toMatchObject({status:409,code:'HOP_LIMIT'});
    expect((await api.resetHops('DEM-0002')).demanda.hop).toBe(0);
    const adjusted=await api.feedback('DEM-0002',{decisao:'ajustar',motivo:'Mover o selo para o rodapé.',revisor:'Teste'});expect(adjusted.demanda.estado).toBe('EM_PRODUCAO');expect((await api.skill('botox')).skill.aprendizados).toHaveLength(2);
    const approved=await api.feedback('DEM-0001',{decisao:'aprovar',revisor:'Teste'});expect(approved.demanda.finalPath).toMatch(/\.png$/);expect(approved.demanda.estado).toBe('APROVADA_SALVA_NO_ACERVO');await expect(api.feedback('DEM-0001',{decisao:'aprovar',revisor:'Teste'})).rejects.toMatchObject({status:409});
    const created=await api.create({briefing:'Criar sobre botox',headline:'Expressão natural'});expect(created.demanda.classificacao?.procedimento).toBe('botox');expect(created.demanda.estado).toBe('CLASSIFICADA');expect(created.demanda.producao?.etapa).toBe('aguardando');expect((await api.produzir(created.demanda.id)).demanda.producao?.etapa).toBe('na_fila');await expect(api.produzir(created.demanda.id)).rejects.toMatchObject({status:409});await vi.advanceTimersByTimeAsync(8000);expect((await api.demanda(created.demanda.id)).demanda.estado).toBe('AGUARDANDO_APROVACAO_AWR');expect((await api.demanda(created.demanda.id)).demanda.producao?.etapa).toBe('entregue');
    await api.fill();const total=(await api.demandas()).demandas.length;await api.fill();expect((await api.demandas()).demandas).toHaveLength(total);await vi.advanceTimersByTimeAsync(3000);events.forEach(event=>expect(SseEnvelopeSchema.safeParse(event).success).toBe(true));close();expect(vi.getTimerCount()).toBe(0);
  });
});
describe('empresas e templates',()=>{
  it('lê empresas e templates do mock com filtros e valida os contratos',async()=>{
    const api=createApi(createMockApi().fetch);
    const {empresas}=await api.empresas();expect(empresas[0]).toMatchObject({id:'royal_face',tipo:'franquia'});expect(empresas[0]!.unidades).toHaveLength(2);
    expect((await api.empresa('royal_face')).empresa.nome).toBe('Royal Face');
    expect((await api.templates()).templates).toHaveLength(12);
    const ad=(await api.templates({empresaId:'royal_face',procedimento:'preenchimento_labial',familia:'antes_depois'})).templates;expect(ad.map(t=>t.tipoTemplate)).toEqual(['antes_depois_1','antes_depois_2']);
    const t1=(await api.template('royal_face__preenchimento_labial__antes_depois_1')).template;expect(t1.fundo).toBe('linear:#4a4947,#9b7d57');expect(t1.elementos.find(e=>e.tipo==='foto_antes')).toMatchObject({x:68,y:243,w:460,h:462});
    await expect(api.template('nao_existe')).rejects.toMatchObject({status:404});
  });
  it('salva template via PUT e empresa via POST (upsert)',async()=>{
    const mock=createMockApi();const api=createApi(mock.fetch);const id='royal_face__botox__banco_imagem_1';
    const t=(await api.template(id)).template;
    const saved=await api.saveTemplate(id,{nome:'Novo nome',fundo:'#111111',elementos:t.elementos.slice(0,2)});
    expect(saved.template).toMatchObject({nome:'Novo nome',fundo:'#111111'});expect((await api.template(id)).template.elementos).toHaveLength(2);
    expect(()=>api.saveTemplate(id,{nome:'  ',fundo:'#111',elementos:[]})).toThrow();
    const nova=await api.saveEmpresa({id:'clinica_sol',nome:'Clínica Sol',tipo:'independente',aliases:[],unidades:[],procedimentos:['botox'],cores:{primaria:'#176af2',secundaria:'#10172f',texto:'#ffffff'}});
    expect(nova.empresa.logo).toBeNull();expect((await api.templates({empresaId:'clinica_sol'})).templates).toHaveLength(4);
    expect((await api.empresas()).empresas).toHaveLength(2);
  });
  it('envia PUT com JSON e upload multipart sem Content-Type manual',async()=>{
    const transport=vi.fn<typeof fetch>().mockImplementation(async()=>new Response(JSON.stringify({empresa:{id:'royal_face',nome:'Royal Face',logo:'_marcas/royal_face/logo.svg'}})));const api=createApi(transport);
    await api.uploadLogo('royal_face',new Blob(['<svg/>'],{type:'image/svg+xml'}));
    const [url,init]=transport.mock.calls[0]!;expect(url).toBe('/api/empresas/royal_face/logo');expect(init?.method).toBe('POST');expect(init?.body).toBeInstanceOf(FormData);expect((init?.body as FormData).get('arquivo')).toBeInstanceOf(Blob);expect(init?.headers).toBeUndefined();
    const put=vi.fn<typeof fetch>().mockResolvedValue(new Response('{}',{status:500}));await createApi(put).saveTemplate('a_b',{nome:'x',fundo:'#000',elementos:[]}).catch(()=>{});
    expect(put.mock.calls[0]![1]).toMatchObject({method:'PUT',headers:{'Content-Type':'application/json'}});
    const q=vi.fn<typeof fetch>().mockResolvedValue(new Response('{"templates":[]}'));await createApi(q).templates({empresaId:'royal_face',familia:'banco_imagem'});expect(q.mock.calls[0]![0]).toBe('/api/templates?empresaId=royal_face&familia=banco_imagem');
  });
});
