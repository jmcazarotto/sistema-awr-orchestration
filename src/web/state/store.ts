import { ACTOR_IDS, ESTADOS_DEMANDA, OrchestratorConfigSchema } from '../../shared/types';
import type { AcervoGrid, AcervoSlot, ActorId, ActorStatus, Demanda, InboxMessage, Learning, OrchestratorConfig, SkillSummary, SseEnvelope, Triagem } from '../../shared/types';
import type { Connection } from '../transport/events';

export interface AppState {
  liveMessage: Extract<SseEnvelope, {type: 'message.sent'}> | null;
  demandas: Demanda[]; messages: InboxMessage[]; acervo: AcervoGrid | null; skills: SkillSummary[];
  actors: Record<ActorId, { status: ActorStatus; demandaId: string | null }>;
  /** Agentes pausados (não pegam nada da fila até retomar). */
  pausados: ActorId[];
  triagens: Triagem[];
  triagemAtiva: Extract<SseEnvelope, {type: 'triagem.started'}>['payload'] | null;
  reviews: Extract<SseEnvelope, {type: 'review.result'}>[];
  learnings: {skillFile: string; learning: Learning}[];
  logs: Extract<SseEnvelope, {type: 'log'}>[];
  seen: string[]; connection: Connection; loading: boolean; error: string | null;
  config: OrchestratorConfig;
}
export function initialState(): AppState {
  return { liveMessage: null, demandas: [], messages: [], acervo: null, skills: [], actors: Object.fromEntries(ACTOR_IDS.map(id => [id, {status: 'idle', demandaId: null}])) as AppState['actors'], pausados: [], triagens: [], triagemAtiva: null, reviews: [], learnings: [], logs: [], seen: [], connection: 'connecting', loading: true, error: null, config: OrchestratorConfigSchema.parse({}) };
}
export function upsertDemand(demandas: Demanda[], demanda: Demanda) {
  const old = demandas.find(d => d.id === demanda.id);
  if (old && Date.parse(old.updatedAt) > Date.parse(demanda.updatedAt)) return demandas;
  return old ? demandas.map(d => d.id === demanda.id ? demanda : d) : [...demandas, demanda];
}
export function mergeMessages(a: InboxMessage[], b: InboxMessage[]) {
  return [...new Map([...a, ...b].map(m => [m.id, m])).values()].sort((x,y) => Date.parse(x.createdAt) - Date.parse(y.createdAt));
}
export const TRIAGEM_HISTORY_LIMIT = 30;
export function mergeTriagens(items: Triagem[], item: Triagem) {
  return [...items.filter(t => t.id !== item.id), item].sort((a,b) => Date.parse(a.criadoEm) - Date.parse(b.criadoEm)).slice(-TRIAGEM_HISTORY_LIMIT);
}
export function applyEvent(state: AppState, event: SseEnvelope): AppState {
  if (state.seen.includes(event.id)) return state;
  const next = { ...state, seen: [...state.seen.slice(-4999), event.id] };
  switch (event.type) {
    case 'triagem.started': return {...next, triagemAtiva: event.payload};
    case 'triagem.result': return {...next, triagens: mergeTriagens(state.triagens, event.payload), triagemAtiva: state.triagemAtiva?.triagemId === event.payload.id ? null : state.triagemAtiva};
    case 'agentes.pausa': return {...next, pausados: event.payload.pausados};
    case 'actor.status': return {...next, actors: {...state.actors, [event.payload.actorId]: {status: event.payload.status, demandaId: event.payload.demandaId}}};
    case 'message.sent': return {...next, messages: mergeMessages(state.messages, [event.payload]), liveMessage: state.messages.some(m => m.id === event.payload.id) ? state.liveMessage : event};
    case 'demand.updated': return {...next, demandas: upsertDemand(state.demandas, event.payload)};
    case 'review.result': {
      const p = event.payload;
      return {...next, reviews: [...state.reviews.filter(r => r.payload.demandaId !== p.demandaId || r.payload.versao !== p.versao), event], demandas: state.demandas.map(d => d.id === p.demandaId && d.versaoAtual === p.versao && d.tentativaDiretor <= p.tentativaDiretor ? {...d, ultimoReview: p.review, tentativaDiretor: p.tentativaDiretor} : d)};
    }
    case 'acervo.updated': return {...next, acervo: event.payload};
    case 'brain.learning': return {...next, learnings: [...state.learnings.filter(l => l.skillFile !== event.payload.skillFile || l.learning.id !== event.payload.learning.id), event.payload]};
    case 'log': return {...next, logs: [...state.logs.slice(-499), event]};
  }
}
export const approvalQueue = (state: AppState) => state.demandas.filter(d => d.estado === 'AGUARDANDO_APROVACAO_AWR');
export const stateCounts = (state: AppState) => Object.fromEntries(ESTADOS_DEMANDA.map(s => [s, state.demandas.filter(d => d.estado === s).length]));
export function latestSlotPath(slot: AcervoSlot, demandas: Demanda[]): string | undefined {
  // Files have no timestamp in the DTO. Prefer approval timestamps when available.
  return demandas.filter(d => d.finalPath && slot.arquivos.includes(d.finalPath))
    .sort((a,b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))[0]?.finalPath ?? slot.arquivos.at(-1);
}
export function feedbackRules(d: Demanda) {
  const pending = d.estado === 'AGUARDANDO_APROVACAO_AWR';
  return { approve: pending, adjust: pending && d.motivoEscalada !== 'hop_limit', reset: pending && d.motivoEscalada === 'hop_limit' };
}
export function createStore() {
  let state = initialState();
  const listeners = new Set<() => void>();
  return {
    getSnapshot: () => state,
    subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    update: (fn: (state: AppState) => AppState) => { state = fn(state); listeners.forEach(fn => fn()); },
    event: (event: SseEnvelope) => { state = applyEvent(state, event); listeners.forEach(fn => fn()); },
  };
}
