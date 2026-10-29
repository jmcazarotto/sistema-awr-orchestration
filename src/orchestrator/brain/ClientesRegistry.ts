import { adicionarLogo, atualizarLogos } from '../../shared/logos';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { nanoid } from 'nanoid';
import { z } from 'zod';
import { EmpresaSchema, EmpresaInputSchema } from '../../shared/types';
import type { Empresa, EmpresaInput, UnidadeEmpresa } from '../../shared/types';
import { OrchestratorError } from '../core/errors';

const ClientesSchema = z.array(EmpresaSchema).refine(clientes => {
  const ids = clientes.flatMap(cliente => [cliente.id, ...cliente.unidades.map(unidade => unidade.id)]);
  return !ids.includes('nao_identificada') && new Set(ids).size === ids.length;
}, 'ids duplicados ou reservados em brain/clientes.json');
/** Perfil mínimo consumido pelo matcher; list() retorna a empresa completa. */
export type Cliente = Pick<Empresa, 'id' | 'nome' | 'tipo' | 'aliases' | 'unidades'>;
export type Unidade = UnidadeEmpresa;

/** Adapter filesystem do cadastro de empresas. Serializa alterações para evitar perda de entradas. */
export class ClientesRegistry {
  private writes: Promise<unknown> = Promise.resolve();
  constructor(private readonly brainDir: string) {}
  async list(): Promise<Empresa[]> {
    try { return ClientesSchema.parse(JSON.parse(await readFile(join(this.brainDir, 'clientes.json'), 'utf8'))); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
      throw new OrchestratorError('INTERNAL_ERROR', 'Cadastro brain/clientes.json inválido ou ilegível.', 500);
    }
  }
  private mutate(change: (entries: Empresa[]) => Empresa): Promise<Empresa> {
    const work = this.writes.then(async () => {
      const entries = await this.list();
      const empresa = change(entries);
      const parsed = ClientesSchema.safeParse(entries);
      if (!parsed.success) throw new OrchestratorError('VALIDATION_ERROR', 'Ids duplicados ou reservados no cadastro.', 400);
      await mkdir(this.brainDir, { recursive: true });
      const target = join(this.brainDir, 'clientes.json');
      const tmp = `${target}.${nanoid()}.tmp`;
      await writeFile(tmp, JSON.stringify(parsed.data, null, 2) + '\n', 'utf8');
      await rename(tmp, target);
      return structuredClone(empresa);
    });
    this.writes = work.catch(() => undefined);
    return work;
  }
  upsert(value: EmpresaInput): Promise<Empresa> {
    const input = EmpresaInputSchema.parse(value);
    return this.mutate(entries => {
      const index = entries.findIndex(entry => entry.id === input.id);
      const empresa = atualizarLogos(EmpresaSchema.parse({ ...entries[index], ...input, logo: input.logo === undefined ? entries[index]?.logo : input.logo }));
      if (index < 0) entries.push(empresa); else entries[index] = empresa;
      return empresa;
    });
  }
  setLogo(id: string, logo: string, variante: 'principal' | 'claro' | 'escuro' = 'principal', principal = true): Promise<Empresa> {
    return this.mutate(entries => {
      const empresa = entries.find(entry => entry.id === id);
      if (!empresa) throw new OrchestratorError('NOT_FOUND', 'Empresa não encontrada.', 404);
      if (variante === 'principal') empresa.logo = logo;
      else Object.assign(empresa, adicionarLogo(empresa, logo, variante, principal));
      return empresa;
    });
  }
}
