import type { AcervoStorage } from './interfaces';

export class MemoryAcervoStorage implements AcervoStorage {
  private readonly files = new Map<string, Buffer>();
  async initialize(): Promise<void> {}
  async list(prefix = ''): Promise<string[]> { return [...this.files.keys()].filter(path => path.startsWith(prefix)).sort(); }
  async read(path: string): Promise<Buffer> {
    const value = this.files.get(path);
    if (!value) throw Object.assign(new Error(`Arquivo ausente: ${path}`), { code: 'ENOENT' });
    return Buffer.from(value);
  }
  async write(path: string, data: Buffer): Promise<void> { this.files.set(path, Buffer.from(data)); }
  async move(from: string, to: string): Promise<void> {
    if (this.files.has(to)) throw new Error(`Destino já existe: ${to}`);
    this.files.set(to, await this.read(from)); this.files.delete(from);
  }
}
