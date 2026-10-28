import { useSyncExternalStore } from 'react';

/** Preferências de UI (por navegador, em localStorage). Não afetam o orquestrador. */
export interface UiSettings {
  /** Tempo mínimo (ms) em que a etapa "Classificando…" fica visível, mesmo que o classificador responda antes. */
  triagemMinMs: number;
  /** Duração (ms) da animação de preenchimento dos resultados (nomes, porcentagens e barras). */
  revealMs: number;
  /** Desliga as animações de resultado. */
  animacoes: boolean;
}

export const DEFAULT_SETTINGS: UiSettings = { triagemMinMs: 2000, revealMs: 1200, animacoes: true };
export const SETTINGS_LIMITS = { triagemMinMs: { min: 0, max: 10000 }, revealMs: { min: 200, max: 5000 } } as const;
const KEY = 'awr.ui-settings';

const clamp = (n: unknown, { min, max }: { min: number; max: number }, fallback: number) =>
  typeof n === 'number' && Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;

export function parseSettings(raw: unknown): UiSettings {
  const v = (raw && typeof raw === 'object' ? raw : {}) as Partial<UiSettings>;
  return {
    triagemMinMs: clamp(v.triagemMinMs, SETTINGS_LIMITS.triagemMinMs, DEFAULT_SETTINGS.triagemMinMs),
    revealMs: clamp(v.revealMs, SETTINGS_LIMITS.revealMs, DEFAULT_SETTINGS.revealMs),
    animacoes: typeof v.animacoes === 'boolean' ? v.animacoes : DEFAULT_SETTINGS.animacoes,
  };
}

function read(): UiSettings {
  try { return parseSettings(JSON.parse(localStorage.getItem(KEY) ?? 'null')); } catch { return DEFAULT_SETTINGS; }
}

let current: UiSettings = typeof localStorage === 'undefined' ? DEFAULT_SETTINGS : read();
const listeners = new Set<() => void>();

export function getSettings(): UiSettings { return current; }
export function saveSettings(patch: Partial<UiSettings>): UiSettings {
  current = parseSettings({ ...current, ...patch });
  try { localStorage.setItem(KEY, JSON.stringify(current)); } catch { /* modo privado: mantém só em memória */ }
  listeners.forEach(listener => listener());
  return current;
}
export function useSettings(): UiSettings {
  return useSyncExternalStore(listener => { listeners.add(listener); return () => listeners.delete(listener); }, getSettings, () => DEFAULT_SETTINGS);
}
