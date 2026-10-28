import { DemandaSchema } from '../../shared/types';
import type { Demanda, OrigemDemanda, SubmitDemandInput } from '../../shared/types';
import type { EngineState } from './interfaces';

export function allocateId(state: EngineState): string { return `DEM-${String(++state.sequence).padStart(4, '0')}`; }
export function createDemanda(id: string, origem: OrigemDemanda, input: SubmitDemandInput, ts: string): Demanda {
  return DemandaSchema.parse({ id, origem, ...input, estado: 'CRIADA', classificacao: null, criadorAtual: null,
    hop: 0, tentativaDiretor: 0, versaoAtual: 0, escalada: false, historico: [], createdAt: ts, updatedAt: ts });
}
