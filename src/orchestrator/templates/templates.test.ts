import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { EmpresaSchema, TemplateArteSchema, TIPOS_TEMPLATE } from '../../shared/types';
import { ClientesRegistry } from '../brain/ClientesRegistry';
import { MemoryTemplateStore } from '../core/MemoryTemplateStore';
import { FsTemplateStore } from '../core/FsTemplateStore';
import { createTemplateSeeds, seedTemplates } from './seeds';
import { fixture } from '../test-support';

const empresa = EmpresaSchema.parse({ id: 'royal_face', nome: 'Royal Face' });
const timestamp = '2026-10-28T14:00:00.000Z';

describe('cadastro de empresas', () => {
  it('aplica defaults, preserva outras entradas/logo e rejeita IDs de unidade duplicados', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'awr-clientes-'));
    try {
      await writeFile(join(dir, 'clientes.json'), JSON.stringify([{ id: 'royal_face', nome: 'Royal Face' }]));
      const registry = new ClientesRegistry(dir);
      expect(await registry.list()).toEqual([empresa]);
      await registry.setLogo('royal_face', '_marcas/royal_face/logo.svg');
      await registry.upsert(EmpresaSchema.parse({ id: 'outra', nome: 'Outra' }));
      await registry.upsert({ ...empresa, logo: undefined, nome: 'Royal editada' });
      expect((await registry.list())[0]?.logo).toBe('_marcas/royal_face/logo.svg');
      await expect(registry.upsert({ ...empresa, unidades: [{ id: 'outra', nome: 'Outra', cidade: 'Belém', aliases: [] }] })).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
      const raw = await readFile(join(dir, 'clientes.json'), 'utf8');
      expect(raw).toContain('\n  {'); expect(JSON.parse(raw)).toHaveLength(2);
    } finally { await rm(dir, { recursive: true, force: true }); }
  });
});

describe('templates', () => {
  it('gera 12 seeds válidos com dois slots de cada fam?lia por procedimento', () => {
    const seeds = createTemplateSeeds(empresa, timestamp);
    expect(seeds).toHaveLength(12);
    for (const procedimento of empresa.procedimentos) {
      expect(seeds.filter(t => t.procedimento === procedimento).map(t => t.tipoTemplate)).toEqual([...TIPOS_TEMPLATE]);
      expect(seeds.filter(t => t.procedimento === procedimento && t.familia === 'antes_depois')).toHaveLength(2);
      expect(seeds.filter(t => t.procedimento === procedimento && t.familia === 'banco_imagem')).toHaveLength(2);
    }
    for (const seed of seeds) {
      expect(TemplateArteSchema.safeParse(seed).success).toBe(true);
      expect(new Set(seed.elementos.map(e => e.id)).size).toBe(seed.elementos.length);
      expect(seed.elementos.every(e => e.rotulo && e.x < 1080 && e.y < 1350 && e.x + e.w > 0 && e.y + e.h > 0)).toBe(true);
    }
    expect(seeds[0]?.elementos.find(e => e.id === 'foto_antes')).toMatchObject({ x: 68, y: 243, w: 460, h: 462 });
  });
  it('preserva edições ao semear novamente, em memória e no filesystem', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'awr-templates-'));
    try {
      for (const store of [new MemoryTemplateStore(), new FsTemplateStore(dir)]) {
        await seedTemplates(store, [empresa], timestamp);
        const template = (await store.list())[0]!;
        await store.save({ ...template, nome: 'Editado pelo usuário' });
        await seedTemplates(store, [empresa], '2026-10-29T14:00:00.000Z');
        expect((await store.get(template.id))?.nome).toBe('Editado pelo usuário');
        expect(await store.list()).toHaveLength(12);
      }
    } finally { await rm(dir, { recursive: true, force: true }); }
  });
  it('valida edição, aplica Clock, retorna NOT_FOUND e armazena logo pelo AcervoStorage', async () => {
    const f = await fixture();
    try {
      const templates = await f.app.templates.list({ empresaId: 'royal_face', procedimento: 'botox', familia: 'antes_depois' });
      expect(templates).toHaveLength(2);
      const t = templates[0]!;
      const input = { nome: 'Novo', fundo: '#000', elementos: t.elementos };
      await f.clock.advance(1000);
      expect((await f.app.templates.save(t.id, input)).atualizadoEm).toBe(f.clock.now().toISOString());
      await expect(f.app.templates.save(t.id, { ...input, elementos: [t.elementos[0]!, t.elementos[0]!] })).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
      await expect(f.app.templates.save(t.id, { ...input, elementos: [{ ...t.elementos[0]!, x: 1080 }] })).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
      await expect(f.app.templates.save('missing', input)).rejects.toMatchObject({ code: 'NOT_FOUND' });
      const updated = await f.app.empresas.setLogo('royal_face', { nome: 'marca.svg', dados: Buffer.from('<svg/>') });
      expect(await f.storage.read(updated.logo!)).toEqual(Buffer.from('<svg/>'));
      expect((await f.app.acervo.grid()).preenchidos).toBe(0);
      await f.app.empresas.upsert(EmpresaSchema.parse({ id: 'nova', nome: 'Nova', procedimentos: ['botox'] }));
      expect(await f.app.templates.list({ empresaId: 'nova' })).toHaveLength(4);
    } finally { await f.close(); }
  });
});
