import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { FileStateStore } from './FileStateStore';
import { FsAcervoStorage } from './FsAcervoStorage';
import { emptyState } from './interfaces';
import { EventBus } from './EventBus';
import { FakeClock, NanoIdGenerator } from './Clock';
import { allocateId, createDemanda } from './demandaFactory';

describe('adapters filesystem', () => {
  it('persiste estado atomicamente, preserva contador e não mascara JSON corrompido', async () => {
    const root = await mkdtemp(join(tmpdir(), 'awr-state-'));
    try {
      const store = new FileStateStore(root); expect(await store.load()).toEqual(emptyState());
      const bus = new EventBus(store, new FakeClock(), new NanoIdGenerator(), 5); await bus.hydrate();
      const ids = await Promise.all(Array.from({ length: 20 }, () => bus.transaction(state => {
        const id = allocateId(state); state.demandas[id] = createDemanda(id, 'cliente', { briefing: 'Teste' }, bus.clock.now().toISOString()); return id;
      })));
      expect(new Set(ids).size).toBe(20); expect((await new FileStateStore(root).load()).sequence).toBe(20);
      expect(await readdir(root)).toEqual(['state.json']);
      expect(JSON.parse(await readFile(join(root, 'state.json'), 'utf8')).demandas['DEM-0020']).toBeDefined();
      await bus.stop(); await writeFile(join(root, 'state.json'), '{broken');
      await expect(store.load()).rejects.toThrow();
    } finally { await rm(root, { recursive: true, force: true }); }
  });
  it('cria pastas, move PNG/meta e rejeita traversal e sobrescrita de final', async () => {
    const root = await mkdtemp(join(tmpdir(), 'awr-acervo-'));
    try {
      const storage = new FsAcervoStorage(root); await storage.initialize();
      expect((await readdir(root)).sort()).toEqual(['_references', '_staging', 'botox', 'fios_sustentacao', 'preenchimento_labial']);
      await storage.write('_staging/DEM-0001__v1.png', Buffer.from('png'));
      await storage.move('_staging/DEM-0001__v1.png', 'botox/botox__antes_depois_1__DEM-0001.png');
      expect((await storage.read('botox/botox__antes_depois_1__DEM-0001.png')).toString()).toBe('png');
      await storage.write('_staging/DEM-0001__v1.png', Buffer.from('png2'));
      await expect(storage.move('_staging/DEM-0001__v1.png', 'botox/botox__antes_depois_1__DEM-0001.png')).rejects.toThrow('já existe');
      for (const path of ['../outside', '/absolute', 'C:/drive', 'botox\\escape', 'botox/../../escape']) await expect(storage.write(path, Buffer.from('x'))).rejects.toThrow();
      const close = await storage.watch(() => undefined, () => undefined); await close();
    } finally { await rm(root, { recursive: true, force: true }); }
  });
});
