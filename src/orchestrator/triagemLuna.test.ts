import { beforeEach, describe, expect, it, vi } from 'vitest';
import sharp from 'sharp';
import type { BriefingTipo } from '../shared/types';
import { fixture } from './test-support';

const calls = vi.hoisted(() => ({ parse: vi.fn(), decide: vi.fn(), generate: vi.fn(), edit: vi.fn() }));
vi.mock('openai', () => ({ default: class { responses = { parse: calls.parse }; decisions = { create: calls.decide }; images = { generate: calls.generate, edit: calls.edit }; }, toFile: vi.fn(async (dados: Buffer) => dados) }));

interface Pergunta { name: string; type: 'choice' | 'predicate'; choices?: { value: string }[] }
const escolhas: Record<string, string> = { procedimento: 'preenchimento_labial', tipo_arte: 'banco_imagem_1', agente: 'van_gogh', empresa: 'nao_identificada' };
/** Responde como a Decisions API: lista na ordem das perguntas, com probabilidades em lista. */
const decidir = (sobrescreve: Record<string, string> = {}, predicados = 0.9) => async ({ questions }: { questions: Pergunta[] }) => ({
  model: 'gpt-6-luna', usage: { input_tokens: 2000, output_tokens: 0, total_tokens: 2000, input_tokens_details: { cached_tokens: 0, cache_write_tokens: 0 }, output_tokens_details: { reasoning_tokens: 0 } },
  answers: questions.map(q => {
    if (q.type === 'predicate') return { type: 'predicate', name: q.name, probability: predicados };
    const valores = q.choices!.map(choice => choice.value);
    const choice = sobrescreve[q.name] ?? (valores.includes(escolhas[q.name] ?? '') ? escolhas[q.name]! : valores.includes('pedido') ? 'pedido' : valores[0]!);
    return { type: 'choice', name: q.name, choice, confidence: 0.93, probabilities: valores.map(value => ({ value, probability: value === choice ? 0.93 : 0.07 / (valores.length - 1) })) };
  }),
});
const leitura = (itens: { tipo: BriefingTipo; valor: string; trecho: string }[]) => ({ output_parsed: { itens }, usage: { input_tokens: 500, output_tokens: 200 } });
const png = (cor = '#d9b4a1') => sharp({ create: { width: 900, height: 1100, channels: 3, background: cor } }).png().toBuffer();
const foto = async () => (await sharp({ create: { width: 1088, height: 1360, channels: 3, background: '#d9b4a1' } }).png().toBuffer()).toString('base64');
const usoImagem = { input_tokens: 100, input_tokens_details: { text_tokens: 100, image_tokens: 0 }, output_tokens: 4000, total_tokens: 4100 };
const luna = { triagem: { modelo: 'gpt-6-luna-decisions', effort: null }, leitura_briefing: { modelo: 'gpt-6-luna', effort: null }, imagem_van_gogh: { modelo: 'gpt-image-2', effort: 'medio' as const } };
const montar = async (overrides = {}) => { const f = await fixture({ PRODUCAO_MANUAL_VAN_GOGH: true, ...overrides }, { apiKey: 'test-local-stub' }); await f.app.ia.salvarModelos({ ...f.app.ia.modelos(), ...luna }); return f; };

const PEDIDO = 'Arte de preenchimento labial para a Royal Face Maringá por 6x de R$ 99,90. CTA: Agende pelo WhatsApp. Usar uma mulher loira. Sem falar em desconto.';

