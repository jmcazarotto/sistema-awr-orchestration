import { z } from 'zod';
import type { OrchestratorConfig } from '../../shared/types';
import { OrchestratorError } from '../core/errors';

const probability = z.number().min(0).max(1);
export const JevResponseSchema = z.object({
  model: z.string().min(1),
  answers: z.record(z.string(), z.object({ type: z.literal('choice'), choice: z.string().min(1), confidence: probability, probabilities: z.record(z.string(), probability) })),
  usage: z.object({ input_tokens: z.number().int().nonnegative(), output_tokens: z.number().int().nonnegative() }),
});
export type JevQuestions = Record<string, { type: 'choice'; instructions: string; criteria: Record<string, string> }>;
export interface JevClientOptions { fetch?: typeof fetch; now?: () => number; sleep?: (ms: number) => Promise<void> }

/** HTTP only. Credentials and upstream bodies never cross the error boundary. */
export class JevClient {
  constructor(private readonly config: OrchestratorConfig, private readonly apiKey: string, private readonly options: JevClientOptions = {}) {}
  async ask(state: string, questions: JevQuestions) {
    const now = this.options.now ?? (() => performance.now());
    const start = now();
    try {
      for (let attempt = 0; attempt < 4; attempt++) {
        const response = await (this.options.fetch ?? fetch)(`${this.config.JEV_BASE_URL.replace(/\/+$/, '')}/v1/systemone`, {
          method: 'POST', headers: { Authorization: `Bearer ${this.apiKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ state, model: this.config.JEV_MODEL, questions }), signal: AbortSignal.timeout(10000),
        });
        if ((response.status === 429 || response.status === 529) && attempt < 3) {
          await response.body?.cancel();
          await (this.options.sleep ?? (ms => new Promise(resolve => setTimeout(resolve, ms))))(250 * 2 ** attempt);
          continue;
        }
        if (!response.ok) throw new Error('upstream');
        const result = JevResponseSchema.parse(await response.json());
        // Validate dynamic choice sets as well as the wire shape.
        for (const [name, question] of Object.entries(questions)) {
          const answer = result.answers[name];
          if (!answer || !Object.hasOwn(question.criteria, answer.choice)
            || Object.keys(question.criteria).some(key => !Object.hasOwn(answer.probabilities, key))
            || Object.keys(answer.probabilities).some(key => !Object.hasOwn(question.criteria, key))) throw new Error('invalid choice');
        }
        return { ...result, latenciaMs: Math.max(0, now() - start) };
      }
      throw new Error('upstream');
    } catch { throw new OrchestratorError('UPSTREAM_ERROR', 'Falha no classificador Jev.', 502); }
  }
}
