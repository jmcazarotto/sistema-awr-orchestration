import type { ApiErrorCode } from '../../shared/types';

export class OrchestratorError extends Error {
  constructor(public readonly code: ApiErrorCode, message: string, public readonly status: 400 | 404 | 409 | 500 | 502 = 409) { super(message); this.name = 'OrchestratorError'; }
}
