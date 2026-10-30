import { z } from 'zod';
import * as S from '../../shared/types';

export class ApiError extends Error {
  constructor(message: string, public status: number, public code = 'INVALID_RESPONSE') { super(message); }
}
export function createApi(transport: typeof fetch = fetch) {
  async function request<T>(path: string, schema: z.ZodType<T>, body?: unknown, method: 'POST' | 'PUT' = 'POST'): Promise<T> {
    let response: Response;
    try {
      response = await transport(`/api${path}`, body === undefined ? {} : body instanceof FormData
        ? { method, body }
        : { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    } catch { throw new ApiError('Não foi possível conectar à API. Verifique se o servidor está disponível.', 0, 'NETWORK_ERROR'); }
    let json: unknown;
    try { json = await response.json(); } catch {
      // Proxy do Vite sem backend (ECONNREFUSED) responde 5xx sem JSON.
      if (response.status >= 500) throw new ApiError('A API não respondeu (servidor parado ou reiniciando). Confira o terminal do `npm run dev` e tente de novo.', response.status, 'NETWORK_ERROR');
      throw new ApiError('O servidor retornou uma resposta ilegível.', response.status);
    }
    if (!response.ok) {
      const error = S.ApiErrorSchema.safeParse(json);
      throw new ApiError(error.success ? error.data.error.message : `Não foi possível concluir a operação (${response.status}).`, response.status, error.success ? error.data.error.code : undefined);
    }
    const parsed = schema.safeParse(json);
    if (!parsed.success) throw new ApiError('A resposta do servidor não corresponde ao contrato esperado.', response.status);
    return parsed.data;
  }
  return {
    triagem: (texto: string, anexos: string[] = []) => request('/triagem', S.TriagemResponseSchema, S.TriagemRequestSchema.parse({texto, ...(anexos.length ? {anexos} : {})})),
    demandas: () => request('/demandas', S.ListDemandasResponseSchema),
    demanda: (id: string) => request(`/demandas/${encodeURIComponent(S.DemandaIdSchema.parse(id))}`, S.GetDemandaResponseSchema),
    create: (input: S.CreateDemandaRequest) => request('/demandas', S.CreateDemandaResponseSchema, S.CreateDemandaRequestSchema.parse(input)),
    uploadAnexo: (arquivo: File, papel: S.PapelAnexo) => { const form = new FormData(); form.append('arquivo', arquivo); form.append('papel', papel); return request('/demandas/anexos', S.UploadAnexoResponseSchema, form); },
    feedback: (id: string, input: S.HumanReviewRequest) => request(`/demandas/${encodeURIComponent(S.DemandaIdSchema.parse(id))}/feedback`, S.HumanReviewResponseSchema, S.HumanReviewRequestSchema.parse(input)),
    resetHops: (id: string) => request(`/demandas/${encodeURIComponent(S.DemandaIdSchema.parse(id))}/reset-hops`, S.ResetHopsResponseSchema, {}),
    acervo: () => request('/acervo', S.GetAcervoResponseSchema),
    fill: () => request('/acervo/fill', S.FillAcervoResponseSchema, {}),
    messages: () => request('/messages', S.ListMessagesResponseSchema),
    skills: () => request('/brain/skills', S.ListSkillsResponseSchema),
    skill: (id: S.SkillId) => request(`/brain/skills/${S.SkillIdSchema.parse(id)}`, S.GetSkillResponseSchema),
    config: () => request('/config', S.GetConfigResponseSchema),
    produzir: (id: string) => request(`/demandas/${encodeURIComponent(S.DemandaIdSchema.parse(id))}/produzir`, S.CreateDemandaResponseSchema, {}),
    agentes: () => request('/agentes', S.AgentesPausaResponseSchema),
    pausarAgente: (id: S.ActorId, pausar: boolean) => request(`/agentes/${S.ActorIdSchema.parse(id)}/${pausar ? 'pausar' : 'retomar'}`, S.AgentesPausaResponseSchema, {}),
    marcas: () => request('/brain/marcas', S.ListMarcasResponseSchema),
    marca: (id: string) => request(`/brain/marcas/${encodeURIComponent(id)}`, S.MarcaResponseSchema),
    iaModelos: () => request('/ia/modelos', S.IaModelosResponseSchema),
    saveIaModelos: (modelos: S.IaModelos) => request('/ia/modelos', S.IaModelosResponseSchema, S.IaModelosSchema.parse(modelos), 'PUT'),
    iaUso: () => request('/ia/uso', S.IaUsoResponseSchema),
    zerarIaUso: () => request('/ia/uso/zerar', S.IaUsoResponseSchema, {}),
    empresas: () => request('/empresas', S.ListEmpresasResponseSchema),
    empresa: (id: string) => request(`/empresas/${encodeURIComponent(S.EmpresaIdSchema.parse(id))}`, S.EmpresaResponseSchema),
    referenciasEmpresa: (id: string) => request(`/empresas/${encodeURIComponent(S.EmpresaIdSchema.parse(id))}/referencias`, S.ReferenciasResponseSchema),
    categorizarReferencia: (id: string, ref: string, procedimento: S.Procedimento, composicao: string) => request(`/empresas/${encodeURIComponent(S.EmpresaIdSchema.parse(id))}/referencias/${encodeURIComponent(ref)}`, S.ReferenciasResponseSchema, S.ReferenciaCategoriaSchema.parse({ procedimento, composicao }), 'PUT'),
    uploadReferencia: (id: string, arquivo: File, procedimento: S.Procedimento, composicao: string) => { const form = new FormData(); form.append('arquivo', arquivo); form.append('procedimento', procedimento); form.append('composicao', composicao); return request(`/empresas/${encodeURIComponent(S.EmpresaIdSchema.parse(id))}/referencias`, S.ReferenciasResponseSchema, form); },
    saveEmpresa: (input: S.EmpresaInput) => request('/empresas', S.EmpresaResponseSchema, S.EmpresaInputSchema.parse(input)),
    uploadLogo: (id: string, arquivo: File | Blob, variante: S.LogoVariante = 'principal', principal = true) => { const form = new FormData(); form.append('arquivo', arquivo); form.append('variante', variante); form.append('principal', String(principal)); return request(`/empresas/${encodeURIComponent(S.EmpresaIdSchema.parse(id))}/logo`, S.EmpresaResponseSchema, form); },
    templates: (query: S.TemplatesQuery = {}) => { const params = new URLSearchParams(Object.entries(S.TemplatesQuerySchema.parse(query)).filter((e): e is [string, string] => typeof e[1] === 'string')).toString(); return request(`/templates${params ? `?${params}` : ''}`, S.ListTemplatesResponseSchema); },
    template: (id: string) => request(`/templates/${encodeURIComponent(id)}`, S.TemplateResponseSchema),
    saveTemplate: (id: string, input: S.SaveTemplateRequest) => request(`/templates/${encodeURIComponent(id)}`, S.TemplateResponseSchema, S.SaveTemplateRequestSchema.parse(input), 'PUT'),
  };
}
export type ApiClient = ReturnType<typeof createApi>;
export function imageUrl(path: string) { return path.startsWith('data:image/') ? path : `/acervo/${path.split('/').map(encodeURIComponent).join('/')}`; }
