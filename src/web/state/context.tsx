import { createContext, useContext, useSyncExternalStore } from 'react';
import type { ApiClient } from '../transport/client';
import { applyEvent, createStore, mergeMessages, upsertDemand } from './store';
import type { AppState } from './store';
import type { EventHandlers } from '../transport/events';
import type { SseEnvelope } from '../../shared/types';

export function createRuntime(api: ApiClient, connect: (handlers: EventHandlers) => () => void, mock: boolean) {
  const store = createStore();
  let refreshing = false;
  let refreshAgain = false;
  let stopped = false;
  let buffered: SseEnvelope[] = [];
  async function refresh() {
    if (refreshing) { refreshAgain = true; return; }
    refreshing = true;
    try {
      const [demands, messages, acervo, skills, config, agentes] = await Promise.all([api.demandas(), api.messages(), api.acervo(), api.skills(), api.config(), api.agentes().catch(() => ({ pausados: [] }))]);
      if (!stopped) store.update(state => {
        let next: AppState = {...state, demandas: demands.demandas, messages: messages.messages, acervo, skills: skills.skills, config: config.config, pausados: agentes.pausados, loading: false, error: null};
        // Events arriving while GETs were in flight must win over those snapshots.
        for (const event of buffered) next = applyEvent(next, event);
        return next;
      });
    } catch (error) { if (!stopped) store.update(s => ({...s, loading:false, error: error instanceof Error ? error.message : 'Não foi possível carregar os dados.'})); }
    finally {
      if (!stopped && store.getSnapshot().error) buffered.forEach(store.event);
      buffered=[];refreshing=false;
      if (refreshAgain && !stopped) { refreshAgain=false;void refresh(); }
    }
  }
  return {
    api, store, mock, refresh,
    start() {
      stopped=false;
      void refresh();
      const close=connect({event:event=>{if(refreshing)buffered.push(event);else store.event(event);},connection:connection=>store.update(s=>({...s,connection})),opened:()=>{void refresh();},invalid:message=>store.update(s=>({...s,error:message}))});
      return ()=>{stopped=true;close();};
    },
    async loadDemand(id:string) {
      const result=await api.demanda(id);
      store.update(s=>({...s,demandas:upsertDemand(s.demandas,result.demanda),messages:mergeMessages(s.messages,result.messages)}));
      return result.demanda;
    },
  };
}
export type Runtime=ReturnType<typeof createRuntime>;
export const RuntimeContext=createContext<Runtime|null>(null);
export function useRuntime(){const value=useContext(RuntimeContext);if(!value)throw new Error('Runtime ausente');return value;}
export function useAppState(){const {store}=useRuntime();return useSyncExternalStore(store.subscribe,store.getSnapshot,store.getSnapshot);}
