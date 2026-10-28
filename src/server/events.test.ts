import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SSE_HEARTBEAT_MS, SseEnvelopeSchema } from '../shared/types';
import { closeAppStreams } from './app';
import { evento, fixture } from './test-support';

describe('SSE', () => {
  let f: Awaited<ReturnType<typeof fixture>>;
  beforeEach(async () => { f = await fixture(); });
  afterEach(async () => { vi.useRealTimers(); await f.cleanup(); });

  async function conectar(cursor?: string, signal?: AbortSignal) {
    const response = await f.app.request('/api/events', { signal, headers: cursor === undefined ? {} : { 'Last-Event-ID': cursor } });
    const reader = response.body!.getReader();
    const ler = async () => new TextDecoder().decode((await reader.read()).value);
    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('text/event-stream; charset=utf-8');
    expect(response.headers.get('Cache-Control')).toBe('no-cache');
    expect(await ler()).toBe('retry: 3000\n\n');
    return { response, reader, ler };
  }
  function conferirFrame(frame: string, id: string) {
    expect(frame).toContain(`id: ${id}\n`);
    expect(frame).toContain('event: log\n');
    const json = /^data: (.*)$/m.exec(frame)?.[1];
    expect(SseEnvelopeSchema.parse(JSON.parse(json!))).toEqual(evento(id));
  }

  it('recebe eventos publicados e faz unsubscribe ao cancelar o leitor', async () => {
    const stream = await conectar();
    expect(f.orchestrator.bus.listeners.size).toBe(1);
    f.orchestrator.bus.publish(evento('evt-live'));
    conferirFrame(await stream.ler(), 'evt-live');
    await stream.reader.cancel();
    expect(f.orchestrator.bus.listeners.size).toBe(0);
  });
  it.each([undefined, 'expirado', 'evt-z'])('replay respeita o cursor opaco %s', async cursor => {
    f.orchestrator.bus.publish(evento('evt-z'));
    f.orchestrator.bus.publish(evento('evt-a'));
    const stream = await conectar(cursor);
    if (cursor !== 'evt-z') conferirFrame(await stream.ler(), 'evt-z');
    conferirFrame(await stream.ler(), 'evt-a');
    await stream.reader.cancel();
  });
  it('registra listener antes de history e deduplica a publicação durante replay', async () => {
    f.orchestrator.bus.publish(evento('antigo'));
    f.orchestrator.bus.duranteHistory = () => {
      expect(f.orchestrator.bus.listeners.size).toBe(1);
      f.orchestrator.bus.publish(evento('durante-replay'));
    };
    const stream = await conectar();
    conferirFrame(await stream.ler(), 'antigo');
    conferirFrame(await stream.ler(), 'durante-replay');
    f.orchestrator.bus.publish(evento('depois-replay'));
    conferirFrame(await stream.ler(), 'depois-replay');
    await stream.reader.cancel();
  });
  it('emite heartbeat a cada 15s, fora do histórico, e limpa timer ao abortar', async () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    const stream = await conectar(undefined, controller.signal);
    const pendente = stream.ler();
    await vi.advanceTimersByTimeAsync(SSE_HEARTBEAT_MS);
    expect(await pendente).toBe(': heartbeat\n\n');
    expect(f.orchestrator.bus.eventos).toEqual([]);
    expect(vi.getTimerCount()).toBe(1);
    controller.abort();
    expect(f.orchestrator.bus.listeners.size).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
    await stream.reader.cancel();
  });
  it('fecha todas as conexões no shutdown sem listeners restantes', async () => {
    const a = await conectar();
    const b = await conectar();
    expect(f.orchestrator.bus.listeners.size).toBe(2);
    closeAppStreams(f.app);
    expect(f.orchestrator.bus.listeners.size).toBe(0);
    expect((await a.reader.read()).done).toBe(true);
    expect((await b.reader.read()).done).toBe(true);
    closeAppStreams(f.app);
  });
  it('aborta conexão cujo signal já estava abortado', async () => {
    const controller = new AbortController();
    controller.abort();
    const response = await f.app.request('/api/events', { signal: controller.signal });
    await response.body?.cancel();
    expect(f.orchestrator.bus.listeners.size).toBe(0);
  });
  it('valida Last-Event-ID vazio antes de abrir stream', async () => {
    const response = await f.app.request('/api/events', { headers: { 'Last-Event-ID': ' ' } });
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: { code: 'VALIDATION_ERROR' } });
    expect(f.orchestrator.bus.listeners.size).toBe(0);
  });
  it('encerra falhas após iniciar stream com envelope log público e limpa listener', async () => {
    vi.spyOn(f.orchestrator.bus, 'history').mockImplementation(() => { throw new Error('stack e segredo'); });
    const stream = await conectar();
    const frame = await stream.ler();
    const json = /^data: (.*)$/m.exec(frame)?.[1];
    const event = SseEnvelopeSchema.parse(JSON.parse(json!));
    expect(event).toMatchObject({ type: 'log', payload: { level: 'error' } });
    expect(frame).not.toContain('segredo');
    expect((await stream.reader.read()).done).toBe(true);
    expect(f.orchestrator.bus.listeners.size).toBe(0);
  });
});
