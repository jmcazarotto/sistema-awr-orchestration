import { z } from 'zod';
import * as S from '../../shared/types';

export class ApiError extends Error {
  constructor(message: string, public status: number, public code = 'INVALID_RESPONSE') { super(message); }
}
export function createApi(transport: typeof fetch = fetch) {
  async function request<T>(path: string, schema: z.ZodType<T>, body?: unknown): Promise<T> {
    let response: Response;
    try {
      response = await transport(`/api${path}`, body === undefined ? {} : {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      });
    } catch { throw new ApiError('Não foi possível conectar à API. Verifique se o servidor está disponível.', 0, 'NETWORK_ERROR'); }
    let json: unknown;
    try { json = await response.json(); } catch { throw new ApiError('O servidor retornou uma resposta ilegível.', response.status); }
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
  };
}
export type ApiClient = ReturnType<typeof createApi>;
export function imageUrl(path: string) { return `/acervo/${path.split('/').map(encodeURIComponent).join('/')}`; }
