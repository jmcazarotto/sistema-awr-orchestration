import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApi, imageUrl } from './client';
import { createMockApi } from '../dev/mockApi';
import { parseEvent } from './events';
import { SseEnvelopeSchema } from '../../shared/types';

afterEach(()=>vi.useRealTimers());
describe('cliente HTTP validado',()=>{
  it('rejeita resposta inválida em vez de entregar dados à UI',async()=>{const api=createApi(vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({demandas:[{id:'qualquer'}]}))));await expect(api.demandas()).rejects.toThrow('contrato esperado');});
  it('expõe mensagens legíveis de 400 e 409',async()=>{for(const status of [400,409]){const api=createApi(vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({error:{code:status===400?'VALIDATION_ERROR':'HOP_LIMIT',message:'Resete os hops antes de ajustar.'}}),{status})));await expect(api.demandas()).rejects.toMatchObject({status,message:'Resete os hops antes de ajustar.'});}});
  it('trata JSON ilegível e erros fora do contrato',async()=>{const invalid=createApi(vi.fn<typeof fetch>().mockResolvedValue(new Response('html',{status:500})));await expect(invalid.acervo()).rejects.toThrow('ilegível');const error=createApi(vi.fn<typeof fetch>().mockResolvedValue(new Response('{}',{status:409})));await expect(error.acervo()).rejects.toThrow('(409)');});
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
    expect((await api.demandas()).demandas).toHaveLength(4);expect((await api.acervo()).slots).toHaveLength(12);expect((await api.skills()).skills).toHaveLength(4);expect((await api.skill('botox')).skill.aprendizados).toHaveLength(1);expect((await api.config()).config.MAX_HOPS).toBe(5);await api.messages();await api.demanda('DEM-0001');
    await expect(api.feedback('DEM-0002',{decisao:'ajustar',motivo:'Mover o selo.',revisor:'Teste'})).rejects.toMatchObject({status:409,code:'HOP_LIMIT'});
    expect((await api.resetHops('DEM-0002')).demanda.hop).toBe(0);
    const adjusted=await api.feedback('DEM-0002',{decisao:'ajustar',motivo:'Mover o selo para o rodapé.',revisor:'Teste'});expect(adjusted.demanda.estado).toBe('EM_PRODUCAO');expect((await api.skill('botox')).skill.aprendizados).toHaveLength(2);
    const approved=await api.feedback('DEM-0001',{decisao:'aprovar',revisor:'Teste'});expect(approved.demanda.finalPath).toMatch(/\.png$/);expect(approved.demanda.estado).toBe('APROVADA_SALVA_NO_ACERVO');await expect(api.feedback('DEM-0001',{decisao:'aprovar',revisor:'Teste'})).rejects.toMatchObject({status:409});
    const created=await api.create({briefing:'Criar sobre botox',headline:'Expressão natural'});expect(created.demanda.classificacao?.procedimento).toBe('botox');await vi.advanceTimersByTimeAsync(3000);expect((await api.demanda(created.demanda.id)).demanda.estado).toBe('AGUARDANDO_APROVACAO_AWR');
    await api.fill();const total=(await api.demandas()).demandas.length;await api.fill();expect((await api.demandas()).demandas).toHaveLength(total);await vi.advanceTimersByTimeAsync(3000);events.forEach(event=>expect(SseEnvelopeSchema.safeParse(event).success).toBe(true));close();expect(vi.getTimerCount()).toBe(0);
  });
});
