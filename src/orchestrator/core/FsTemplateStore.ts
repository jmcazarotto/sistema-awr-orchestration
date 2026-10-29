import { mkdir, readFile, readdir, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { nanoid } from 'nanoid';
import { TemplateArteSchema } from '../../shared/types';
import type { TemplateArte } from '../../shared/types';
import type { TemplateStore } from './interfaces';

export class FsTemplateStore implements TemplateStore {
  private readonly directory: string;
  constructor(dataDir: string) { this.directory = join(dataDir, 'templates'); }
  async list(): Promise<TemplateArte[]> {
    let files: string[];
    try { files = await readdir(this.directory); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []; throw error; }
    const entries = await Promise.all(files.filter(file => /^[a-z0-9_]+\.json$/.test(file)).sort().map(file => this.get(file.slice(0, -5))));
    return entries.filter((entry): entry is TemplateArte => entry !== undefined);
  }
  async get(id: string): Promise<TemplateArte | undefined> {
    if (!/^[a-z0-9_]+$/.test(id)) return undefined;
    try { return TemplateArteSchema.parse(JSON.parse(await readFile(join(this.directory, `${id}.json`), 'utf8'))); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined; throw error; }
  }
  async save(value: TemplateArte): Promise<void> {
    const template = TemplateArteSchema.parse(value);
    await mkdir(this.directory, { recursive: true });
    const target = join(this.directory, `${template.id}.json`);
    const tmp = `${target}.${nanoid()}.tmp`;
    await writeFile(tmp, JSON.stringify(template, null, 2) + '\n', 'utf8');
    await rename(tmp, target);
  }
}
