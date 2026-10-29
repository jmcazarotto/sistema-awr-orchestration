import { useState } from 'react';
import { ELEMENTO_TIPOS } from '../../../shared/types';
import type { ElementoTemplate, ElementoTipo } from '../../../shared/types';
import { BG_ID, TIPO_LABELS } from '../../state/templateEditor';
import { Icon } from '../ui';

export function LayersPanel({ elementos, selectedId, onSelect, onToggleLock, onMoveZ, onAdd }: {
  elementos: ElementoTemplate[]; selectedId: string | null; onSelect: (id: string) => void;
  onToggleLock: (id: string) => void; onMoveZ: (id: string, dir: 1 | -1) => void; onAdd: (tipo: ElementoTipo) => void;
}) {
  const [menu, setMenu] = useState(false);
  const sorted = [...elementos].sort((a, b) => b.z - a.z);
  return <aside className="tpl-panel" aria-label="Camadas">
    <div className="tpl-panel-head"><h2>Camadas</h2>
      <div className="tpl-add">
        <button className="button primary small" aria-haspopup="menu" aria-expanded={menu} onClick={() => setMenu(m => !m)}><Icon name="plus" size={16} />Adicionar elemento</button>
        {menu && <ul className="tpl-menu" role="menu">{ELEMENTO_TIPOS.map(t => <li key={t} role="none"><button role="menuitem" onClick={() => { onAdd(t); setMenu(false); }}>{TIPO_LABELS[t]}</button></li>)}</ul>}
      </div>
    </div>
    {sorted.length === 0 ? <p className="muted">Nenhum elemento. Use “Adicionar elemento”.</p> : <ul className="tpl-layers">
      {sorted.map((el, i) => <li key={el.id} className={el.id === selectedId ? 'selected' : ''}>
        <button className="tpl-layer-main" onClick={() => onSelect(el.id)} aria-pressed={el.id === selectedId}><span className="tpl-layer-type">{TIPO_LABELS[el.tipo]}</span><strong>{el.rotulo}</strong></button>
        <button className="icon-button" aria-label={`Trazer ${el.rotulo} para frente`} disabled={i === 0} onClick={() => onMoveZ(el.id, 1)}><Icon name="up" size={16} /></button>
        <button className="icon-button" aria-label={`Enviar ${el.rotulo} para trás`} disabled={i === sorted.length - 1} onClick={() => onMoveZ(el.id, -1)}><Icon name="down" size={16} /></button>
        <button className="icon-button" aria-label={el.bloqueado ? `Desbloquear ${el.rotulo}` : `Bloquear ${el.rotulo}`} aria-pressed={el.bloqueado} onClick={() => onToggleLock(el.id)}><Icon name={el.bloqueado ? 'lock' : 'unlock'} size={16} /></button>
      </li>)}
    </ul>}
    <ul className="tpl-layers tpl-layers-bg"><li className={selectedId === BG_ID ? 'selected' : ''}>
      <button className="tpl-layer-main" onClick={() => onSelect(BG_ID)} aria-pressed={selectedId === BG_ID}><span className="tpl-layer-type">Fundo</span><strong>Background</strong></button>
      <span className="icon-button" title="O background fica sempre atrás de todas as camadas" aria-hidden="true"><Icon name="lock" size={16} /></span>
    </li></ul>
  </aside>;
}
