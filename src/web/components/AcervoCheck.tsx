import { useEffect, useState } from 'react';
import { PROCEDIMENTOS, PROCEDIMENTO_LABELS, TIPOS_TEMPLATE } from '../../shared/types';
import type { AcervoGrid } from '../../shared/types';
import { useRuntime } from '../state/context';
import { withMinDelay } from '../state/format';
import { getSettings } from '../state/settings';
import { Badge, errorMessage, templateLabel } from './ui';

/** Abastecimento (Monalisa): verifica o acervo e mostra, por procedimento e tipo de arte, o que falta repor. */
export function AcervoCheck({ startDelay = 0 }: { startDelay?: number }) {
  const { api, store } = useRuntime();
  const [grid, setGrid] = useState<AcervoGrid | null>(null); const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    const timer = setTimeout(() => {
      withMinDelay(api.acervo(), getSettings().acervoCheckMs).then(g => {
        if (!alive) return; store.update(s => ({ ...s, acervo: g })); setGrid(g);
      }, e => { if (alive) setError(errorMessage(e)); });
    }, startDelay);
    return () => { alive = false; clearTimeout(timer); };
  }, [api, store, startDelay]);
  const slot = (procedimento: string, tipo: string) => grid?.slots.find(s => s.procedimento === procedimento && s.tipoTemplate === tipo);
  const faltam = grid ? grid.vazios : 0;
  return <section className="card acervo-check" aria-live="polite" aria-busy={!grid && !error}>
    <span className="eyebrow">Abastecimento do acervo · Monalisa</span>
    <h2>{error ? 'Não foi possível verificar o acervo' : !grid ? 'Verificando o acervo…' : faltam ? `Faltam ${faltam} de ${grid.total} imagens` : 'Acervo completo'}</h2>
    {error && <p role="alert">{error}</p>}
    {!grid && !error && <><p className="muted">Conferindo quais imagens ainda não foram atribuídas em cada procedimento.</p><span className="triage-progress"/></>}
    {grid && <div className="acervo-check-grid">{PROCEDIMENTOS.map((p, i) => {
      const slots = TIPOS_TEMPLATE.map(t => slot(p, t)!); const falta = slots.filter(s => !s.preenchido).length;
      return <div key={p} className="acervo-proc pop-in" style={{ animationDelay: `${i * 120}ms` }}>
        <div className="acervo-proc-head"><strong>{PROCEDIMENTO_LABELS[p]}</strong><Badge active={falta === 0}>{falta ? `${falta} faltando` : 'completo'}</Badge></div>
        <ul>{slots.map(s => <li key={s.tipoTemplate} className={s.preenchido ? 'ok' : s.demandaAbertaId ? 'wip' : 'missing'}><span>{templateLabel(s.tipoTemplate)}</span><em>{s.preenchido ? 'OK' : s.demandaAbertaId ? 'em produção' : 'falta 1'}</em></li>)}</ul>
      </div>;
    })}</div>}
  </section>;
}
