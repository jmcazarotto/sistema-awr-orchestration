import { describe, expect, it, vi, beforeEach } from 'vitest';
import { z } from 'zod';
import { AiClient } from './AiClient';
import { EventBus } from '../core/EventBus';
import { MemoryStateStore } from '../core/MemoryStateStore';
import { FakeClock, NanoIdGenerator } from '../core/Clock';
import { OrchestratorConfigSchema } from '../../shared/types';

const calls = vi.hoisted(() => ({ parse: vi.fn(), generate: vi.fn(), edit: vi.fn() }));
vi.mock('openai', () => ({ default: class { responses = { parse: calls.parse }; images = { generate: calls.generate, edit: calls.edit }; }, toFile: vi.fn() }));

describe('OpenAI sem rede: validação, retry e logs', () => {
  beforeEach(() => { vi.clearAllMocks(); });
  function setup(key?: string) {
    const bus = new EventBus(new MemoryStateStore(), new FakeClock(), new NanoIdGenerator(), 5);
    return { bus, ai: new AiClient(OrchestratorConfigSchema.parse({ AI_MODE: 'openai' }), bus, key) };
  }
  it('envia arte e fontes na mesma revisão, mantendo a ordem das imagens', async () => {
    calls.parse.mockResolvedValue({ output_parsed: { regra: 'ok' } });
    const { ai } = setup('test-local-stub');
    const imagens = [Buffer.from('arte'), Buffer.from('antes'), Buffer.from('depois')];
    await ai.json('model-test', z.object({ regra: z.string() }), 'system', 'manifesto', imagens);
    expect(calls.parse.mock.calls[0]![0].input[0].content).toEqual([
      { type: 'input_text', text: 'manifesto' },
      ...imagens.map(buffer => ({ type: 'input_image', image_url: `data:image/png;base64,${buffer.toString('base64')}`, detail: 'high' })),
    ]);
  });
  it('saída inválida é reexecutada uma vez e validada por Zod', async () => {
    calls.parse.mockResolvedValueOnce({ output_parsed: { regra: 12 } }).mockResolvedValueOnce({ output_parsed: { regra: 'Mantenha a margem.' } });
    const { ai, bus } = setup('test-local-stub');
    expect(await ai.json('model-test', z.object({ regra: z.string() }), 'system', 'prompt')).toEqual({ regra: 'Mantenha a margem.' });
    expect(calls.parse).toHaveBeenCalledTimes(2); expect(bus.history(10).filter(event => event.type === 'log')).toHaveLength(1);
  });
  it('erro de fornecedor esgota duas tentativas e é registrado sem dados sensíveis', async () => {
    calls.parse.mockRejectedValue(new Error('secret vendor payload'));
    const { ai, bus } = setup('test-local-stub');
    await expect(ai.json('model-test', z.object({ regra: z.string() }), 'system', 'prompt')).rejects.toThrow('duas tentativas');
    expect(calls.parse).toHaveBeenCalledTimes(2); expect(JSON.stringify(bus.history(10))).not.toContain('secret vendor payload');
    expect(bus.history(1)[0]).toMatchObject({ type: 'log', payload: { level: 'error' } });
  });
  it('sem credencial falha claramente sem tentar rede', async () => {
    const { ai, bus } = setup(); await expect(ai.json('model-test', z.object({ regra: z.string() }), 'system', 'prompt')).rejects.toThrow('OPENAI_API_KEY não configurada');
    expect(calls.parse).not.toHaveBeenCalled(); expect(bus.history(1)[0]).toMatchObject({ type: 'log', payload: { level: 'error' } });
  });
});

describe('motivo de erro da OpenAI', () => {
  it('mostra status e motivo sem fragmentos de chave', async () => {
    calls.generate.mockRejectedValue(Object.assign(new Error('401 Incorrect API key provided: key_uA1j********UbiW. You can find your API key at https://platform.openai.com.'), { status: 401 }));
    const bus = new EventBus(new MemoryStateStore(), new FakeClock(), new NanoIdGenerator(), 5);
    const ai = new AiClient(OrchestratorConfigSchema.parse({}), bus, 'test-local-stub');
    const erro = await ai.photo('prompt').catch((error: Error) => error.message);
    expect(erro).toContain('401 Incorrect API key provided: [oculta]');
    expect(erro).not.toMatch(/uA1j|UbiW|401 401/);
    expect(calls.generate).toHaveBeenCalledTimes(1);
  });
});
