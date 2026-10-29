import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ElementoEstilo, ElementoTemplate, ElementoTipo, TemplateArte } from '../../shared/types';
import { PROCEDIMENTO_LABELS } from '../../shared/types';
import { useRuntime } from '../state/context';
import { useLoad } from '../state/useLoad';
import { BG_ID, createElemento, createHistory, duplicateElemento, moveZ, pushHistory, redoHistory, undoHistory } from '../state/templateEditor';
import type { History } from '../state/templateEditor';
import { Icon, errorMessage, useToast } from '../components/ui';
import { TemplateCanvas } from '../components/template/TemplateCanvas';
import { LayersPanel } from '../components/template/LayersPanel';
import { PropertiesPanel } from '../components/template/PropertiesPanel';
import { empresaLogoUrl } from '../components/template/TemplateRenderer';

interface Doc { nome: string; fundo: string; elementos: ElementoTemplate[] }
const toDoc = (t: Pick<TemplateArte, 'nome' | 'fundo' | 'elementos'>): Doc => ({ nome: t.nome, fundo: t.fundo, elementos: t.elementos });
const sig = (d: Doc) => JSON.stringify({ nome: d.nome, fundo: d.fundo, elementos: d.elementos });
const isEditable = (t: EventTarget | null) => t instanceof HTMLElement && (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable);
const MIN_ZOOM = .1, MAX_ZOOM = 2;

export function TemplateEditorPage({ id }: { id: string }) {
  const { api } = useRuntime();
  const loaded = useLoad(async () => { const { template } = await api.template(id); const { empresa } = await api.empresa(template.empresaId).catch(() => ({ empresa: null })); return { template, empresa }; }, [api, id]);
  if (loaded.loading && !loaded.data) return <section className="card loading-state" role="status"><span className="loader" /><h2>Abrindo o editor…</h2></section>;
  if (!loaded.data) return <section className="card"><h1>Template indisponível</h1><p className="muted" role="alert">{loaded.error ?? 'Template não encontrado.'}</p><a className="button outline" href="#/templates">Voltar para templates</a></section>;
  return <Editor template={loaded.data.template} logo={empresaLogoUrl(loaded.data.empresa?.logo)} empresaNome={loaded.data.empresa?.nome ?? loaded.data.template.empresaId} />;
}

