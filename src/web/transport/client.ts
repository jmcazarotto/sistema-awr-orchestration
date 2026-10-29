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
    triagem: (texto: string) => request('/triagem', S.TriagemResponseSchema, S.TriagemRequestSchema.parse({texto})),
    demandas: () => request('/demandas', S.ListDemandasResponseSchema),
    demanda: (id: string) => request(`/demandas/${encodeURIComponent(S.DemandaIdSchema.parse(id))}`, S.GetDemandaResponseSchema),
    create: (input: S.CreateDemandaRequest) => request('/demandas', S.CreateDemandaResponseSchema, S.CreateDemandaRequestSchema.parse(input)),
    feedback: (id: string, input: S.HumanReviewRequest) => request(`/demandas/${encodeURIComponent(S.DemandaIdSchema.parse(id))}/feedback`, S.HumanReviewResponseSchema, S.HumanReviewRequestSchema.parse(input)),
    resetHops: (id: string) => request(`/demandas/${encodeURIComponent(S.DemandaIdSchema.parse(id))}/reset-hops`, S.ResetHopsResponseSchema, {}),
    acervo: () => request('/acervo', S.GetAcervoResponseSchema),
    fill: () => request('/acervo/fill', S.FillAcervoResponseSchema, {}),
    messages: () => request('/messages', S.ListMessagesResponseSchema),
    skills: () => request('/brain/skills', S.ListSkillsResponseSchema),
    skill: (id: S.SkillId) => request(`/brain/skills/${S.SkillIdSchema.parse(id)}`, S.GetSkillResponseSchema),
    config: () => request('/config', S.GetConfigResponseSchema),
    iaModelos: () => request('/ia/modelos', S.IaModelosResponseSchema),
    saveIaModelos: (modelos: S.IaModelos) => request('/ia/modelos', S.IaModelosResponseSchema, S.IaModelosSchema.parse(modelos), 'PUT'),
    iaUso: () => request('/ia/uso', S.IaUsoResponseSchema),
    zerarIaUso: () => request('/ia/uso/zerar', S.IaUsoResponseSchema, {}),
    empresas: () => request('/empresas', S.ListEmpresasResponseSchema),
    empresa: (id: string) => request(`/empresas/${encodeURIComponent(S.EmpresaIdSchema.parse(id))}`, S.EmpresaResponseSchema),
    saveEmpresa: (input: S.EmpresaInput) => request('/empresas', S.EmpresaResponseSchema, S.EmpresaInputSchema.parse(input)),
    uploadLogo: (id: string, arquivo: File | Blob) => { const form = new FormData(); form.append('arquivo', arquivo); return request(`/empresas/${encodeURIComponent(S.EmpresaIdSchema.parse(id))}/logo`, S.EmpresaResponseSchema, form); },
    templates: (query: S.TemplatesQuery = {}) => { const params = new URLSearchParams(Object.entries(S.TemplatesQuerySchema.parse(query)).filter((e): e is [string, string] => typeof e[1] === 'string')).toString(); return request(`/templates${params ? `?${params}` : ''}`, S.ListTemplatesResponseSchema); },
    template: (id: string) => request(`/templates/${encodeURIComponent(id)}`, S.TemplateResponseSchema),
    saveTemplate: (id: string, input: S.SaveTemplateRequest) => request(`/templates/${encodeURIComponent(id)}`, S.TemplateResponseSchema, S.SaveTemplateRequestSchema.parse(input), 'PUT'),
  };
}
export type ApiClient = ReturnType<typeof createApi>;
export function imageUrl(path: string) { return `/acervo/${path.split('/').map(encodeURIComponent).join('/')}`; }
