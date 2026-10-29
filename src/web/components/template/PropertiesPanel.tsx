import { useEffect, useId, useState } from 'react';
import type { ReactNode } from 'react';
import type { ElementoEstilo, ElementoTemplate } from '../../../shared/types';
import { TIPO_LABELS, buildFundo, fotoImagem, parseFundo } from '../../state/templateEditor';
import { readImageDownscaled } from '../../state/imageFile';
import type { FundoModo } from '../../state/templateEditor';

const hex7 = (c: string) => /^#[0-9a-f]{6}/i.test(c) ? c.slice(0, 7) : '#000000';
const TEXT_TYPES = new Set(['titulo', 'subtitulo', 'destaque', 'preco', 'texto']);

function NumField({ label, value, onChange, step = 1, min, max, disabled }: { label: string; value: number; onChange: (n: number) => void; step?: number; min?: number; max?: number; disabled?: boolean }) {
  const id = useId(); const [text, setText] = useState(String(value));
  useEffect(() => { if (Number(text) !== value) setText(String(value)); }, [value]); // eslint-disable-line react-hooks/exhaustive-deps
  return <div className="field compact"><label htmlFor={id}>{label}</label>
    <input id={id} type="number" inputMode="decimal" value={text} step={step} min={min} max={max} disabled={disabled}
      onChange={e => { setText(e.target.value); const n = e.target.valueAsNumber; if (Number.isFinite(n)) onChange(n); }} onBlur={() => setText(String(value))} /></div>;
}
function ColorField({ label, value, onChange, disabled }: { label: string; value: string; onChange: (c: string) => void; disabled?: boolean }) {
  const id = useId();
  return <div className="field compact"><label htmlFor={id}>{label}</label><div className="color-inline"><input id={id} type="color" value={hex7(value)} disabled={disabled} onChange={e => onChange(e.target.value)} /><code>{value}</code></div></div>;
}
function Check({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return <label className="check"><input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} />{label}</label>;
}
function Section({ title, children }: { title: string; children: ReactNode }) { return <section className="tpl-section"><h3>{title}</h3><div className="tpl-fields">{children}</div></section>; }

function ImagePicker({ label, current, onPick, onClear, maxW, maxH }: { label: string; current: string | null; onPick: (dataUrl: string) => void; onClear: () => void; maxW: number; maxH: number }) {
  const id = useId(); const [err, setErr] = useState<string | null>(null);
  return <div className="field wide image-picker"><label htmlFor={id}>{label}</label>
    <div className="image-picker-row">{current && <img src={current} alt="Imagem atual" />}
      <input id={id} type="file" accept="image/png,image/jpeg,image/webp" onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) readImageDownscaled(f, maxW, maxH).then(d => { setErr(null); onPick(d); }, x => setErr(x instanceof Error ? x.message : 'Imagem inválida.')); }} /></div>
    {current && <button type="button" className="button outline small" onClick={onClear}>Remover imagem</button>}
    {err && <small className="tpl-error" role="alert">{err}</small>}</div>;
}

export function FundoField({ label, value, onChange, allowNone = true, allowImage = false }: { label: string; value: string | null; onChange: (v: string | null) => void; allowNone?: boolean; allowImage?: boolean }) {
  const id = useId(); const p = parseFundo(value);
  const set = (modo: FundoModo, a = p.a, b = p.b) => onChange(modo === 'image' ? 'imagem:' : buildFundo(modo, a, b));
  return <div className="fundo-field"><div className="field compact"><label htmlFor={id}>{label}</label>
    <select id={id} value={p.modo} onChange={e => set(e.target.value as FundoModo)}>{allowNone && <option value="none">Sem fundo</option>}<option value="solid">Cor sólida</option><option value="gradient">Degradê (2 cores)</option>{allowImage && <option value="image">Imagem</option>}</select></div>
    {p.modo === 'image' ? <ImagePicker label="Imagem de fundo (salva no template)" current={p.url || null} maxW={1080} maxH={1350} onPick={d => onChange(`imagem:${d}`)} onClear={() => onChange('imagem:')} />
      : p.modo !== 'none' && <div className="fundo-colors"><ColorField label={p.modo === 'gradient' ? 'Topo' : 'Cor'} value={p.a} onChange={a => set(p.modo, a, p.b)} />{p.modo === 'gradient' && <ColorField label="Base" value={p.b} onChange={b => set(p.modo, p.a, b)} />}</div>}</div>;
}