describe('classificadora Luna + leitura de texto', () => {
  beforeEach(() => { vi.resetAllMocks(); });

  it('texto livre vai à Responses API, escolhas à Decisions API, e o briefing chega inteiro ao Van Gogh', async () => {
    calls.parse.mockResolvedValue(leitura([
      { tipo: 'preco', valor: '6x de R$ 99,90', trecho: '6x de R$ 99,90' }, { tipo: 'chamada_cta', valor: 'Agende pelo WhatsApp', trecho: 'CTA: Agende pelo WhatsApp' },
      { tipo: 'modelo_foto', valor: 'mulher loira', trecho: 'uma mulher loira' }, { tipo: 'restricao', valor: 'sem falar em desconto', trecho: 'Sem falar em desconto' },
      { tipo: 'preco', valor: 'R$ 49,90', trecho: '6x de R$ 99,90' },
    ]));
    calls.decide.mockImplementation(decidir());
    calls.generate.mockResolvedValue({ data: [{ b64_json: await foto() }], usage: usoImagem });
    const f = await montar();
    try {
      const triagem = await f.app.triar(PEDIDO);
      expect(calls.parse.mock.calls[0]![0].model).toBe('gpt-6-luna');
      const pedidoDecisions = calls.decide.mock.calls[0]![0];
      expect(pedidoDecisions.model).toBe('gpt-6-luna');
      expect(pedidoDecisions.input).toBe(PEDIDO);
      // Empresa citada resolve por regra; trechos não voltam à classificadora.
      expect(pedidoDecisions.questions.map((q: Pergunta) => q.name)).toEqual(['procedimento', 'tipo_arte', 'agente']);
      expect(triagem).toMatchObject({ provider: 'openai_decisions', procedimento: 'preenchimento_labial', empresa: { rede: { id: 'royal_face' } } });
      expect(triagem.etapas.map(etapa => [etapa.id, etapa.status])).toEqual([['regras', 'ok'], ['leitura_texto', 'ok'], ['decisoes', 'ok']]);
      expect(triagem.etapas[1]).toMatchObject({ modelo: 'gpt-6-luna', tokens: { entrada: 500, saida: 200 } });
      expect(triagem.etapas[2]).toMatchObject({ modelo: 'gpt-6-luna-decisions', campos: ['procedimento', 'tipo_arte', 'agente'] });
      expect(triagem.custo.usd).toBeCloseTo((500 * 0.1 + 200 * 0.5 + 2000 * 0.1) / 1e6, 10);
      expect(triagem.alertas.join()).toContain('descartadas'); // o preço inventado R$ 49,90 não passa
      expect(triagem.briefing.map(item => item.valor)).toEqual(['6x de R$ 99,90', 'Agende pelo WhatsApp', 'mulher loira', 'sem falar em desconto']);
      expect(f.app.ia.uso().itens.find(i => i.provedor === 'openai_decisions')).toMatchObject({ chamadas: 1, tokensEntrada: 2000 });
      expect(f.app.ia.uso().itens.find(i => i.modelo === 'gpt-6-luna')).toMatchObject({ provedor: 'openai', chamadas: 1, tokensSaida: 200 });

      const criada = await f.app.submitDemand({ briefing: PEDIDO, triagemId: triagem.id }); await f.bus.whenIdle();
      expect(calls.decide).toHaveBeenCalledTimes(1); // triagem conferida não é cobrada de novo
      expect(calls.parse).toHaveBeenCalledTimes(1);
      expect(f.app.getDemanda(criada.id)!.briefingItens).toEqual(triagem.briefing);
      await f.app.produzir(criada.id); await f.bus.whenIdle();
      const prompt: string = calls.generate.mock.calls[0]![0].prompt;
      expect(prompt).toContain('write exactly: "6x de R$ 99,90"');
      expect(prompt).toContain('Call to action button: "Agende pelo WhatsApp"');
      expect(prompt).toContain('PERSON TO SHOW: mulher loira');
      expect(prompt).toContain('DO NOT: sem falar em desconto');
    } finally { await f.close(); }
  });

  it('antes, depois e referência: Luna olha as imagens, restringe o layout e alerta fotos suspeitas', async () => {
    const texto = 'Antes e depois de preenchimento labial para a Royal Face Maringá. Antes: boca fina. Depois: boca com volume natural. Usar mulher morena. CTA: Agende sua avaliação.';
    calls.parse.mockResolvedValueOnce(leitura([
      { tipo: 'descricao_antes', valor: 'boca fina', trecho: 'Antes: boca fina' }, { tipo: 'descricao_depois', valor: 'boca com volume natural', trecho: 'Depois: boca com volume natural' },
      { tipo: 'modelo_foto', valor: 'mulher morena', trecho: 'mulher morena' }, { tipo: 'chamada_cta', valor: 'Agende sua avaliação', trecho: 'CTA: Agende sua avaliação' },
    ])).mockResolvedValue({ output_parsed: { regioes: [] }, usage: { input_tokens: 10, output_tokens: 5 } }); // referência sem pacientes
    calls.decide.mockImplementation(decidir({ tipo_arte: 'antes_depois_2' }, 0.2));
    calls.edit.mockResolvedValue({ data: [{ b64_json: await foto() }], usage: usoImagem });
    const f = await montar();
    try {
      const antes = await f.app.uploadAnexo({ nome: 'antes.png', dados: await png() }, 'antes');
      const depois = await f.app.uploadAnexo({ nome: 'depois.png', dados: await png('#c8a090') }, 'depois');
      const referencia = await f.app.uploadAnexo({ nome: 'ref.png', dados: await png('#ffffff') }, 'referencia');
      const ids = [antes.id, depois.id, referencia.id];
      const triagem = await f.app.triar(texto, ids);
      const pedido = calls.decide.mock.calls[0]![0];
      const partes = pedido.input[0].content as { type: string; text?: string }[];
      expect(partes.filter(parte => parte.type === 'input_image')).toHaveLength(3);
      expect(partes.map(parte => parte.text ?? '').join(' ')).toContain('foto real de ANTES');
      expect(partes.map(parte => parte.text ?? '').join(' ')).toContain('referência de layout');
      const tipoArte = pedido.questions.find((q: Pergunta) => q.name === 'tipo_arte');
      expect(tipoArte.choices.map((c: { value: string }) => c.value)).toEqual(['antes_depois_1', 'antes_depois_2']);
      expect(tipoArte.instructions).toContain('referência');
      expect(pedido.questions.filter((q: Pergunta) => q.type === 'predicate').map((q: Pergunta) => q.name)).toEqual(['fotos_regiao', 'fotos_comparaveis', 'fotos_ordem']);
      expect(triagem).toMatchObject({ tipoTemplate: 'antes_depois_2', familiaArte: 'antes_depois', anexos: ids });
      expect(triagem.alertas).toHaveLength(3);
      expect(triagem.etapas[2]!.campos).toContain('imagens');

      // O texto da leitura só recebe os papéis das imagens, nunca os arquivos.
      expect(calls.parse.mock.calls[0]![0].input[0].content).toHaveLength(1);
      expect(calls.parse.mock.calls[0]![0].input[0].content[0].text).toContain('"papel":"referencia"');

      const criada = await f.app.submitDemand({ briefing: texto, tipoTemplate: triagem.tipoTemplate, anexos: ids, triagemId: triagem.id }); await f.bus.whenIdle();
      await f.app.produzir(criada.id); await f.bus.whenIdle();
      expect(calls.decide).toHaveBeenCalledTimes(1);
      const prompt: string = calls.edit.mock.calls[0]![0].prompt;
      expect(prompt).toContain('BEFORE PHOTO: boca fina');
      expect(prompt).toContain('AFTER PHOTO: boca com volume natural');
      expect(prompt).toContain('never alter a real photo');
      expect(prompt).not.toContain('PERSON TO SHOW'); // foto real manda; descrição de modelo é ignorada
      expect(prompt).toContain('Arrange BEFORE above AFTER');
      expect(prompt).toContain('CLIENT LAYOUT REFERENCE');
    } finally { await f.close(); }
  });

  it('anexo novo depois da triagem invalida o reaproveitamento', async () => {
    calls.parse.mockResolvedValue(leitura([]));
    calls.decide.mockImplementation(decidir());
    const f = await montar();
    try {
      const triagem = await f.app.triar(PEDIDO);
      const referencia = await f.app.uploadAnexo({ nome: 'ref.png', dados: await png() }, 'referencia');
      await f.app.submitDemand({ briefing: PEDIDO, triagemId: triagem.id, anexos: [referencia.id] }); await f.bus.whenIdle();
      expect(calls.decide).toHaveBeenCalledTimes(2);
      await f.app.submitDemand({ briefing: `${PEDIDO} Texto novo.`, triagemId: triagem.id }); await f.bus.whenIdle();
      expect(calls.decide).toHaveBeenCalledTimes(3);
    } finally { await f.close(); }
  });

  it('sem fotos, antes e depois avisa antes de chegar à produção', async () => {
    calls.parse.mockResolvedValue(leitura([]));
    calls.decide.mockImplementation(decidir({ tipo_arte: 'antes_depois_1' }));
    const f = await montar();
    try { expect((await f.app.triar('Antes e depois de botox para a Royal Face Maringá')).alertas.join()).toContain('duas fotos reais'); }
    finally { await f.close(); }
  });

  it('leitura falhou: a triagem continua, com trechos na classificadora, regras e alerta', async () => {
    calls.parse.mockRejectedValue(Object.assign(new Error('boom'), { status: 400 }));
    calls.decide.mockImplementation(decidir());
    const f = await montar();
    try {
      const triagem = await f.app.triar(PEDIDO);
      expect(triagem.etapas.find(etapa => etapa.id === 'leitura_texto')).toMatchObject({ status: 'falhou', tokens: { entrada: 0, saida: 0 } });
      expect(calls.decide.mock.calls[0]![0].questions.some((q: Pergunta) => q.name.startsWith('trecho_'))).toBe(true);
      expect(triagem.briefing).toContainEqual(expect.objectContaining({ tipo: 'preco', valor: '6x de R$ 99,90' }));
      expect(triagem.alertas.join()).toContain('leitura do texto por IA falhou');
    } finally { await f.close(); }
  });

  it('erro da Decisions API vira 502 sem expor o fornecedor', async () => {
    calls.parse.mockResolvedValue(leitura([]));
    calls.decide.mockRejectedValue(Object.assign(new Error('401 chave secreta'), { status: 401 }));
    const f = await montar();
    try { await expect(f.app.triar(PEDIDO)).rejects.toMatchObject({ code: 'UPSTREAM_ERROR', status: 502, message: 'Falha no classificador de IA.' }); }
    finally { await f.close(); }
  });

  it('a classificadora troca nas Configurações: Jev fica com as escolhas, Luna segue lendo o texto', async () => {
    calls.parse.mockResolvedValue(leitura([{ tipo: 'chamada_cta', valor: 'Agende pelo WhatsApp', trecho: 'CTA: Agende pelo WhatsApp' }]));
    const resposta = (choice: string, keys: string[]) => ({ type: 'choice', choice, confidence: 0.9, probabilities: Object.fromEntries(keys.map(key => [key, key === choice ? 1 : 0])) });
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async () => Response.json({ model: 'jev-1', usage: { input_tokens: 100, output_tokens: 0 }, answers: { procedimento: resposta('botox', ['preenchimento_labial', 'botox', 'fios_sustentacao']), tipo_arte: resposta('banco_imagem_1', ['antes_depois_1', 'antes_depois_2', 'banco_imagem_1', 'banco_imagem_2']), agente: resposta('van_gogh', ['van_gogh', 'monalisa']) } }));
    const f = await fixture({}, { apiKey: 'test-local-stub', jevApiKey: 'chave-jev', fetch: fetcher });
    try {
      await f.app.ia.salvarModelos({ ...f.app.ia.modelos(), triagem: { modelo: 'jev-latest', effort: null }, leitura_briefing: { modelo: 'gpt-6-luna', effort: null } });
      const triagem = await f.app.triar(PEDIDO);
      expect(triagem).toMatchObject({ provider: 'jev', modelo: 'jev-1', procedimento: 'botox' });
      expect(fetcher).toHaveBeenCalledTimes(1); expect(calls.decide).not.toHaveBeenCalled(); expect(calls.parse).toHaveBeenCalledTimes(1);
      expect(triagem.etapas.map(etapa => etapa.id)).toEqual(['regras', 'leitura_texto', 'decisoes']);
      await f.app.ia.salvarModelos({ ...f.app.ia.modelos(), triagem: { modelo: 'simulado', effort: null }, leitura_briefing: { modelo: 'simulado', effort: null } });
      const simulada = await f.app.triar(PEDIDO);
      expect(simulada.provider).toBe('mock');
      expect(simulada.etapas.map(etapa => etapa.status)).toEqual(['ok', 'simulada', 'simulada']);
      expect(fetcher).toHaveBeenCalledTimes(1);
    } finally { await f.close(); }
  });

  it('modo simulado também entrega briefing estruturado à demanda', async () => {
    const f = await fixture({ PRODUCAO_MANUAL_VAN_GOGH: true });
    try {
      const criada = await f.app.submitDemand({ briefing: 'Arte de botox por 199 reais, com uma mulher morena, sem falar em desconto' }); await f.bus.whenIdle();
      expect(f.app.getDemanda(criada.id)!.briefingItens!.map(item => item.tipo)).toEqual(['preco', 'modelo_foto', 'restricao']);
    } finally { await f.close(); }
  });
});
