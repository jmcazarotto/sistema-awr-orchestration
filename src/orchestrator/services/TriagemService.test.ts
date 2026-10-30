import { writeFile, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { OrchestratorConfigSchema } from '../../shared/types';
import { fixture } from '../test-support';
import { ClientesRegistry } from '../brain/ClientesRegistry';
import { FastClassifier } from './FastClassifier';
import { JevClient, JevResponseSchema } from './JevClient';
import { TriagemService } from './TriagemService';

function answer(choice: string, keys: string[], confidence = 0.9) {
  return { type: 'choice', choice, confidence, probabilities: Object.fromEntries(keys.map(key => [key, key === choice ? 1 : 0])) };
}
/** Responde como o Jev: usa o corpo base e completa perguntas extras (trechos de briefing) com "pedido". */
function respond(base: { answers: Record<string, unknown> }) {
  return async (_url: unknown, init?: RequestInit) => {
    const questions = JSON.parse(String(init?.body ?? '{}')).questions ?? {};
    const answers: Record<string, unknown> = { ...base.answers };
    for (const [name, q] of Object.entries(questions as Record<string, { criteria: Record<string, string> }>)) {
      if (!answers[name]) { const keys = Object.keys(q.criteria); answers[name] = answer(keys.includes('pedido') ? 'pedido' : keys[0]!, keys); }
    }
    return Response.json({ ...base, answers });
  };
}
export function jevResponse(empresa = 'royal_face', confidence = 0.9) {
  return { model: 'jev-test', answers: {
    procedimento: answer('botox', ['botox', 'preenchimento_labial', 'fios_sustentacao']),
    empresa: answer(empresa, ['royal_face', 'nao_identificada'], confidence),
    tipo_arte: answer('antes_depois_1', ['antes_depois_1', 'antes_depois_2', 'banco_imagem_1', 'banco_imagem_2'], 0.8),
    agente: answer('van_gogh', ['van_gogh', 'monalisa']),
  }, usage: { input_tokens: 1000, output_tokens: 50 } };
}
const config = OrchestratorConfigSchema.parse({ CLASSIFIER_PROVIDER: 'jev', JEV_BASE_URL: 'https://example.test/', JEV_MODEL: 'jev-request' });
const questions = { topic: { type: 'choice' as const, instructions: 'Tema?', criteria: { sim: 'Sim', nao: 'Não' } } };
const response = () => ({ model: 'jev-test', answers: { topic: answer('sim', ['sim', 'nao']) }, usage: { input_tokens: 10, output_tokens: 5 } });

describe('JevClient', () => {
  it('mede chamada e parse com clock injetável e aplica backoff em 429/529', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(new Response('', { status: 429 })).mockResolvedValueOnce(new Response('', { status: 529 })).mockImplementationOnce(respond(response()));
    const sleep = vi.fn(async (_ms: number) => {});
    const now = vi.fn().mockReturnValueOnce(100).mockReturnValueOnce(380);
    expect((await new JevClient(config, 'private-key', { fetch: fetcher, sleep, now }).ask('texto', questions)).latenciaMs).toBe(280);
    expect(sleep.mock.calls).toEqual([[250], [500]]);
    expect(fetcher).toHaveBeenCalledTimes(3);
    expect(fetcher.mock.calls[0]![0]).toBe('https://example.test/v1/systemone');
  });
  it('limita retries a três', async () => {
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async () => new Response('', { status: 429 }));
    await expect(new JevClient(config, 'secret', { fetch: fetcher, sleep: async () => {} }).ask('texto', questions)).rejects.toMatchObject({ code: 'UPSTREAM_ERROR', status: 502 });
    expect(fetcher).toHaveBeenCalledTimes(4);
  });
  it.each(['500', '401', 'invalid-json', 'invalid-choice', 'invalid-probabilities', 'invalid-usage', 'timeout'])('sanitiza erro %s', async kind => {
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async () => {
      if (kind === 'timeout') throw new Error('timeout private-key');
      if (/^\d+$/.test(kind)) return new Response('private-key', { status: Number(kind) });
      if (kind === 'invalid-json') return new Response('private-key');
      const body = response();
      if (kind === 'invalid-choice') body.answers.topic.choice = 'other';
      if (kind === 'invalid-probabilities') body.answers.topic.probabilities = {};
      if (kind === 'invalid-usage') body.usage.input_tokens = -1;
      return Response.json(body);
    });
    const error = await new JevClient(config, 'private-key', { fetch: fetcher }).ask('texto', questions).catch(error => error);
    expect(error).toMatchObject({ code: 'UPSTREAM_ERROR', status: 502, message: 'Falha no classificador de IA.' });
    expect(String(error)).not.toContain('private-key');
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('envia sinal com timeout real de 10 segundos', async () => {
    vi.useFakeTimers();
    const timeout = vi.spyOn(AbortSignal, 'timeout').mockImplementation(ms => {
      const controller = new AbortController(); setTimeout(() => controller.abort(), ms); return controller.signal;
    });
    try {
      const fetcher: typeof fetch = async (_url, init) => new Promise((_resolve, reject) => init!.signal!.addEventListener('abort', () => reject(new Error('aborted'))));
      const pending = new JevClient(config, 'secret', { fetch: fetcher }).ask('texto', questions);
      const assertion = expect(pending).rejects.toMatchObject({ code: 'UPSTREAM_ERROR', status: 502 });
      await vi.advanceTimersByTimeAsync(10000); await assertion;
      expect(timeout).toHaveBeenCalledWith(10000);
    } finally { timeout.mockRestore(); vi.useRealTimers(); }
  });
  it('Zod rejeita confidências fora de faixa e formatos incompatíveis', () => {
    expect(JevResponseSchema.safeParse({ ...response(), answers: { topic: { ...answer('sim', ['sim']), confidence: 2 } } }).success).toBe(false);
  });
});

