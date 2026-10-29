import { beforeEach, describe, expect, it, vi } from 'vitest';
import sharp from 'sharp';
import { fixture } from './test-support';

const calls = vi.hoisted(() => ({ parse: vi.fn(), generate: vi.fn(), edit: vi.fn() }));
vi.mock('openai', () => ({ default: class { responses = { parse: calls.parse }; images = { generate: calls.generate, edit: calls.edit }; }, toFile: vi.fn() }));

const foto = async () => (await sharp({ create: { width: 1088, height: 1360, channels: 3, background: '#d9b4a1' } }).png().toBuffer()).toString('base64');
const usage = { input_tokens: 100, input_tokens_details: { text_tokens: 100, image_tokens: 0 }, output_tokens: 4000, total_tokens: 4100 };

describe('produção manual do Van Gogh', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('demanda de cliente aguarda "Produzir"; simulado percorre as etapas sem custo', async () => {
    const f = await fixture({ PRODUCAO_MANUAL_VAN_GOGH: true });
    try {
      const criada = await f.app.submitDemand({ briefing: 'Preenchimento labial antes e depois', clinicaNome: 'Royal Face' }); await f.bus.whenIdle();
      const aguardando = f.app.getDemanda(criada.id)!;
      expect(aguardando).toMatchObject({ estado: 'CLASSIFICADA', criadorAtual: 'van_gogh', producao: { etapa: 'aguardando', modelo: 'simulado', versao: 0 } });
      await expect(f.app.resetHops(criada.id)).rejects.toThrow();
      await f.app.produzir(criada.id); await f.bus.whenIdle();
      const pronta = f.app.getDemanda(criada.id)!;
      expect(pronta.estado).toBe('AGUARDANDO_APROVACAO_AWR');
      expect(pronta.producao?.etapas.map(e => e.etapa)).toEqual(['aguardando', 'na_fila', 'planejando', 'gerando', 'compondo', 'entregue']);
      expect(pronta.producao).toMatchObject({ etapa: 'entregue', versao: 1, modelo: 'simulado' });
      expect(pronta.producao?.custo).toBeUndefined();
      await expect(f.app.produzir(criada.id)).rejects.toThrow('já está em produção');
      expect(calls.generate).not.toHaveBeenCalled();
    } finally { await f.close(); }
  });

  it('modelo escolhido nas Configurações gera na OpenAI, com qualidade, custo por tokens e uso por modelo', async () => {
    calls.generate.mockResolvedValue({ data: [{ b64_json: await foto() }], usage });
    const f = await fixture({ PRODUCAO_MANUAL_VAN_GOGH: true, MOCK_REJECT_RATE: 1, USD_BRL: 5 }, { apiKey: 'test-local-stub' });
    try {
      await f.app.ia.salvarModelos({ ...f.app.ia.modelos(), imagem_van_gogh: { modelo: 'gpt-image-2.5-flare', effort: 'alto' } });
      const criada = await f.app.submitDemand({ briefing: 'Botox banco de imagem', clinicaNome: 'Royal Face' }); await f.bus.whenIdle();
      expect(f.app.getDemanda(criada.id)?.producao?.modelo).toBe('gpt-image-2.5-flare');
      await f.app.produzir(criada.id); await f.bus.whenIdle();
      expect(calls.generate).toHaveBeenCalledTimes(1);
      expect(calls.generate.mock.calls[0]![0]).toMatchObject({ model: 'gpt-image-2.5-flare', quality: 'high' });
      const demanda = f.app.getDemanda(criada.id)!;
      const usd = (100 * 5 + 4000 * 30) / 1e6;
      // Reprovação simulada não recai sobre imagem paga: segue direto para a AWR.
      expect(demanda.estado).toBe('AGUARDANDO_APROVACAO_AWR');
      expect(demanda.producao).toMatchObject({ etapa: 'entregue', modelo: 'gpt-image-2.5-flare', qualidade: 'high', custo: { usd, brl: usd * 5, tokensEntrada: 100, tokensSaida: 4000 } });
      expect(f.app.ia.uso().itens.find(i => i.modelo === 'gpt-image-2.5-flare')).toMatchObject({ tipo: 'imagem', chamadas: 1, usd, brl: usd * 5 });
    } finally { await f.close(); }
  });

  it('erro da OpenAI para na etapa "erro" sem nova cobrança automática; "Tentar novamente" refaz', async () => {
    calls.generate.mockRejectedValueOnce(Object.assign(new Error('Invalid size for this model'), { status: 400 }));
    const f = await fixture({ PRODUCAO_MANUAL_VAN_GOGH: true }, { apiKey: 'test-local-stub' });
    try {
      await f.app.ia.salvarModelos({ ...f.app.ia.modelos(), imagem_van_gogh: { modelo: 'gpt-image-2.5-sunburst', effort: 'baixo' } });
      const criada = await f.app.submitDemand({ briefing: 'Fios de sustentação banco de imagem' }); await f.bus.whenIdle();
      await f.app.produzir(criada.id); await f.bus.whenIdle();
      const falha = f.app.getDemanda(criada.id)!;
      expect(falha.producao).toMatchObject({ etapa: 'erro' });
      expect(falha.producao?.erro).toContain('Invalid size');
      expect(calls.generate).toHaveBeenCalledTimes(1); // 4xx não é repetido
      await f.clock.advance(15 * 60 * 1000); await f.bus.whenIdle();
      expect(calls.generate).toHaveBeenCalledTimes(1); // scheduler não reenvia produção com erro
      calls.generate.mockResolvedValue({ data: [{ b64_json: await foto() }], usage });
      await f.app.produzir(criada.id); await f.bus.whenIdle();
      expect(f.app.getDemanda(criada.id)).toMatchObject({ estado: 'AGUARDANDO_APROVACAO_AWR', producao: { etapa: 'entregue', modelo: 'gpt-image-2.5-sunburst', qualidade: 'low' } });
    } finally { await f.close(); }
  });

  it('arte final Royal Face: referências da marca como apoio, textos exatos, logo oficial aplicado e rubrica R+M+T', async () => {
    calls.edit.mockResolvedValue({ data: [{ b64_json: await foto() }], usage });
    const f = await fixture({ PRODUCAO_MANUAL_VAN_GOGH: true }, { apiKey: 'test-local-stub' });
    try {
      const jpg = await sharp({ create: { width: 1080, height: 1350, channels: 3, background: '#E6DDCF' } }).jpeg().toBuffer();
      for (const ref of (await f.app.marcas.get('royal_face'))!.referencias) await f.storage.write(ref.arquivo, jpg);
      await f.storage.write('_marcas/royal_face/logo-claro.png', await sharp({ create: { width: 400, height: 160, channels: 4, background: '#000000' } }).png().toBuffer());
      await f.app.empresas.upsert({ ...(await f.app.empresas.get('royal_face'))!, logos: { claro: '_marcas/royal_face/logo-claro.png', escuro: null } });
      await f.app.ia.salvarModelos({ ...f.app.ia.modelos(), imagem_van_gogh: { modelo: 'gpt-image-2', effort: 'medio' } });
      const criada = await f.app.submitDemand({ briefing: 'Preenchimento labial banco de imagem para a Royal Face Castanhal com 6x de R$ 99,90' }); await f.bus.whenIdle();
      await f.app.produzir(criada.id); await f.bus.whenIdle();
      expect(calls.edit).toHaveBeenCalledTimes(1);
      const pedido = calls.edit.mock.calls[0]![0] as { image: unknown[]; prompt: string };
      expect(pedido.image).toHaveLength(3);
      expect(pedido.prompt).toContain('"6x de R$ 99,90"'); expect(pedido.prompt).toContain('NEVER use blue'); expect(pedido.prompt).not.toMatch(/\{\{\w+\}\}/);
      const demanda = f.app.getDemanda(criada.id)!;
      expect(demanda.estado).toBe('AGUARDANDO_APROVACAO_AWR');
      const meta = JSON.parse((await f.storage.read(demanda.stagingPath!.replace(/\.png$/, '.meta.json'))).toString('utf8'));
      expect(meta.arteFinal).toMatchObject({ marca: 'royal_face', composicao: 'close_procedimento', logo: { variante: 'claro', arquivo: '_marcas/royal_face/logo-claro.png' } });
      expect(meta.arteFinal.referencias).toHaveLength(3);
      expect(demanda.ultimoReview?.itens.map(item => item.id[0])).toEqual(expect.arrayContaining(['R', 'M', 'T']));
    } finally { await f.close(); }
  });

  it('Van Gogh pausado não pega nada da fila; retomar processa o que ficou esperando (estado persistido)', async () => {
    const f = await fixture({ PRODUCAO_MANUAL_VAN_GOGH: true });
    try {
      await f.app.agentes.pausar('van_gogh');
      expect(f.app.agentes.pausados()).toEqual(['van_gogh']);
      const criada = await f.app.submitDemand({ briefing: 'Botox banco de imagem', clinicaNome: 'Royal Face' }); await f.bus.whenIdle();
      await f.app.produzir(criada.id); await f.bus.whenIdle();
      expect(f.app.getDemanda(criada.id)).toMatchObject({ estado: 'EM_PRODUCAO', versaoAtual: 0, producao: { etapa: 'na_fila' } });
      await f.clock.advance(15 * 60 * 1000); await f.bus.whenIdle();
      expect(f.app.getDemanda(criada.id)?.producao?.etapa).toBe('na_fila'); // scheduler não cobra agente pausado
      expect((await f.stateStore.load()).pausados).toEqual(['van_gogh']);
      await f.app.agentes.retomar('van_gogh'); await f.bus.whenIdle();
      expect(f.app.getDemanda(criada.id)).toMatchObject({ estado: 'AGUARDANDO_APROVACAO_AWR', producao: { etapa: 'entregue' } });
      expect(f.app.agentes.pausados()).toEqual([]);
    } finally { await f.close(); }
  });
});
