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
