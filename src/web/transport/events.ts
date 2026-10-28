import { SSE_EVENT_TYPES, SseEnvelopeSchema } from '../../shared/types';
import type { SseEnvelope } from '../../shared/types';

export type Connection = 'connecting' | 'connected' | 'reconnecting';
export interface EventHandlers {
  event: (envelope: SseEnvelope) => void;
  connection: (status: Connection) => void;
  opened: () => void;
  invalid: (message: string) => void;
}
export function parseEvent(data: string, type: string, id: string): SseEnvelope {
  const event = SseEnvelopeSchema.parse(JSON.parse(data));
  if (event.type !== type || event.id !== id) throw new Error('Envelope SSE divergente do frame.');
  return event;
}
export function connectEvents(handlers: EventHandlers): () => void {
  // Reuse the same EventSource: the browser preserves Last-Event-ID on reconnection.
  const source = new EventSource('/api/events');
  handlers.connection('connecting');
  source.onopen = () => { handlers.connection('connected'); handlers.opened(); };
  source.onerror = () => handlers.connection('reconnecting');
  for (const type of SSE_EVENT_TYPES) source.addEventListener(type, (event: MessageEvent<string>) => {
    try { handlers.event(parseEvent(event.data, type, event.lastEventId)); }
    catch { handlers.invalid('Um evento inválido foi ignorado. Atualize os dados se a conexão não se recuperar.'); }
  });
  return () => source.close();
}
