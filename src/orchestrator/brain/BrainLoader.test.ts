import { readFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { BrainLoader, parseFrontMatter } from './BrainLoader';
import { FakeClock } from '../core/Clock';
import { PROCEDIMENTOS, TIPOS_TEMPLATE } from '../../shared/types';
import { fixture } from '../test-support';

describe('BrainLoader', () => {
  const brain = new BrainLoader(resolve('brain'), new FakeClock());
  it('faz parsing das quatro skills reais, templates só da seção 3 e rubrica R01…', async () => {
    for (const id of [...PROCEDIMENTOS, 'template_composition' as const]) {
      const skill = await brain.loadSkill(id);
      expect(Object.keys(skill.templates)).toEqual([...TIPOS_TEMPLATE]); expect(skill.promptBase).toContain('{{template_id}}');
      expect(skill.rubrica.length).toBe(id === 'template_composition' ? 10 : 14);
      expect(skill.rubrica.map(item => item.id)).toEqual(Array.from({ length: skill.rubrica.length }, (_, i) => `R${String(i + 1).padStart(2, '0')}`));
      expect(skill.templates).not.toHaveProperty('Compliance'); expect(skill.disclaimer).toContain('Imagem ilustrativa. Resultados podem variar');
    }
    for (const actor of ['art_director', 'van_gogh', 'monalisa'] as const) expect((await brain.loadAgent(actor)).systemPrompt).toContain('Nunca');
  });
  it('parseia YAML simples, comentários e objetos/listas sem dependência adicional', () => {
    expect(parseFrontMatter('---\nid: botox # teste\nversao: 2\nmodelos: { imagem: IMAGE_MODEL, ativos: [um, dois] }\nlabel: "Cor #1"\n---\n')).toEqual({ id: 'botox', versao: 2, modelos: { imagem: 'IMAGE_MODEL', ativos: ['um', 'dois'] }, label: 'Cor #1' });
  });
  it('lê as memórias reais e ignora Status exemplo no contexto ativo', async () => {
    const memories = await brain.loadMemories(); expect(memories.map(item => item.id)).toEqual(['G01', 'G02', 'G03', 'C01']);
    expect(memories.find(item => item.id === 'C01')?.status).toBe('exemplo');
    const context = await brain.context('botox', 'antes_depois_1', 'Royal Face Castanhal');
    expect(context.aprendizados.map(item => item.id)).toEqual(['G01', 'G02', 'G03']);
    expect(context.rubrica.some(item => item.id === 'C01')).toBe(false);
  });
  it('append-only atômico e serial preserva byte a byte todo conteúdo anterior', async () => {
    const f = await fixture();
    try {
      const path = join(f.config.BRAIN_DIR, 'skills/procedimentos/botox.skill.md'); const before = await readFile(path, 'utf8');
      const loader = new BrainLoader(f.config.BRAIN_DIR, f.clock, f.bus);
      await Promise.all(['selo cobriu boca', 'texto sem contraste'].map(motivo => loader.appendLearning({ procedimento: 'botox', template: 'antes_depois_1', regra: 'Mantenha textos e selo fora da região tratada.', motivoOriginal: motivo, demandaId: 'DEM-0001' })));
      const after = await readFile(path, 'utf8'); expect(after.startsWith(before)).toBe(true);
      expect(after.slice(before.length)).toContain('### L01'); expect(after.slice(before.length)).toContain('### L02');
      expect(before).toContain('<!-- APPEND-ONLY:');
      const context = await loader.context('botox', 'antes_depois_1'); expect(context.aprendizados.filter(item => item.id.startsWith('L'))).toHaveLength(2);
      expect((await loader.context('botox', 'antes_depois_2')).aprendizados.filter(item => item.id.startsWith('L'))).toHaveLength(0);
      await loader.appendLearning({ escopo: 'global', regra: 'Mantenha a margem de segurança.', motivoOriginal: 'cortou', demandaId: 'DEM-0001' });
      expect((await loader.loadMemories()).find(item => item.id === 'G04')?.regra).toContain('margem');
      expect(f.bus.history(10).filter(event => event.type === 'brain.learning')).toHaveLength(3);
    } finally { await f.close(); }
  });
});
