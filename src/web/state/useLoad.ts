import { useCallback, useEffect, useState } from 'react';

/** Carrega dados assíncronos com estados de loading/erro e recarga manual. */
export function useLoad<T>(load: () => Promise<T>, deps: unknown[]) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const run = useCallback(load, deps);
  useEffect(() => {
    let alive = true;
    setLoading(true);
    run().then(value => { if (alive) { setData(value); setError(null); } }, e => { if (alive) setError(e instanceof Error ? e.message : 'Não foi possível carregar os dados.'); }).finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [run, tick]);
  return { data, error, loading, reload: () => setTick(t => t + 1), setData };
}
export function slugify(texto: string) {
  return texto.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}