describe('TriagemService e integração', () => {
  it('envia as três perguntas numa chamada, calcula custos, emite eventos e não produz arte', async () => {
    const fetcher = vi.fn<typeof fetch>().mockImplementation(respond(jevResponse()));
    const f = await fixture({ CLASSIFIER_PROVIDER: 'jev', JEV_PRICE_INPUT_USD_PER_MTOK: 2, JEV_PRICE_OUTPUT_USD_PER_MTOK: 4, USD_BRL: 5 }, { jevApiKey: 'private-key', fetch: fetcher });
    try {
      const before = f.bus.snapshot();
      const result = await f.app.triar('Preciso de um antes e depois de botox para a Royal Face Castanhal');
      expect(result).toMatchObject({ provider: 'jev', modelo: 'jev-test', procedimento: 'botox', familiaArte: 'antes_depois', empresa: { id: 'royal_face_castanhal', nome: 'Royal Face Castanhal', cadastrada: true, confianca: 1, metodo: 'cadastro', rede: { id: 'royal_face', nome: 'Royal Face' }, unidade: { id: 'royal_face_castanhal', nome: 'Castanhal', cadastrada: true } }, tokens: { entrada: 1000, saida: 50 }, custo: { usd: 0.0022, brl: 0.0022 * 5, cotacaoUsdBrl: 5 } });
      expect(result.id).toMatch(/^TRI-/); expect(result.latenciaMs).toBeGreaterThanOrEqual(0);
      // Triagem não cria demanda/mensagem; só registra o uso (custo) da chamada ao Jev.
      const { ia, ...after } = f.bus.snapshot(); const { ia: _antes, ...beforeRest } = before;
      expect(after).toEqual(beforeRest);
      expect(ia.uso['jev:jev-latest']).toMatchObject({ chamadas: 1, tokensEntrada: 1000, tokensSaida: 50, usd: 0.0022 });
      expect(fetcher).toHaveBeenCalledTimes(1);
      const [url, init] = fetcher.mock.calls[0]!;
      expect(url).toBe('https://api.typesafe.ai/v1/systemone');
      expect(init).toMatchObject({ method: 'POST', headers: { Authorization: 'Bearer private-key', 'Content-Type': 'application/json' } });
      const body = JSON.parse(init!.body as string);
      expect(body.state).toBe(result.texto); expect(body.model).toBe('jev-latest');
      // empresa citada literalmente → resolvida pelo cadastro, sem pergunta ao classificador
      expect(Object.keys(body.questions).filter(k => !k.startsWith('trecho_'))).toEqual(['procedimento', 'tipo_arte', 'agente']);
      expect(Object.keys(body.questions.procedimento.criteria)).toEqual(['preenchimento_labial', 'botox', 'fios_sustentacao']);
      expect(Object.keys(body.questions.tipo_arte.criteria)).toHaveLength(4);
      expect(f.bus.history(10).map(event => event.type)).toEqual(['triagem.started', 'triagem.result', 'log']);
      expect(JSON.stringify(f.bus.history(10))).not.toContain('private-key');
    } finally { await f.close(); }
  });
  it.each([['nao_identificada', 0.95], ['royal_face', 0.2]] as const)('extrai empresa desconhecida (%s)', async (empresa, confianca) => {
    const fetcher = vi.fn<typeof fetch>().mockImplementation(respond(jevResponse(empresa, confianca)));
    const f = await fixture({ CLASSIFIER_PROVIDER: 'jev' }, { jevApiKey: 'secret', fetch: fetcher });
    try { expect((await f.app.triar('post institucional de fios de sustentação para a Clínica Aurora')).empresa).toMatchObject({ id: null, nome: 'Clínica Aurora', cadastrada: false }); }
    finally { await f.close(); }
  });
  it('identifica franquia + unidade pelo cadastro com confiança 1 (caso Royal Face Maringá)', async () => {
    const fetcher = vi.fn<typeof fetch>().mockImplementation(respond(jevResponse('nao_identificada', 0.84)));
    const f = await fixture({ CLASSIFIER_PROVIDER: 'jev' }, { jevApiKey: 'secret', fetch: fetcher });
    try {
      expect((await f.app.triar('arte de botox para Royal Face Maringá antes e depois')).empresa).toEqual({ id: 'royal_face_maringa', nome: 'Royal Face Maringá', cadastrada: true, confianca: 1, metodo: 'cadastro', rede: { id: 'royal_face', nome: 'Royal Face' }, unidade: { id: 'royal_face_maringa', nome: 'Maringá', cadastrada: true } });
      expect((await f.app.triar('botox para Royal Face Londrina antes e depois')).empresa).toMatchObject({ id: 'royal_face', nome: 'Royal Face Londrina', cadastrada: true, confianca: 1, unidade: { id: null, nome: 'Londrina', cadastrada: false } });
      expect(JSON.parse(fetcher.mock.calls[0]![1]!.body as string).questions).not.toHaveProperty('empresa');
    } finally { await f.close(); }
  });
  it('roteia o agente: cliente → Van Gogh por regra, acervo → Monalisa por regra, ambíguo → classificador', async () => {
    const withAgente = (agente: string) => { const body = jevResponse(); return { ...body, answers: { ...body.answers, agente: answer(agente, ['van_gogh', 'monalisa'], 0.88) } }; };
    const fetcher = vi.fn<typeof fetch>().mockImplementation(respond(withAgente('monalisa')));
    const f = await fixture({ CLASSIFIER_PROVIDER: 'jev' }, { jevApiKey: 'secret', fetch: fetcher });
    try {
      expect(await f.app.triar('recebemos uma demanda de cliente da unidade Royal Face Colombo para a criação de antes e depois')).toMatchObject({ agente: 'van_gogh', agenteConfianca: 1, empresa: { nome: 'Royal Face Colombo' } });
      expect(await f.app.triar('precisamos abastecer o acervo de imagens de Botox')).toMatchObject({ agente: 'monalisa', agenteConfianca: 1, agenteRegra: true, probabilidades: { agente: { van_gogh: 0, monalisa: 1 }, procedimento: { botox: 1 } } });
      expect(JSON.parse(fetcher.mock.calls[1]![1]!.body as string).questions).toHaveProperty('agente'); // sempre perguntado, para a distribuição
      expect(await f.app.triar('arte de botox antes e depois')).toMatchObject({ agente: 'monalisa', agenteConfianca: 0.88 });
      expect(Object.keys(JSON.parse(fetcher.mock.calls[2]![1]!.body as string).questions.agente.criteria)).toEqual(['van_gogh', 'monalisa']);
    } finally { await f.close(); }
  });
  it('sem citação literal, pergunta a rede ao classificador e aceita só com confiança ≥ 0,7', async () => {
    const fetcher = vi.fn<typeof fetch>().mockImplementationOnce(respond(jevResponse('royal_face', 0.92))).mockImplementationOnce(respond(jevResponse('royal_face', 0.5)));
    const f = await fixture({ CLASSIFIER_PROVIDER: 'jev' }, { jevApiKey: 'secret', fetch: fetcher });
    try {
      expect((await f.app.triar('antes e depois de botox para a Roial Fase de Castanhal')).empresa).toMatchObject({ id: 'royal_face_castanhal', nome: 'Royal Face Castanhal', cadastrada: true, confianca: 0.92, metodo: 'ia' });
      const body = JSON.parse(fetcher.mock.calls[0]![1]!.body as string);
      expect(Object.keys(body.questions.empresa.criteria)).toEqual(['royal_face', 'nao_identificada']);
      expect(body.questions.empresa.criteria.royal_face).toContain('Maringá');
      expect((await f.app.triar('antes e depois de botox para a Roial Fase')).empresa).toMatchObject({ id: null, cadastrada: false, metodo: 'extracao' });
    } finally { await f.close(); }
  });
  it.each([{ CLASSIFIER_PROVIDER: 'jev' as const }, { CLASSIFIER_PROVIDER: 'openai' as const }])('fallback seguro %j', async overrides => {
    const fetcher = vi.fn<typeof fetch>();
    const f = await fixture(overrides, { jevApiKey: '', fetch: fetcher });
    try {
      const result = await f.app.triar('post institucional de fios para a Clínica Aurora');
      expect(result).toMatchObject({ provider: 'mock', procedimento: 'fios_sustentacao', tipoTemplate: 'banco_imagem_2', custo: { usd: 0, brl: 0 }, empresa: { nome: 'Clínica Aurora', cadastrada: false } });
      expect(fetcher).not.toHaveBeenCalled(); expect(f.bus.history(10).some(event => event.type === 'log' && event.payload.level === 'warn')).toBe(true);
      expect((await f.app.triar('foto de botox')).empresa.nome).toBeNull();
    } finally { await f.close(); }
  });
  it('FastClassifier preserva restrições e infere clínica na demanda', async () => {
    const fetcher = vi.fn<typeof fetch>().mockImplementation(respond(jevResponse()));
    const f = await fixture({ CLASSIFIER_PROVIDER: 'jev' }, { jevApiKey: 'secret', fetch: fetcher });
    try {
      const service = new TriagemService(f.config, f.bus, new JevClient(f.config, 'secret', { fetch: fetcher }));
      const input = { briefing: 'Botox para Royal Face', procedimento: 'fios_sustentacao' as const, tipoTemplate: 'banco_imagem_2' as const, clinicaNome: 'Explícita' };
      expect(await new FastClassifier(service).classify(input)).toMatchObject({ procedimento: 'fios_sustentacao', tipoTemplate: 'banco_imagem_2', confianca: 1, skillFile: 'skills/procedimentos/fios_sustentacao.skill.md' });
      expect(input.clinicaNome).toBe('Explícita');
      const demanda = await f.app.submitDemand({ briefing: 'Botox para Royal Face' });
      expect(demanda).toMatchObject({ clinicaNome: 'Royal Face', classificacao: { procedimento: 'botox', confianca: 0.8 } });
      await f.bus.whenIdle();
    } finally { await f.close(); }
  });
  it('registry relê alterações, aceita arquivo ausente e reporta JSON inválido', async () => {
    const f = await fixture();
    try {
      const registry = new ClientesRegistry(f.config.BRAIN_DIR); const path = join(f.config.BRAIN_DIR, 'clientes.json');
      expect(await registry.list()).toHaveLength(1);
      await writeFile(path, '[]'); expect(await registry.list()).toEqual([]);
      await writeFile(path, '{invalid'); await expect(registry.list()).rejects.toThrow('Cadastro brain/clientes.json inválido');
      await unlink(path); expect(await registry.list()).toEqual([]);
    } finally { await f.close(); }
  });
});
