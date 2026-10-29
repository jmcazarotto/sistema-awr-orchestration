import { TemplateArteSchema } from '../../shared/types';
import type { TemplateArte } from '../../shared/types';
import type { TemplateStore } from './interfaces';

export class MemoryTemplateStore implements TemplateStore {
  private readonly templates = new Map<string, TemplateArte>();
  async list(): Promise<TemplateArte[]> { return structuredClone([...this.templates.values()]); }
  async get(id: string): Promise<TemplateArte | undefined> { return structuredClone(this.templates.get(id)); }
  async save(template: TemplateArte): Promise<void> { this.templates.set(template.id, TemplateArteSchema.parse(structuredClone(template))); }
}
