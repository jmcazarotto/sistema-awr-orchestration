import { createContext, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';

/** Configuração da animação de resultados: duração total e se está ligada (respeita prefers-reduced-motion). */
interface RevealConfig { ms: number; on: boolean }
const RevealContext = createContext<RevealConfig>({ ms: 0, on: false });

export function RevealProvider({ ms, on, children }: RevealConfig & { children: ReactNode }) {
  const reduced = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  return <RevealContext.Provider value={{ ms, on: on && !reduced }}>{children}</RevealContext.Provider>;
}

/** Progresso 0→1 com easing, iniciado após `delay` ms. */
function useProgress(delay = 0): number {
  const { ms, on } = useContext(RevealContext);
  const [p, setP] = useState(on ? 0 : 1);
  useEffect(() => {
    if (!on) { setP(1); return; }
    setP(0);
    let frame = 0; const start = performance.now() + delay;
    const tick = (now: number) => {
      const t = Math.min(1, Math.max(0, (now - start) / ms));
      setP(1 - (1 - t) ** 3); // easeOutCubic
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [ms, on, delay]);
  return p;
}

/** Texto digitado letra a letra. */
export function TypeText({ text, delay = 0 }: { text: string; delay?: number }) {
  const p = useProgress(delay);
  const shown = text.slice(0, Math.round(text.length * p));
  return <span aria-label={text}><span aria-hidden="true">{shown}</span>{p < 1 && <span className="type-caret" aria-hidden="true"/>}</span>;
}

/** Porcentagem contando de 0 até o valor. */
export function CountPct({ value, delay = 0 }: { value: number; delay?: number }) {
  const p = useProgress(delay);
  return <span className="count-pct">{Math.round(value * 100 * p)}%</span>;
}

/** Largura da barra crescendo de 0 até o valor. */
export function useFill(value: number, delay = 0): string {
  const p = useProgress(delay);
  return `${Math.max(p > 0 ? 2 : 0, Math.round(value * 100 * p))}%`;
}

/** Card que entra com fade/slide em sequência. */
export function RevealCard({ index, children }: { index: number; children: ReactNode }) {
  const { ms, on } = useContext(RevealContext);
  return <article className={on ? 'reveal-card' : undefined} style={on ? { animationDelay: `${index * stagger(ms)}ms`, animationDuration: `${Math.min(600, ms)}ms` } : undefined}>{children}</article>;
}

/** Intervalo entre cards, proporcional à duração escolhida. */
export const stagger = (ms: number) => Math.round(ms * 0.15);
export function useRevealDelay(index: number): number {
  const { ms, on } = useContext(RevealContext);
  return on ? index * stagger(ms) : 0;
}
/** Função de atraso por índice de card (para usar várias vezes no mesmo render sem violar as regras de hooks). */
export function useRevealDelays(): (index: number) => number {
  const { ms, on } = useContext(RevealContext);
  return index => (on ? index * stagger(ms) : 0);
}
