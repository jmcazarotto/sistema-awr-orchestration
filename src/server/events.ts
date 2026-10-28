import { randomUUID } from 'node:crypto';
import type { Context } from 'hono';
import { streamSSE } from 'hono/streaming';
import { SSE_HEARTBEAT_MS, SSE_HISTORY_LIMIT, SSE_RETRY_MS } from '../shared/types';
import type { EventBusPublic, SseEnvelope } from '../shared/types';

export type CloseStream = () => void;

export function eventsResponse(c: Context, bus: EventBusPublic, cursor: string | undefined, streams: Set<CloseStream>): Response {
  const response = streamSSE(c, async stream => {
    const fila: (SseEnvelope | 'heartbeat')[] = [];
    const vistos = new Set<string>();
    let acordar: (() => void) | undefined;
    let encerrado = false;
    let unsubscribe: (() => void) | undefined;
    let timer: ReturnType<typeof setInterval> | undefined;
    const acordarLeitor = () => { acordar?.(); acordar = undefined; };
    const encerrar = () => {
      if (encerrado) return;
      encerrado = true;
      unsubscribe?.();
      if (timer !== undefined) clearInterval(timer);
      c.req.raw.signal.removeEventListener('abort', abortar);
      streams.delete(abortar);
      fila.length = 0;
      acordarLeitor();
    };
    const abortar = () => { encerrar(); stream.abort(); };
    streams.add(abortar);
    stream.onAbort(encerrar);
    c.req.raw.signal.addEventListener('abort', abortar, { once: true });
    const retry = stream.write(`retry: ${SSE_RETRY_MS}\n\n`);
    try {
      unsubscribe = bus.subscribe(event => {
        if (!encerrado && !vistos.has(event.id)) {
          vistos.add(event.id);
          fila.push(event);
          acordarLeitor();
        }
      });
      // subscribe precede history; eventos publicados durante o snapshot são deduplicados.
      const historico = bus.history(SSE_HISTORY_LIMIT);
      const posicao = cursor === undefined ? -1 : historico.findIndex(event => event.id === cursor);
      const replay = historico.slice(posicao + 1);
      const publicados = fila.splice(0);
      vistos.clear();
      for (const event of historico.slice(0, posicao + 1)) vistos.add(event.id);
      for (const event of [...replay, ...publicados]) {
        if (event !== 'heartbeat' && !vistos.has(event.id)) { vistos.add(event.id); fila.push(event); }
      }
      timer = setInterval(() => { fila.push('heartbeat'); acordarLeitor(); }, SSE_HEARTBEAT_MS);
      if (c.req.raw.signal.aborted) abortar();
      await retry;
      while (!encerrado) {
        const event = fila.shift();
        if (event === undefined) { await new Promise<void>(resolve => { acordar = resolve; }); continue; }
        if (event === 'heartbeat') await stream.write(': heartbeat\n\n');
        else await stream.writeSSE({ id: event.id, event: event.type, data: JSON.stringify(event) });
        // Deduplicação só precisa cobrir replay e a fila pendente, não toda a vida da conexão.
        if (typeof event === 'object') vistos.delete(event.id);
      }
    } catch {
      await retry;
      if (!encerrado) {
        const event: SseEnvelope = { id: randomUUID(), ts: new Date().toISOString(), type: 'log', payload: { level: 'error', message: 'Stream interrompido. Reconecte para recuperar os eventos.' } };
        await stream.writeSSE({ id: event.id, event: event.type, data: JSON.stringify(event) });
      }
    } finally { encerrar(); }
  });
  response.headers.set('Content-Type', 'text/event-stream; charset=utf-8');
  return response;
}
