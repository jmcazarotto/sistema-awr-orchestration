import { describe, expect, it, vi } from 'vitest';
import sharp from 'sharp';
import { DemandaAnexos } from './DemandaAnexos';
import { MemoryAcervoStorage } from '../core/MemoryAcervoStorage';
import { VisionReviewer } from './VisionReviewer';
import { BrainLoader } from '../brain/BrainLoader';
import { ArteMetaSchema } from '../../shared/types';
import { fixture } from '../test-support';
import { AiClient } from './AiClient';

const photo = (background: string, width = 400, height = 400) => sharp({ create: { width, height, channels: 3, background } }).png().toBuffer();
const layout = () => sharp(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1350"><rect width="1080" height="1350" fill="#eee"/><rect x="70" y="300" width="450" height="450" fill="#d0b090"/><rect x="560" y="300" width="450" height="450" fill="#a0b0c0"/><rect x="700" y="1000" width="250" height="100" fill="#ff00ff"/></svg>')).png().toBuffer();
const pixel = async (buffer: Buffer, left: number, top: number) => [...await sharp(buffer).extract({ left, top, width: 1, height: 1 }).removeAlpha().raw().toBuffer()];

describe('anexos persistentes da demanda', () => {
  it('valida conteúdo, normaliza e recupera os arquivos por ID', async () => {
    const storage = new MemoryAcervoStorage(); const store = new DemandaAnexos(storage);
    const dados = await photo('#aa3322');
    const antes = await store.upload({ nome: '../antes.png', dados }, 'antes');
    const depois = await store.upload({ nome: 'depois.png', dados }, 'depois');
    expect(antes).toMatchObject({ nome: 'antes.png', papel: 'antes', largura: 400, altura: 400 });
    expect(await new DemandaAnexos(storage).resolve([antes.id, depois.id])).toEqual([antes, depois]);
    await expect(store.resolve([antes.id])).rejects.toThrow('duas fotos');
    await expect(store.resolve(['anx_000000000000000000000'])).rejects.toThrow('não encontrado');
    await expect(store.upload({ nome: 'fake.png', dados: Buffer.from('<svg/>') }, 'referencia')).rejects.toThrow('válida');
    await expect(store.upload({ nome: 'too-big.png', dados: Buffer.alloc(10 * 1024 * 1024 + 1) }, 'referencia')).rejects.toThrow('10 MB');
    await expect(store.resolve(['../brain/clientes.json'])).rejects.toThrow();
  });
  it('leva fotos e referências até o Van Gogh, envia as fontes para a IA e preserva a montagem gerada nos ajustes', async () => {
    const generated = await layout();
    const mock = vi.spyOn(AiClient.prototype, 'photo').mockResolvedValue({ buffer: generated, modelo: 'gpt-image-2', qualidade: 'medium', custo: { usd: 0, tokensEntrada: 0, tokensSaida: 0 } });
    const scan = vi.spyOn(AiClient.prototype, 'json').mockResolvedValue({ regioes: [{ x: 100, y: 100, largura: 800, altura: 800 }] });
    const f = await fixture({ IMAGE_ENGINE_MODE: 'openai' }, { apiKey: 'test-key' });
    try {
      const antes = await f.app.uploadAnexo({ nome: 'antes.png', dados: await photo('#aa3322') }, 'antes');
      const depois = await f.app.uploadAnexo({ nome: 'depois.png', dados: await photo('#2244aa') }, 'depois');
      const ref1 = await f.app.uploadAnexo({ nome: 'ref1.png', dados: await photo('#fff') }, 'referencia');
      const ref2 = await f.app.uploadAnexo({ nome: 'ref2.png', dados: await photo('#ddd') }, 'referencia');
      const input = { briefing: 'Cliente Royal Face, preenchimento labial, antes e depois.', clinicaNome: 'Royal Face', procedimento: 'preenchimento_labial' as const, anexos: [antes.id, depois.id, ref1.id, ref2.id] };
      const created = await f.app.submitDemand(input); await f.bus.whenIdle();
      const demand = f.app.getDemanda(created.id)!;
      expect(demand.estado).toBe('AGUARDANDO_APROVACAO_AWR');
      expect(demand.classificacao?.tipoTemplate).toBe('antes_depois_1');
      expect(demand.anexos).toEqual([antes, depois, ref1, ref2]);
      expect(mock).toHaveBeenCalledTimes(1);
      expect(mock.mock.calls[0]![0]).toContain('USER REFERENCES TAKE PRIORITY');
      expect(mock.mock.calls[0]![0]).toContain('IMAGE 1: SOURCE BEFORE');
      expect(mock.mock.calls[0]![0]).toContain('IMAGE 2: SOURCE AFTER');
      expect(mock.mock.calls[0]![0]).toContain('IMAGE 3: CLIENT LAYOUT REFERENCE');
      expect(mock.mock.calls[0]![0]).toContain('NO later photo overlay');
      expect(mock.mock.calls[0]![1]).toHaveLength(4);
      const sent = mock.mock.calls[0]![1] as Buffer[];
      expect(sent[0]).toEqual(await f.storage.read(antes.arquivo));
      expect(sent[1]).toEqual(await f.storage.read(depois.arquivo));
      expect(await pixel(sent[2]!, 0, 0)).toEqual([255, 255, 255]);
      expect(await pixel(sent[2]!, 200, 200)).toEqual([216, 216, 216]); // reference patients removed before generation
      expect(await pixel(sent[3]!, 0, 0)).toEqual([221, 221, 221]);
      expect(await pixel(await f.storage.read(demand.stagingPath!), 300, 500)).toEqual([208, 176, 144]);
      expect(await pixel(await f.storage.read(demand.stagingPath!), 800, 500)).toEqual([160, 176, 192]);
      expect(f.app.listMessages({ demandaId: demand.id }).find(m => m.action === 'PRODUZIR_ARTE')?.payload).toMatchObject({ anexos: demand.anexos });
      const meta = ArteMetaSchema.parse(JSON.parse((await f.storage.read(demand.stagingPath!.replace('.png', '.meta.json'))).toString()));
      expect(meta.composicaoFotos).toBe('ia_integrada');
      const brain = new BrainLoader(f.config.BRAIN_DIR, f.clock);
      const context = await brain.context('preenchimento_labial', 'antes_depois_1', 'Royal Face', { marcaId: meta.arteFinal!.marca });
      const review = scan.mockResolvedValueOnce({ aprovada: true, score: 1, itens: context.rubrica.map(item => ({ id: item.id, severidade: item.severidade, resposta: 'sim', evidencia: 'test' })), feedback: { resumo: 'ok', correcoes: [] } });
      try {
        await new VisionReviewer({ ...f.config, AI_MODE: 'openai' }, f.storage, brain, new AiClient(f.config, f.bus, 'test-key')).review(demand, demand.stagingPath!, 1);
        expect(review.mock.calls.at(-1)![4]).toHaveLength(5); // final + all source attachments
        expect(JSON.parse(review.mock.calls.at(-1)![3]).imagens).toHaveLength(5);
      } finally { scan.mockResolvedValue({ regioes: [{ x: 100, y: 100, largura: 800, altura: 800 }] }); }

      await f.app.humanReview(demand.id, { decisao: 'ajustar', motivo: 'Ajustar a margem superior do título.', revisor: 'Teste' }); await f.bus.whenIdle();
      expect(f.app.getDemanda(demand.id)?.versaoAtual).toBe(2);
      expect(f.app.listMessages({ demandaId: demand.id }).find(m => m.action === 'AJUSTAR_ARTE')?.payload).toMatchObject({ anexos: demand.anexos });
      expect(mock.mock.calls[1]![1]).toHaveLength(4); // originals + sanitized references, no old patient images
      expect(mock.mock.calls[1]![0]).not.toContain('IMAGE 5:');
      expect((mock.mock.calls[1]![1] as Buffer[])[0]).toEqual(sent[0]);
      expect((mock.mock.calls[1]![1] as Buffer[])[1]).toEqual(sent[1]);
      await expect(f.app.submitDemand({ ...input, tipoTemplate: 'banco_imagem_1' })).rejects.toThrow('template de antes e depois');
    } finally { await f.close(); mock.mockRestore(); scan.mockRestore(); }
  });
  it('Monalisa também recebe o par real e as referências; Van Gogh sem o par não chama a IA', async () => {
    const mock = vi.spyOn(AiClient.prototype, 'photo').mockResolvedValue({ buffer: await layout(), modelo: 'gpt-image-2', qualidade: 'medium', custo: { usd: 0, tokensEntrada: 0, tokensSaida: 0 } });
    const scan = vi.spyOn(AiClient.prototype, 'json').mockResolvedValue({ regioes: [] });
    const f = await fixture({}, { apiKey: 'test-key' });
    try {
      await f.app.ia.salvarModelos({ ...f.app.ia.modelos(), imagem_monalisa: { modelo: 'gpt-image-2', effort: 'medio' }, imagem_van_gogh: { modelo: 'gpt-image-2', effort: 'medio' } });
      const anexos = await Promise.all((['antes', 'depois', 'referencia'] as const).map(async papel => f.app.uploadAnexo({ nome: `${papel}.png`, dados: await photo(papel === 'antes' ? '#aa3322' : '#2244aa') }, papel)));
      const created = await f.app.submitDemand({ briefing: 'Abastecer o acervo com preenchimento labial antes e depois.', anexos: anexos.map(a => a.id) }); await f.bus.whenIdle();
      const d = f.app.getDemanda(created.id)!;
      expect(d).toMatchObject({ criadorAtual: 'monalisa', origem: 'acervo', estado: 'AGUARDANDO_APROVACAO_AWR', anexos });
      expect(mock.mock.calls[0]![2]).toBe('imagem_monalisa');
      const missing = await f.app.submitDemand({ briefing: 'Cliente precisa de antes e depois de botox.' }); await f.bus.whenIdle();
      expect(f.app.getDemanda(missing.id)?.producao).toMatchObject({ etapa: 'erro' });
      expect(f.app.getDemanda(missing.id)?.producao?.erro).toContain('duas fotos reais');
      expect(mock).toHaveBeenCalledTimes(1);
    } finally { await f.close(); mock.mockRestore(); scan.mockRestore(); }
  });
});
