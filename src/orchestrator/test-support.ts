import { mkdtemp, cp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { OrchestratorConfigSchema } from '../shared/types';
import type { OrchestratorConfig } from '../shared/types';
import { createOrchestratorWithDependencies } from './index';
import type { OrchestratorDependencies } from './index';
import { MemoryAcervoStorage } from './core/MemoryAcervoStorage';
import { MemoryStateStore } from './core/MemoryStateStore';
import { FakeClock } from './core/Clock';
import type { EventBus } from './core/EventBus';

export async function fixture(overrides: Partial<OrchestratorConfig> = {}, dependencies: OrchestratorDependencies = {}) {
  const root = await mkdtemp(join(tmpdir(), 'awr-engine-'));
  await cp(resolve('brain'), join(root, 'brain'), { recursive: true });
  const config = OrchestratorConfigSchema.parse({ ACERVO_AUTOFILL: false, MOCK_REJECT_RATE: 0, BRAIN_DIR: join(root, 'brain'), DATA_DIR: join(root, 'data'), ACERVO_DIR: join(root, 'acervo'), ...overrides });
  const storage = new MemoryAcervoStorage(); const stateStore = new MemoryStateStore(); const clock = new FakeClock();
  const app = createOrchestratorWithDependencies(config, { storage, stateStore, clock, watchFiles: false, ...dependencies });
  const bus = app.bus as EventBus;
  await app.start();
  return { root, app, bus, config, clock, storage, stateStore, close: async () => { await app.stop(); await rm(root, { recursive: true, force: true }); } };
}
