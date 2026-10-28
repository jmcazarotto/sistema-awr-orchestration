import { mkdir, readFile, readdir, rename, writeFile, realpath, lstat } from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { nanoid } from 'nanoid';
import { watch } from 'chokidar';
import { PROCEDIMENTOS } from '../../shared/types';
import type { AcervoStorage } from './interfaces';

/** Todos os paths do contrato são relativos à raiz, inclusive em Windows. */
export class FsAcervoStorage implements AcervoStorage {
  private readonly root: string;
  constructor(directory: string) { this.root = resolve(directory); }
  private path(path: string): string {
    if (path.includes('\\') || path.includes('\0') || path.includes(':') || path.split('/').includes('..') || isAbsolute(path)) throw new Error('Path de acervo inválido');
    const target = resolve(this.root, path);
    const rel = relative(this.root, target);
    if (rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel)) throw new Error('Path fora do acervo');
    return target;
  }
  private async contained(target: string): Promise<void> {
    const root = await realpath(this.root);
    const actual = await realpath(target);
    const rel = relative(root, actual);
    if (rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel)) throw new Error('Link fora do acervo');
  }
  async initialize(): Promise<void> {
    await mkdir(this.root, { recursive: true });
    for (const folder of [...PROCEDIMENTOS, '_staging', '_references']) await mkdir(this.path(folder), { recursive: true });
  }
  async list(prefix = ''): Promise<string[]> {
    const result: string[] = [];
    const walk = async (folder: string): Promise<void> => {
      for (const entry of await readdir(this.path(folder), { withFileTypes: true })) {
        const path = folder ? `${folder}/${entry.name}` : entry.name;
        if (entry.isSymbolicLink()) continue;
        if (entry.isDirectory()) await walk(path);
        else if (entry.isFile() && path.startsWith(prefix)) result.push(path);
      }
    };
    await walk(''); return result.sort();
  }
  async read(path: string): Promise<Buffer> { const target = this.path(path); await this.contained(target); return readFile(target); }
  async write(path: string, data: Buffer): Promise<void> {
    const target = this.path(path);
    await mkdir(dirname(target), { recursive: true }); await this.contained(dirname(target));
    const tmp = `${target}.${nanoid()}.tmp`;
    await writeFile(tmp, data); await rename(tmp, target);
  }
  async move(from: string, to: string): Promise<void> {
    const source = this.path(from); const target = this.path(to);
    await this.contained(source); await mkdir(dirname(target), { recursive: true }); await this.contained(dirname(target));
    try { await lstat(target); throw new Error(`Destino já existe: ${to}`); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
    await rename(source, target);
  }
  async watch(onChange: () => void, onError: (error: unknown) => void): Promise<() => Promise<void>> {
    const watcher = watch(PROCEDIMENTOS.map(proc => this.path(proc)), { ignoreInitial: true, awaitWriteFinish: { stabilityThreshold: 100, pollInterval: 50 } });
    watcher.on('all', onChange); watcher.on('error', onError);
    return async () => { await watcher.close(); };
  }
}
