import { useEffect, useState } from 'react';
import type { ActorId, ActorStatus } from '../../shared/types';

/* Simulação visual do Live Orchestration Panel: só anima o mapa, não cria demandas nem chama IA. */
export interface SimStep { ms: number; agent: 'van_gogh' | 'monalisa'; demand: string; label: string; actors: Partial<Record<ActorId, ActorStatus>>; pulse?: { from: string; to: string }; toast?: string }
const idle = {} as const;
/** Tempo da bolinha entre dois agentes e do processamento de cada agente (ms). */
export const TRAVEL_MS = 1000, WORK_MS = 2000;
/** `rejeicoes`: quantas vezes o Diretor reprova e devolve ao agente antes de aprovar (0 = aprova de primeira). */
function flow(agent: 'van_gogh' | 'monalisa', demand: string, rejeicoes: number): SimStep[] {
  const s = (ms: number, label: string, actors: SimStep['actors'], pulse?: SimStep['pulse'], toast?: string): SimStep => ({ ms, agent, demand, label, actors, ...(pulse ? { pulse } : {}), ...(toast ? { toast } : {}) });
  const nome = agent === 'van_gogh' ? 'Van Gogh' : 'Monalisa';
  const origin = agent === 'monalisa' ? { from: 'acervo_watcher', to: 'art_director' } : { from: 'system', to: 'art_director' };
  const steps: SimStep[] = [s(TRAVEL_MS, agent === 'monalisa' ? 'AcervoWatcher encontra um slot vazio no acervo' : 'FastClassifier classifica a demanda do cliente', { art_director: 'thinking' }, origin)];
  for (let r = 0; r <= rejeicoes; r++) {
    if (r === 0) steps.push(s(TRAVEL_MS, `Diretor de Arte pede a arte ao ${nome}`, { art_director: 'thinking' }, { from: 'art_director', to: agent }));
    steps.push(
      s(WORK_MS, r === 0 ? `${nome} compõe o template e gera a arte` : `${nome} refaz a arte aplicando a correção`, { [agent]: 'generating' }),
      s(TRAVEL_MS, r === 0 ? 'Arte entregue ao Diretor de Arte' : 'Arte corrigida devolvida ao Diretor', { art_director: 'reviewing' }, { from: agent, to: 'art_director' }),
      s(WORK_MS, 'Diretor revisa a arte pela rubrica (Sim/Não)', { art_director: 'reviewing' }),
    );
    if (r < rejeicoes) steps.push(s(TRAVEL_MS, `Diretor reprova (selo sobre a região tratada) e manda o ${nome} corrigir`, { art_director: 'thinking' }, { from: 'art_director', to: agent }, 'Arte reprovada · ajuste pedido'));
    else steps.push(s(TRAVEL_MS, 'Diretor de Arte aprova e envia ao Revisor AWR', idle, { from: 'art_director', to: 'awr_human' }, 'Arte aprovada pelo Diretor'));
  }
  steps.push(
    s(TRAVEL_MS, 'Revisor AWR aprova a arte', { art_director: 'thinking' }, { from: 'awr_human', to: 'art_director' }),
    s(2200, 'Arte concluída e salva no acervo local', idle, undefined, 'Arte concluída!'),
  );
  return steps;
}
/** Revezando: aprova de primeira, reprova uma vez, e assim por diante, nos dois agentes. */
export const SIM_STEPS: SimStep[] = [...flow('van_gogh', 'SIM-0001', 0), ...flow('monalisa', 'SIM-0002', 1), ...flow('van_gogh', 'SIM-0003', 1), ...flow('monalisa', 'SIM-0004', 0)];
/** Tempo que o pop-up da arte fica na tela (ms). */
export const TOAST_MS = 3200;

export interface SimView { actors: Record<ActorId, { status: ActorStatus; demandaId: string | null }>; pulse: { id: string; from: string; to: string } | null; label: string; toast: { id: string; text: string } | null; agent: SimStep['agent']; demand: string; step: number; total: number }
export function simView(steps: SimStep[], i: number, tick: number): SimView {
  const step = steps[i % steps.length]!;
  const mk = (id: ActorId) => ({ status: step.actors[id] ?? 'idle' as ActorStatus, demandaId: step.actors[id] ? step.demand : null });
  return { actors: { art_director: mk('art_director'), van_gogh: mk('van_gogh'), monalisa: mk('monalisa') }, pulse: step.pulse ? { id: `sim-${tick}`, ...step.pulse } : null, label: step.label, toast: step.toast ? { id: `sim-toast-${tick}`, text: step.toast } : null, agent: step.agent, demand: step.demand, step: i % steps.length + 1, total: steps.length };
}
/** Percorre o roteiro em loop enquanto `enabled`; devolve null quando desligada. */
export function useSimulation(enabled: boolean, steps: SimStep[] = SIM_STEPS): SimView | null {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!enabled) { setTick(0); return; }
    const t = setTimeout(() => setTick(n => n + 1), steps[tick % steps.length]!.ms);
    return () => clearTimeout(t);
  }, [enabled, tick, steps]);
  return enabled ? simView(steps, tick, tick) : null;
}
