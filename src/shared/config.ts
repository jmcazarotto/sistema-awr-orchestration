import { z } from 'zod';
import { OrchestratorConfigSchema } from './types';
import type { OrchestratorConfig } from './types';

// Coerção só na fronteira env. Strings vazias não viram 0; "false" não vira true.
function envNumber<T extends z.ZodType>(schema: T) {
  return z.preprocess(value => {
    if (value === undefined) return undefined;
    if (typeof value !== 'string') return value;
    return value.trim() === '' ? Number.NaN : Number(value);
  }, schema);
}

export const ConfigEnvSchema = OrchestratorConfigSchema.extend({
  MOCK_REJECT_RATE: envNumber(OrchestratorConfigSchema.shape.MOCK_REJECT_RATE),
  JEV_PRICE_INPUT_USD_PER_MTOK: envNumber(OrchestratorConfigSchema.shape.JEV_PRICE_INPUT_USD_PER_MTOK),
  JEV_PRICE_OUTPUT_USD_PER_MTOK: envNumber(OrchestratorConfigSchema.shape.JEV_PRICE_OUTPUT_USD_PER_MTOK),
  USD_BRL: envNumber(OrchestratorConfigSchema.shape.USD_BRL),
  MAX_HOPS: envNumber(OrchestratorConfigSchema.shape.MAX_HOPS),
  MAX_DIRECTOR_ATTEMPTS: envNumber(OrchestratorConfigSchema.shape.MAX_DIRECTOR_ATTEMPTS),
  DIRECTOR_TICK_MS: envNumber(OrchestratorConfigSchema.shape.DIRECTOR_TICK_MS),
  PRODUCTION_TIMEOUT_MS: envNumber(OrchestratorConfigSchema.shape.PRODUCTION_TIMEOUT_MS),
  ACERVO_HEARTBEAT_MS: envNumber(OrchestratorConfigSchema.shape.ACERVO_HEARTBEAT_MS),
  PORT: envNumber(OrchestratorConfigSchema.shape.PORT),
  ACERVO_AUTOFILL: z.preprocess(value => {
    if (value === 'true') return true;
    if (value === 'false') return false;
    return value;
  }, OrchestratorConfigSchema.shape.ACERVO_AUTOFILL),
});

/** Puro: o chamador fornece env; credenciais/variáveis alheias são descartadas pelo Zod. */
export function loadConfig(env: Readonly<Record<string, string | undefined>>): OrchestratorConfig {
  return ConfigEnvSchema.parse(env);
}
