import { TransicaoDemandaSchema, transicaoValida } from '../../shared/types';
import type { Demanda, EstadoDemanda } from '../../shared/types';
import { OrchestratorError } from './errors';
export { transicaoValida };

export function transition(demanda: Demanda, para: EstadoDemanda, ts: string, motivo?: string, messageId?: string): void {
  const result = TransicaoDemandaSchema.safeParse({ de: demanda.estado, para, ts, motivo, messageId });
  if (!result.success) throw new OrchestratorError('INVALID_TRANSITION', `Transição inválida: ${demanda.estado} → ${para}`);
  demanda.historico.push(result.data); demanda.estado = para; demanda.updatedAt = ts;
}
