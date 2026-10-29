import type { Context } from 'hono';
import type { z } from 'zod';
import type { ApiErrorCode } from '../shared/types';

export class ApiFailure extends Error {
  constructor(readonly status: 400 | 404 | 409 | 502, readonly code: ApiErrorCode, message: string) {
    super(message);
  }
}

export function validate<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) {
    const detalhes = result.error.issues.map(issue => {
      const campo = issue.path.join('.') || 'body';
      const mensagem = issue.code === 'unrecognized_keys' ? `campos desconhecidos (${issue.keys.join(', ')})`
        : issue.code === 'too_small' ? 'valor obrigatório, vazio ou abaixo do mínimo'
          : issue.code === 'too_big' ? 'valor acima do máximo'
            : issue.code === 'invalid_type' ? 'tipo inválido' : 'valor inválido';
      return `${campo}: ${mensagem}`;
    }).join('; ');
    throw new ApiFailure(400, 'VALIDATION_ERROR', `Dados inválidos: ${detalhes}`);
  }
  return result.data;
}

export async function bodyJson(c: Context, optional = false): Promise<unknown> {
  const texto = await c.req.text();
  if (optional && texto.length === 0) return {};
  try { return JSON.parse(texto) as unknown; }
  catch { throw new ApiFailure(400, 'VALIDATION_ERROR', 'Body deve conter JSON válido.'); }
}

/** Só códigos explícitos de domínio podem atravessar a fronteira HTTP. */
export function domainFailure(error: unknown): ApiFailure | undefined {
  if (error instanceof ApiFailure) return error;
  if (typeof error !== 'object' || error === null || !('code' in error)) return undefined;
  switch (error.code) {
    case 'VALIDATION_ERROR': return new ApiFailure(400, 'VALIDATION_ERROR', error instanceof Error ? error.message : 'Dados inválidos.');
    case 'UPSTREAM_ERROR': return new ApiFailure(502, 'UPSTREAM_ERROR', 'Falha no classificador Jev.');
    case 'NOT_FOUND': return new ApiFailure(404, 'NOT_FOUND', 'Demanda não encontrada.');
    case 'INVALID_TRANSITION': return new ApiFailure(409, 'INVALID_TRANSITION', 'Operação incompatível com o estado atual da demanda.');
    case 'HOP_LIMIT': return new ApiFailure(409, 'HOP_LIMIT', 'Limite de hops atingido. Faça o reset antes de solicitar ajuste.');
    default: return undefined;
  }
}
