import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';
import { OrchestratorError } from '../core/errors';

const Id = z.string().regex(/^[a-z0-9_]+$/).refine(id => id !== 'nao_identificada');
const UnidadeSchema = z.object({
  id: Id, nome: z.string().trim().min(1), cidade: z.string().trim().min(1),
  uf: z.string().trim().length(2).optional(), aliases: z.array(z.string().trim().min(1)).default([]),
});
/** Rede = franqueadora (com unidades) ou empresa independente (sem unidades). */
const ClienteSchema = z.object({
  id: Id, nome: z.string().trim().min(1), tipo: z.enum(['franquia', 'independente']).default('independente'),
  aliases: z.array(z.string().trim().min(1)).default([]), unidades: z.array(UnidadeSchema).default([]),
});
const ClientesSchema = z.array(ClienteSchema).refine(clientes => {
  const ids = clientes.flatMap(cliente => [cliente.id, ...cliente.unidades.map(unidade => unidade.id)]);
  return new Set(ids).size === ids.length;
}, 'ids duplicados em brain/clientes.json');
export type Cliente = z.infer<typeof ClienteSchema>;
export type Unidade = z.infer<typeof UnidadeSchema>;

export class ClientesRegistry {
  constructor(private readonly brainDir: string) {}
  async list(): Promise<Cliente[]> {
    try { return ClientesSchema.parse(JSON.parse(await readFile(join(this.brainDir, 'clientes.json'), 'utf8'))); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
      throw new OrchestratorError('INTERNAL_ERROR', 'Cadastro brain/clientes.json inválido ou ilegível.', 500);
    }
  }
}
