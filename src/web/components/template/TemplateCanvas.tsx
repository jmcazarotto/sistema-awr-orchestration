import { useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import type { ElementoTemplate } from '../../../shared/types';
import { BG_ID, HANDLES, computeSnap, fundoCss, resizeRect, snapResize } from '../../state/templateEditor';
import type { Handle, Rect } from '../../state/templateEditor';
import { ElementoView } from './TemplateRenderer';
import type { CanvasTemplate } from './TemplateRenderer';

const CURSORS: Record<Handle, string> = { nw: 'nwse-resize', se: 'nwse-resize', ne: 'nesw-resize', sw: 'nesw-resize', n: 'ns-resize', s: 'ns-resize', e: 'ew-resize', w: 'ew-resize' };
const handlePos = (h: Handle, size: number): { left: string; top: string } => ({
  left: h.includes('w') ? `${-size / 2}px` : h.includes('e') ? `calc(100% - ${size / 2}px)` : `calc(50% - ${size / 2}px)`,
  top: h.includes('n') ? `${-size / 2}px` : h.includes('s') ? `calc(100% - ${size / 2}px)` : `calc(50% - ${size / 2}px)`,
});
const SNAP_PX = 6;

interface Gesture { active: boolean; kind: 'move' | 'resize'; handle?: Handle; startX: number; startY: number; start: Rect; id: string }
export interface CanvasProps {
  template: CanvasTemplate; scale: number; selectedId: string | null; logoUrl?: string | null;
  copyingStyle?: boolean;
  showGuides: boolean; preview: boolean;
  onSelect: (id: string | null) => void;
  onLogoContextMenu: (id: string, x: number, y: number) => void;
  onImageDrop: (id: string, file: File) => void;
  onDropError: (message: string) => void;
  onGestureStart: () => void; onGestureLive: (elementos: ElementoTemplate[]) => void; onGestureEnd: () => void;
}

/** Palco DOM: renderiza o template em coordenadas reais e sobrepõe uma camada de interação (mover/redimensionar). */
export function TemplateCanvas({ template, scale, selectedId, logoUrl, showGuides, preview, copyingStyle = false, onSelect, onLogoContextMenu, onImageDrop, onDropError, onGestureStart, onGestureLive, onGestureEnd }: CanvasProps) {
  const { largura, altura } = template.canvas;
  const gesture = useRef<Gesture | null>(null);
  const [guides, setGuides] = useState<{ x: number[]; y: number[] }>({ x: [], y: [] });
  const [hover, setHover] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const patch = (id: string, rect: Rect) => onGestureLive(template.elementos.map(e => e.id === id ? { ...e, x: Math.round(rect.x), y: Math.round(rect.y), w: Math.max(1, Math.round(rect.w)), h: Math.max(1, Math.round(rect.h)) } : e));

  function begin(e: ReactPointerEvent<HTMLElement>, el: ElementoTemplate, kind: Gesture['kind'], handle?: Handle) {
    if (e.button !== 0) return;
    e.stopPropagation(); onSelect(el.id);
    if (el.bloqueado || copyingStyle) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    gesture.current = { active: false, kind, ...(handle ? { handle } : {}), startX: e.clientX, startY: e.clientY, start: { x: el.x, y: el.y, w: el.w, h: el.h }, id: el.id };
  }
  function move(e: ReactPointerEvent<HTMLElement>) {
    const g = gesture.current; if (!g) return;
    e.stopPropagation();
    if (!g.active) {
      if (Math.hypot(e.clientX - g.startX, e.clientY - g.startY) < 5) return;
      g.active = true; onGestureStart();
    }
    const dx = (e.clientX - g.startX) / scale, dy = (e.clientY - g.startY) / scale;
    const others = template.elementos.filter(o => o.id !== g.id).map(({ x, y, w, h }) => ({ x, y, w, h }));
    const threshold = SNAP_PX / scale, snap = !e.altKey;
    if (g.kind === 'move') {
      const raw = { ...g.start, x: g.start.x + dx, y: g.start.y + dy };
      const s = snap ? computeSnap(raw, others, template.canvas, threshold) : { dx: 0, dy: 0, guidesX: [], guidesY: [] };
      setGuides({ x: s.guidesX, y: s.guidesY });
      patch(g.id, { ...raw, x: raw.x + s.dx, y: raw.y + s.dy });
    } else {
      const raw = resizeRect(g.start, g.handle!, dx, dy, { keepRatio: e.shiftKey });
      const s = snap && !e.shiftKey ? snapResize(raw, g.handle!, others, template.canvas, threshold) : null;
      setGuides({ x: s?.guidesX ?? [], y: s?.guidesY ?? [] });
      patch(g.id, s?.rect ?? raw);
    }
  }
  function end(e: ReactPointerEvent<HTMLElement>) {
    if (!gesture.current) return;
    const active = gesture.current.active;
    gesture.current = null; setGuides({ x: [], y: [] });
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
    if (active) onGestureEnd();
  }

  const hs = 12 / scale, line = 1 / scale;
  return <div className="tpl-stage" style={{ width: largura * scale, height: altura * scale }} onPointerDown={() => onSelect(BG_ID)} data-testid="template-stage"
    onDragOver={e => { if (e.dataTransfer.types.includes('Files')) { e.preventDefault(); e.dataTransfer.dropEffect = 'none'; } }}
    onDrop={e => { e.preventDefault(); setDropTarget(null); }}>
    <div className="tpl-stage-content" style={{ width: largura, height: altura, transform: `scale(${scale})`}}>
      <TemplateBackground template={template} logoUrl={logoUrl} labels={!preview} />
      {showGuides && !preview && <div className="tpl-grid" aria-hidden="true">
        {[largura / 3, largura / 2, (largura * 2) / 3].map(x => <i key={`gx${x}`} className={x === largura / 2 ? 'center' : ''} style={{ left: x, top: 0, width: line, height: altura }} />)}
        {[altura / 3, altura / 2, (altura * 2) / 3].map(y => <i key={`gy${y}`} className={y === altura / 2 ? 'center' : ''} style={{ top: y, left: 0, height: line, width: largura }} />)}
      </div>}
      {!preview && <div className="tpl-hits">
        {template.elementos.map(el => {
          const selected = el.id === selectedId;
          const canDrop = el.tipo.startsWith('foto_') && !el.bloqueado;
          return <div key={el.id} className={`tpl-hit${selected ? ' selected' : ''}${el.bloqueado ? ' locked' : ''}${dropTarget === el.id ? ' image-drop-target' : ''}`} role="button" aria-label={`${el.rotulo}${el.bloqueado ? ' (bloqueado)' : ''}`} aria-pressed={selected}
            style={{ left: el.x, top: el.y, width: el.w, height: el.h, zIndex: el.z, transform: el.rotacao ? `rotate(${el.rotacao}deg)` : undefined, outlineWidth: selected ? 2 / scale : hover === el.id ? line : 0, cursor: el.bloqueado ? 'not-allowed' : copyingStyle ? 'copy' : 'move' }}
            onContextMenu={e => { if (el.tipo === 'logo') { e.preventDefault(); e.stopPropagation(); onLogoContextMenu(el.id, e.clientX, e.clientY); } }}
            onPointerDown={e => begin(e, el, 'move')} onPointerMove={move} onPointerUp={end} onPointerCancel={end}
            onDragOver={e => {
              if (!e.dataTransfer.types.includes('Files')) return;
              e.preventDefault(); e.stopPropagation();
              const image = Array.from(e.dataTransfer.items).some(item => item.kind === 'file' && (!item.type || item.type.startsWith('image/')));
              e.dataTransfer.dropEffect = canDrop && image ? 'copy' : 'none';
              setDropTarget(canDrop && image ? el.id : null);
            }}
            onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDropTarget(null); }}
            onDrop={e => {
              e.preventDefault(); e.stopPropagation(); setDropTarget(null);
              if (!canDrop) return;
              const files = Array.from(e.dataTransfer.files);
              if (files.length !== 1 || !files[0]!.type.startsWith('image/')) return onDropError('Solte uma única imagem neste elemento.');
              onImageDrop(el.id, files[0]!);
            }}
            onPointerEnter={() => setHover(el.id)} onPointerLeave={() => setHover(h => h === el.id ? null : h)}>
            {dropTarget === el.id && <span className="tpl-drop-label" style={{ fontSize: 13 / scale, padding: `${8 / scale}px ${12 / scale}px`, borderRadius: 8 / scale }}>Solte para substituir a imagem</span>}
            {selected && !el.bloqueado && HANDLES.map(h => <span key={h} className="tpl-handle" data-handle={h} style={{ width: hs, height: hs, borderWidth: line * 1.5, ...handlePos(h, hs), cursor: CURSORS[h] }}
              onPointerDown={e => begin(e, el, 'resize', h)} onPointerMove={move} onPointerUp={end} onPointerCancel={end} />)}
          </div>;
        })}
        {guides.x.map(x => <i key={`x${x}`} className="tpl-guide" style={{ left: x, top: 0, width: line, height: altura }} />)}
        {guides.y.map(y => <i key={`y${y}`} className="tpl-guide" style={{ top: y, left: 0, height: line, width: largura }} />)}
      </div>}
    </div>
  </div>;
}

function TemplateBackground({ template, logoUrl, labels }: { template: CanvasTemplate; logoUrl?: string | null; labels: boolean }) {
  return <>
    <div style={{ position: 'absolute', inset: 0, background: fundoCss(template.fundo) ?? '#ffffff' }} />
    {template.elementos.map(el => <ElementoView key={el.id} el={el} logoUrl={logoUrl} labels={labels} />)}
  </>;
}