function Editor({ template, logo, empresaNome }: { template: TemplateArte; logo: string | null; empresaNome: string }) {
  const { api } = useRuntime(); const toast = useToast();
  const [saved, setSaved] = useState<Doc>(() => toDoc(template));
  const [hist, setHist] = useState<History<Doc>>(() => createHistory(toDoc(template)));
  const [selectedId, setSelectedId] = useState<string | null>(BG_ID);
  const [zoom, setZoom] = useState<'fit' | number>('fit');
  const [showGuides, setShowGuides] = useState(true);
  const [preview, setPreview] = useState(false);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const [avail, setAvail] = useState(640);
  const doc = hist.present;
  const dirty = useMemo(() => sig(doc) !== sig(saved), [doc, saved]);
  const selected = doc.elementos.find(e => e.id === selectedId) ?? null;
  const viewport = useRef<HTMLDivElement>(null);
  const gesture = useRef<Doc | null>(null);
  const coalesce = useRef<{ key: string; at: number } | null>(null);

  useEffect(() => { const el = viewport.current; if (!el) return; const ro = new ResizeObserver(() => setAvail(Math.max(200, el.clientWidth - 40))); ro.observe(el); setAvail(Math.max(200, el.clientWidth - 40)); return () => ro.disconnect(); }, []);
  const { largura, altura } = template.canvas;
  const fitScale = Math.min(1, avail / largura);
  const scale = zoom === 'fit' ? fitScale : zoom;
  const stepZoom = (f: number) => setZoom(Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, +(scale * f).toFixed(3))));

  /** Aplica uma mudança de documento. `key` agrupa edições seguidas do mesmo campo num único passo de undo. */
  const commit = useCallback((fn: (d: Doc) => Doc, key?: string) => {
    setHist(h => {
      const next = fn(h.present); if (next === h.present) return h;
      const now = Date.now(); const c = coalesce.current;
      if (key && c && c.key === key && now - c.at < 900) { coalesce.current = { key, at: now }; return { ...h, present: next }; }
      coalesce.current = key ? { key, at: now } : null;
      return pushHistory(h, next);
    });
  }, []);
  const mapEl = (elId: string, fn: (e: ElementoTemplate) => ElementoTemplate) => (d: Doc): Doc => ({ ...d, elementos: d.elementos.map(e => e.id === elId ? fn(e) : e) });

  const undo = useCallback(() => { coalesce.current = null; setHist(undoHistory); }, []);
  const redo = useCallback(() => { coalesce.current = null; setHist(redoHistory); }, []);
  const addElemento = (tipo: ElementoTipo) => { const el = createElemento(tipo, doc.elementos, template.canvas); commit(d => ({ ...d, elementos: [...d.elementos, el] })); setSelectedId(el.id); };
  const removeSelected = useCallback(() => { if (!selected || selected.bloqueado) return; commit(d => ({ ...d, elementos: d.elementos.filter(e => e.id !== selected.id) })); setSelectedId(null); }, [selected, commit]);
  const duplicateSelected = useCallback(() => { if (!selected) return; const copy = duplicateElemento(selected, doc.elementos); commit(d => ({ ...d, elementos: [...d.elementos, copy] })); setSelectedId(copy.id); }, [selected, doc.elementos, commit]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isEditable(e.target)) return;
      const mod = e.ctrlKey || e.metaKey, key = e.key.toLowerCase();
      if (mod && key === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); }
      else if (mod && key === 'y') { e.preventDefault(); redo(); }
      else if (mod && key === 'd') { e.preventDefault(); duplicateSelected(); }
      else if (mod && key === 's') { e.preventDefault(); void save(); }
      else if (selected && (e.key === 'Delete' || e.key === 'Backspace')) { e.preventDefault(); removeSelected(); }
      else if (selected && e.key.startsWith('Arrow') && !mod) {
        e.preventDefault(); if (selected.bloqueado) return;
        const step = e.shiftKey ? 10 : 1;
        const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0, dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0;
        commit(mapEl(selected.id, el => ({ ...el, x: el.x + dx, y: el.y + dy })), `nudge:${selected.id}`);
      }
    };
    window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey);
  });
  useEffect(() => { if (!dirty) return; const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; }; window.addEventListener('beforeunload', warn); return () => window.removeEventListener('beforeunload', warn); }, [dirty]);

  async function save() {
    if (saving) return; setSaving(true); setStatus(null);
    const snapshot = doc;
    try {
      const { template: next } = await api.saveTemplate(template.id, { nome: snapshot.nome.trim() || template.nome, fundo: snapshot.fundo, elementos: snapshot.elementos });
      setSaved(toDoc(next)); setStatus({ ok: true, text: 'Alterações salvas.' }); toast('Template salvo.');
    } catch (e) { const text = errorMessage(e); setStatus({ ok: false, text }); toast(text, true); } finally { setSaving(false); }
  }
  function discard() {
    if (dirty && !window.confirm('Descartar todas as alterações não salvas?')) return;
    setHist(createHistory(saved)); setSelectedId(null); setStatus(null); coalesce.current = null;
  }

  const back = `#/templates?empresa=${encodeURIComponent(template.empresaId)}&procedimento=${template.procedimento}&familia=${template.familia}`;
  return <div className="tpl-editor">
    <div className="tpl-toolbar" role="toolbar" aria-label="Ferramentas do editor">
      <div className="tpl-toolbar-title"><a href={back} className="muted">← Templates</a><h1>{doc.nome}</h1><span className="muted">{empresaNome} · {PROCEDIMENTO_LABELS[template.procedimento]} · {largura}×{altura}</span></div>
      <div className="tpl-toolbar-group">
        <button className="icon-button" aria-label="Desfazer (Ctrl+Z)" title="Desfazer (Ctrl+Z)" disabled={!hist.past.length} onClick={undo}><Icon name="undo" /></button>
        <button className="icon-button" aria-label="Refazer (Ctrl+Shift+Z)" title="Refazer (Ctrl+Shift+Z)" disabled={!hist.future.length} onClick={redo}><Icon name="redo" /></button>
      </div>
      <div className="tpl-toolbar-group" role="group" aria-label="Zoom">
        <button className="icon-button" aria-label="Diminuir zoom" onClick={() => stepZoom(1 / 1.25)}><Icon name="zoomout" /></button>
        <button className="button outline small" aria-label="Ajustar à largura" onClick={() => setZoom('fit')}>{Math.round(scale * 100)}%{zoom === 'fit' ? ' · ajustado' : ''}</button>
        <button className="icon-button" aria-label="Aumentar zoom" onClick={() => stepZoom(1.25)}><Icon name="zoomin" /></button>
      </div>
      <div className="tpl-toolbar-group">
        <button className="button outline small" aria-pressed={showGuides} title="Grade de terços/centro; as guias de encaixe aparecem ao arrastar (Alt desliga o encaixe)" onClick={() => setShowGuides(v => !v)}><Icon name="guides" size={16} />{showGuides ? 'Ocultar grade/guias' : 'Mostrar grade/guias'}</button>
        <button className="button outline small" aria-pressed={preview} onClick={() => { setPreview(v => !v); }}><Icon name="eye" size={16} />{preview ? 'Voltar a editar' : 'Pré-visualizar'}</button>
      </div>
      <div className="tpl-toolbar-group tpl-save">
        <span className={`tpl-dirty${dirty ? ' on' : ''}`} role="status" aria-live="polite">{status && !dirty ? status.text : dirty ? '● Alterações não salvas' : 'Tudo salvo'}</span>
        {status && !status.ok && <span className="tpl-error" role="alert">{status.text}</span>}
        <button className="button outline small" disabled={!dirty || saving} onClick={discard}>Descartar alterações</button>
        <button className="button primary" disabled={!dirty || saving} onClick={() => void save()}><Icon name="save" size={16} />{saving ? 'Salvando…' : 'Salvar'}</button>
      </div>
    </div>
    <div className={`tpl-workspace${preview ? ' preview' : ''}`}>
      {!preview && <LayersPanel elementos={doc.elementos} selectedId={selectedId} onSelect={setSelectedId} onAdd={addElemento}
        onToggleLock={elId => commit(mapEl(elId, e => ({ ...e, bloqueado: !e.bloqueado })))} onMoveZ={(elId, dir) => commit(d => ({ ...d, elementos: moveZ(d.elementos, elId, dir) }))} />}
      <div className="tpl-viewport" ref={viewport} onPointerDown={() => setSelectedId(BG_ID)}>
        <div className="tpl-stage-wrap" style={{ width: largura * scale + 40, minHeight: altura * scale + 40 }}>
          <TemplateCanvas template={{ canvas: template.canvas, fundo: doc.fundo, elementos: doc.elementos }} scale={scale} selectedId={preview || selectedId === BG_ID ? null : selectedId} logoUrl={logo} showGuides={showGuides} preview={preview}
            onSelect={setSelectedId}
            onGestureStart={() => { gesture.current = hist.present; coalesce.current = null; }}
            onGestureLive={elementos => setHist(h => ({ ...h, present: { ...h.present, elementos } }))}
            onGestureEnd={() => { const before = gesture.current; gesture.current = null; if (before) setHist(h => h.present === before || sig(h.present) === sig(before) ? { ...h, present: before } : { past: [...h.past, before].slice(-100), present: h.present, future: [] }); }} />
        </div>
      </div>
      {!preview && <PropertiesPanel element={selected} background={selectedId === BG_ID} nome={doc.nome} fundo={doc.fundo}
        onNome={nome => commit(d => ({ ...d, nome }), 'nome')} onFundo={fundo => commit(d => ({ ...d, fundo }), 'fundo')}
        onPatch={(patch: Partial<ElementoTemplate>, key) => selected && commit(mapEl(selected.id, e => ({ ...e, ...patch })), key)}
        onPatchEstilo={(patch: Partial<ElementoEstilo>, key) => selected && commit(mapEl(selected.id, e => ({ ...e, estilo: { ...e.estilo, ...patch } })), key)}
        onDelete={removeSelected} onDuplicate={duplicateSelected} />}
    </div>
  </div>;
}
