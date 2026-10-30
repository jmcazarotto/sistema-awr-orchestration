import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { PROCEDIMENTOS, TIPOS_TEMPLATE, OrchestratorConfigSchema } from '../../shared/types';
import type { ReviewItem } from '../../shared/types';
import { BrainLoader } from '../brain/BrainLoader';
import { createDemanda } from '../core/demandaFactory';
import { ImageEngine, escapeXml, wrapText } from './ImageEngine';
import { TEMPLATE_GEOMETRY } from './templateGeometry';
import { rubricaAprovada, seededRng } from './VisionReviewer';
import { FastClassifier } from './FastClassifier';
import { fixture } from '../test-support';

describe('serviços', () => {
  it('aplica todos os críticos e pelo menos 80% dos normais', () => {
    const normal = (resposta: 'sim' | 'nao'): ReviewItem => ({ id: 'R01', severidade: 'normal', resposta, evidencia: 'Teste' });
    expect(rubricaAprovada([normal('sim'), normal('sim'), normal('sim'), normal('sim'), normal('nao')])).toBe(true);
    expect(rubricaAprovada([normal('sim'), normal('sim'), normal('sim'), normal('nao'), normal('nao')])).toBe(false);
    expect(rubricaAprovada([{ ...normal('nao'), severidade: 'critico' }])).toBe(false);
    expect(rubricaAprovada([{ ...normal('sim'), severidade: 'critico' }])).toBe(true);
    const a = seededRng('a'); const b = seededRng('a'); expect([a(), a(), a()]).toEqual([b(), b(), b()]);
  });
  it('classificador usa heurísticas PT-BR e mantém restrições explícitas', async () => {
    const classifier = new FastClassifier();
    expect(await classifier.classify({ briefing: 'Botox antes e depois empilhado' })).toMatchObject({ procedimento: 'botox', tipoTemplate: 'antes_depois_2', agenteDesignado: 'van_gogh' });
    expect(await classifier.classify({ briefing: 'Botox antes e depois', procedimento: 'fios_sustentacao', tipoTemplate: 'banco_imagem_2' })).toMatchObject({ procedimento: 'fios_sustentacao', tipoTemplate: 'banco_imagem_2' });
    expect(await new FastClassifier().classify({ briefing: 'Botox' })).toMatchObject({ procedimento: 'botox' });
    const start = performance.now(); await classifier.classify({ briefing: 'Botox' }); expect(performance.now() - start).toBeLessThan(150);
  });
  it('geometria hardcoded coincide com todas as linhas do Markdown real', async () => {
    const f = await fixture();
    try {
      const composition = await new BrainLoader(f.config.BRAIN_DIR, f.clock).loadSkill('template_composition');
      for (const template of TIPOS_TEMPLATE) {
        const parsed = Object.fromEntries([...(composition.templates[template] ?? '').matchAll(/^\| (\w+) \| (\d+) \| (\d+) \| (\d+) \| (\d+) \|/gm)].map(match => [match[1], { x: Number(match[2]), y: Number(match[3]), w: Number(match[4]), h: Number(match[5]) }]));
        expect(TEMPLATE_GEOMETRY[template]).toEqual(parsed);
      }
    } finally { await f.close(); }
  });
  it('gera os 12 pares como PNG 1080×1350 com texto completo e metadados válidos', async () => {
    const f = await fixture();
    try {
      const images = new ImageEngine(f.config, f.storage, new BrainLoader(f.config.BRAIN_DIR, f.clock), f.clock);
      let count = 0;
      for (const procedimento of PROCEDIMENTOS) for (const tipoTemplate of TIPOS_TEMPLATE) {
        const demanda = createDemanda(`DEM-${String(++count).padStart(4, '0')}`, 'cliente', { briefing: 'Cuidados com segurança', clinicaNome: 'Clínica <Teste> & Filhos' }, f.clock.now().toISOString());
        demanda.classificacao = { procedimento, tipoTemplate, agenteDesignado: 'van_gogh', skillFile: `skills/${procedimento}.skill.md`, confianca: 1 }; demanda.criadorAtual = 'van_gogh';
        const result = await images.generate(demanda, 1);
        expect(await sharp(await f.storage.read(result.path)).metadata()).toMatchObject({ format: 'png', width: 1080, height: 1350 });
        expect(result.meta.textos.disclaimer).toBe('Imagem ilustrativa. Resultados podem variar de pessoa para pessoa. Procedimento realizado por profissional habilitado.');
        expect(result.meta.promptUsado).not.toContain('{{'); expect(result.meta.ilustrativo).toBe(true);
      }
      expect((await f.storage.list()).filter(path => path.endsWith('.png'))).toHaveLength(12);
      expect(escapeXml('<a & "b">')).toBe('&lt;a &amp; &quot;b&quot;&gt;'); expect(wrapText('palavra '.repeat(50), 200, 30, 2)).toHaveLength(2);
    } finally { await f.close(); }
  }, 30000);
  it('compõe também stories 1080×1920 sem alterar o template escolhido', async () => {
    const f = await fixture({ IMAGE_SIZE: '1080x1920' });
    try {
      const demand = await f.app.submitDemand({ briefing: 'Fios de sustentação', tipoTemplate: 'antes_depois_2' }); await f.bus.whenIdle();
      const result = f.app.getDemanda(demand.id)!;
      expect(await sharp(await f.storage.read(result.stagingPath!)).metadata()).toMatchObject({ width: 1080, height: 1920 });
      expect(result.classificacao?.tipoTemplate).toBe('antes_depois_2');
    } finally { await f.close(); }
  });
});
