import { DEFAULT_SETTINGS, SETTINGS_LIMITS, saveSettings, useSettings } from '../state/settings';
import { Badge } from './ui';

const toS = (ms: number) => Math.round(ms / 100) / 10;

/** Preferências da tela de nova demanda (salvas neste navegador). */
export function SettingsPanel() {
  const s = useSettings();
  return <div className="settings-layout"><section className="card">
    <div className="section-heading"><div><div className="eyebrow">NOVA DEMANDA</div><h2>Classificação/triagem</h2></div><Badge>Salvo neste navegador</Badge></div>
    <div className="settings-list">
      <label className="setting-row"><span><strong>Duração da etapa visual "Classificando…"</strong><small>Tempo mínimo que a etapa fica na tela, mesmo que a classificação responda antes. 0 = mostra o resultado assim que chegar.</small></span>
        <span className="setting-control"><input type="range" min={SETTINGS_LIMITS.triagemMinMs.min} max={SETTINGS_LIMITS.triagemMinMs.max} step={500} value={s.triagemMinMs} onChange={e=>saveSettings({triagemMinMs:Number(e.target.value)})}/>
          <input type="number" aria-label="Segundos da etapa visual" min={0} max={10} step={0.5} value={toS(s.triagemMinMs)} onChange={e=>saveSettings({triagemMinMs:Number(e.target.value)*1000})}/><em>s</em></span></label>
      <label className="setting-row"><span><strong>Animação dos resultados</strong><small>Nome da franquia e da unidade digitados, porcentagens contando e barras preenchendo.</small></span>
        <span className="setting-control"><input type="checkbox" checked={s.animacoes} onChange={e=>saveSettings({animacoes:e.target.checked})}/> {s.animacoes?'Ligada':'Desligada'}</span></label>
      <label className="setting-row"><span><strong>Duração da animação</strong><small>Tempo para preencher cada dado.</small></span>
        <span className="setting-control"><input type="range" disabled={!s.animacoes} min={SETTINGS_LIMITS.revealMs.min} max={SETTINGS_LIMITS.revealMs.max} step={100} value={s.revealMs} onChange={e=>saveSettings({revealMs:Number(e.target.value)})}/>
          <input type="number" aria-label="Segundos da animação" disabled={!s.animacoes} min={0.2} max={5} step={0.1} value={toS(s.revealMs)} onChange={e=>saveSettings({revealMs:Number(e.target.value)*1000})}/><em>s</em></span></label>
    </div>
    <div className="form-footer"><span className="muted">Padrão: etapa visual {toS(DEFAULT_SETTINGS.triagemMinMs)} s · animação {toS(DEFAULT_SETTINGS.revealMs)} s.</span><button className="button outline" onClick={()=>saveSettings(DEFAULT_SETTINGS)}>Restaurar padrão</button></div>
  </section></div>;
}
