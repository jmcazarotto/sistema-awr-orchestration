import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { nanoid } from 'nanoid';
import { emptyState, EngineStateSchema } from './interfaces';
import type { EngineState, StateStore } from './interfaces';

export class FileStateStore implements StateStore {
  constructor(private readonly directory: string) {}
  async load(): Promise<EngineState> {
    await mkdir(this.directory, { recursive: true });
    try { return EngineStateSchema.parse(JSON.parse(await readFile(join(this.directory, 'state.json'), 'utf8'))); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return emptyState(); throw error; }
  }
  async save(state: EngineState): Promise<void> {
    await mkdir(this.directory, { recursive: true });
    const tmp = join(this.directory, `state.${nanoid()}.tmp`);
    await writeFile(tmp, JSON.stringify(EngineStateSchema.parse(state), null, 2), 'utf8');
    await rename(tmp, join(this.directory, 'state.json'));
  }
}