export function PropertiesPanel({ element, background = false, nome, fundo, onNome, onFundo, onPatch, onPatchEstilo, onDelete, onDuplicate }: {
  element: ElementoTemplate | null; background?: boolean; nome: string; fundo: string;
  onNome: (v: string) => void; onFundo: (v: string) => void;
  onPatch: (patch: Partial<ElementoTemplate>, key: string) => void; onPatchEstilo: (patch: Partial<ElementoEstilo>, key: string) => void;
  onDelete: () => void; onDuplicate: () => void;
}) {
  const uid = useId();
  if (!element && background) return <aside className="tpl-panel" aria-label="Propriedades do background"><div className="tpl-panel-head"><h2>Background</h2></div>
    <div className="tpl-fields"><FundoField label="Fundo do template" value={fundo} allowNone={false} allowImage onChange={v => onFundo(v ?? '#ffffff')} />
      <p className="muted">Fica atrás de todas as camadas e é salvo no template.</p></div></aside>;
  if (!element) return <aside className="tpl-panel" aria-label="Propriedades"><div className="tpl-panel-head"><h2>Template</h2></div>
    <div className="tpl-fields">
      <div className="field"><label htmlFor={`${uid}-nome`}>Nome do template</label><input id={`${uid}-nome`} value={nome} onChange={e => onNome(e.target.value)} /></div>
      <p className="muted">Selecione um elemento ou o Background nas camadas para editar suas propriedades.</p>
    </div></aside>;
  const e = element, s = e.estilo, lock = e.bloqueado, isText = TEXT_TYPES.has(e.tipo);
  const k = (f: string) => `${e.id}:${f}`;
  return <aside className="tpl-panel" aria-label="Propriedades do elemento">
    <div className="tpl-panel-head"><h2>{TIPO_LABELS[e.tipo]}</h2>
      <div className="tpl-actions"><button className="button outline small" onClick={onDuplicate}>Duplicar</button><button className="button outline small danger" disabled={lock} onClick={onDelete}>Excluir</button></div></div>
    {lock && <p className="notice">Elemento bloqueado: desbloqueie nas camadas para editar posição e tamanho.</p>}
    <Section title="Geral">
      <div className="field"><label htmlFor={`${uid}-rot`}>Rótulo</label><input id={`${uid}-rot`} value={e.rotulo} onChange={ev => ev.target.value.trim() && onPatch({ rotulo: ev.target.value }, k('rotulo'))} /></div>
      <NumField label="X" value={e.x} disabled={lock} onChange={x => onPatch({ x }, k('x'))} />
      <NumField label="Y" value={e.y} disabled={lock} onChange={y => onPatch({ y }, k('y'))} />
      <NumField label="Largura" value={e.w} min={1} disabled={lock} onChange={w => w > 0 && onPatch({ w }, k('w'))} />
      <NumField label="Altura" value={e.h} min={1} disabled={lock} onChange={h => h > 0 && onPatch({ h }, k('h'))} />
      <NumField label="Rotação (°)" value={e.rotacao} disabled={lock} onChange={rotacao => onPatch({ rotacao }, k('rotacao'))} />
    </Section>
    {/^foto_/.test(e.tipo) && <Section title="Imagem de placeholder"><ImagePicker label="Foto de exemplo (só para facilitar a leitura)" current={fotoImagem(e)} maxW={1080} maxH={1350} onPick={d => onPatch({ conteudo: d }, k('imagem'))} onClear={() => onPatch({ conteudo: '' }, k('imagem'))} /></Section>}
    {isText && <Section title="Texto">
      <div className="field wide"><label htmlFor={`${uid}-txt`}>Conteúdo</label><textarea id={`${uid}-txt`} rows={2} value={e.conteudo} onChange={ev => onPatch({ conteudo: ev.target.value }, k('conteudo'))} />
        <small className="muted">Variáveis: {'{{procedimento}}'}, {'{{preco}}'}, {'{{parcelas}}'}.</small></div>
      <div className="field compact"><label htmlFor={`${uid}-fonte`}>Fonte</label><select id={`${uid}-fonte`} value={s.fonte} onChange={ev => onPatchEstilo({ fonte: ev.target.value as ElementoEstilo['fonte'] }, k('fonte'))}><option value="serif_display">Serifada (display)</option><option value="sans_black">Sans black</option><option value="sans">Sans</option></select></div>
      <NumField label="Tamanho (px)" value={s.tamanho} min={1} onChange={tamanho => tamanho > 0 && onPatchEstilo({ tamanho }, k('tamanho'))} />
      <div className="field compact"><label htmlFor={`${uid}-peso`}>Peso</label><select id={`${uid}-peso`} value={s.peso} onChange={ev => onPatchEstilo({ peso: Number(ev.target.value) }, k('peso'))}>{[300, 400, 500, 600, 700, 800, 900].map(p => <option key={p} value={p}>{p}</option>)}</select></div>
      <div className="field compact"><label htmlFor={`${uid}-al`}>Alinhamento</label><select id={`${uid}-al`} value={s.alinhamento} onChange={ev => onPatchEstilo({ alinhamento: ev.target.value as ElementoEstilo['alinhamento'] }, k('alinhamento'))}><option value="esquerda">Esquerda</option><option value="centro">Centro</option><option value="direita">Direita</option></select></div>
      <ColorField label="Cor do texto" value={s.cor} onChange={cor => onPatchEstilo({ cor }, k('cor'))} />
      <div className="field wide check-list"><Check label="Itálico" checked={s.italico} onChange={italico => onPatchEstilo({ italico }, k('italico'))} /><Check label="Caixa alta" checked={s.caixaAlta} onChange={caixaAlta => onPatchEstilo({ caixaAlta }, k('caixaAlta'))} /></div>
    </Section>}
    <Section title="Aparência">
      <div className="field wide"><FundoField label="Fundo" value={s.fundo} onChange={fundo => onPatchEstilo({ fundo }, k('fundo'))} /></div>
      <NumField label="Raio (px)" value={s.raio} min={0} onChange={raio => raio >= 0 && onPatchEstilo({ raio }, k('raio'))} />
      <div className="field compact"><label htmlFor={`${uid}-op`}>Opacidade ({Math.round(s.opacidade * 100)}%)</label><input id={`${uid}-op`} type="range" min={0} max={1} step={0.05} value={s.opacidade} onChange={ev => onPatchEstilo({ opacidade: Number(ev.target.value) }, k('opacidade'))} /></div>
      <div className="field wide"><Check label="Borda" checked={!!s.borda} onChange={on => onPatchEstilo({ borda: on ? { cor: '#8d8b88', largura: 8 } : null }, k('borda'))} /></div>
      {s.borda && <><ColorField label="Cor da borda" value={s.borda.cor} onChange={cor => onPatchEstilo({ borda: { ...s.borda!, cor } }, k('bordaCor'))} /><NumField label="Largura da borda" value={s.borda.largura} min={0} onChange={largura => largura >= 0 && onPatchEstilo({ borda: { ...s.borda!, largura } }, k('bordaLargura'))} /></>}
      <div className="field wide"><Check label="Sombra" checked={s.sombra} onChange={sombra => onPatchEstilo({ sombra }, k('sombra'))} /></div>
    </Section>
  </aside>;
}
