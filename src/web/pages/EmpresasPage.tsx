import { useEffect, useId, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { PROCEDIMENTOS, PROCEDIMENTO_LABELS } from '../../shared/types';
import type { Empresa, EmpresaInput } from '../../shared/types';
import { useRuntime } from '../state/context';
import { slugify, useLoad } from '../state/useLoad';
import { Badge, Empty, Icon, PageHeading, errorMessage, useToast } from '../components/ui';
import { empresaLogoUrl } from '../components/template/TemplateRenderer';

const LOGO_TIPOS = ['image/png', 'image/jpeg', 'image/svg+xml', 'image/webp'];
const blank = (): EmpresaInput => ({ id: '', nome: '', tipo: 'independente', aliases: [], unidades: [], procedimentos: [...PROCEDIMENTOS], cores: { primaria: '#c9a45c', secundaria: '#3f3d3b', texto: '#ffffff' } });
const toInput = (e: Empresa): EmpresaInput => ({ id: e.id, nome: e.nome, tipo: e.tipo, aliases: e.aliases, unidades: e.unidades, procedimentos: e.procedimentos, cores: e.cores });

export function EmpresasPage() {
  const { api } = useRuntime();
  const { data, error, loading, reload } = useLoad(() => api.empresas().then(r => r.empresas), [api]);
  const [editing, setEditing] = useState<{ empresa: Empresa | null } | null>(null);
  return <>
    <PageHeading eyebrow="WORKSPACE / EMPRESAS" title="Empresas (clientes)" description="Marcas, unidades, procedimentos e paleta que alimentam os templates e as demandas." action={<button className="button primary" onClick={() => setEditing({ empresa: null })}><Icon name="plus" />Nova empresa</button>} />
    {error && <div className="error-banner" role="alert"><span>{error}</span><button className="button outline" onClick={reload}>Tentar novamente</button></div>}
    {loading && !data ? <section className="card loading-state" role="status"><span className="loader" /><h2>Carregando empresas…</h2></section>
      : data?.length ? <div className="empresa-grid">{data.map(e => <EmpresaCard key={e.id} empresa={e} onEdit={() => setEditing({ empresa: e })} />)}</div>
      : !error && <Empty>Nenhuma empresa cadastrada ainda.</Empty>}
    {editing && <EmpresaDrawer empresa={editing.empresa} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); reload(); }} />}
  </>;
}

function EmpresaCard({ empresa, onEdit }: { empresa: Empresa; onEdit: () => void }) {
  const logo = empresaLogoUrl(empresa.logo);
  return <article className="card empresa-card">
    <div className="empresa-card-head">
      <div className="empresa-logo" style={{ background: empresa.cores.secundaria }}>{logo ? <img src={logo} alt={`Logo ${empresa.nome}`} /> : <span aria-hidden="true">{empresa.nome.slice(0, 2).toUpperCase()}</span>}</div>
      <div><h2>{empresa.nome}</h2><Badge active={empresa.tipo === 'franquia'}>{empresa.tipo === 'franquia' ? 'Franquia' : 'Independente'}</Badge></div>
    </div>
    {empresa.unidades.length > 0 && <p className="muted empresa-unidades"><Icon name="building" size={14} />{empresa.unidades.map(u => `${u.cidade}${u.uf ? `/${u.uf}` : ''}`).join(' · ')}</p>}
    <div className="chip-row" aria-label="Procedimentos">{empresa.procedimentos.map(p => <span className="chip" key={p}>{PROCEDIMENTO_LABELS[p]}</span>)}</div>
    <div className="swatch-row" aria-label="Cores da marca">{Object.entries(empresa.cores).map(([nome, cor]) => <span className="swatch" key={nome} title={`${nome}: ${cor}`} style={{ background: cor }}><span className="sr-only">{nome} {cor}</span></span>)}</div>
    <div className="empresa-card-actions">
      <button className="button outline" onClick={onEdit}><Icon name="edit" size={16} />Editar</button>
      <a className="button primary" href={`#/templates?empresa=${encodeURIComponent(empresa.id)}`}><Icon name="layout" size={16} />Ver templates</a>
    </div>
  </article>;
}

function EmpresaDrawer({ empresa, onClose, onSaved }: { empresa: Empresa | null; onClose: () => void; onSaved: () => void }) {
  const { api } = useRuntime(); const toast = useToast(); const uid = useId();
  const [form, setForm] = useState<EmpresaInput>(() => empresa ? toInput(empresa) : blank());
  const [idTouched, setIdTouched] = useState(!!empresa);
  const [aliases, setAliases] = useState(() => (empresa?.aliases ?? []).join(', '));
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const first = useRef<HTMLInputElement>(null);
  useEffect(() => { first.current?.focus(); const key = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); }; window.addEventListener('keydown', key); return () => window.removeEventListener('keydown', key); }, [onClose]);
  useEffect(() => { if (!file) { setPreview(null); return; } const url = URL.createObjectURL(file); setPreview(url); return () => URL.revokeObjectURL(url); }, [file]);
  const set = (patch: Partial<EmpresaInput>) => setForm(f => ({ ...f, ...patch }));
  const logo = preview ?? empresaLogoUrl(empresa?.logo);

  function pickFile(f: File | undefined) {
    if (!f) return;
    if (!LOGO_TIPOS.includes(f.type)) { setProblem('Use uma logo PNG, JPG, SVG ou WebP.'); return; }
    if (f.size > 2 * 1024 * 1024) { setProblem('A logo deve ter no máximo 2 MB.'); return; }
    setProblem(null); setFile(f);
  }
  async function submit(e: FormEvent) {
    e.preventDefault(); setProblem(null);
    const payload: EmpresaInput = { ...form, id: form.id || slugify(form.nome), aliases: aliases.split(',').map(a => a.trim()).filter(Boolean), unidades: form.unidades.map(({ uf, ...u }) => ({ ...u, ...(uf ? { uf } : {}), id: u.id || slugify(u.nome || u.cidade) })).filter(u => u.nome.trim() && u.cidade.trim()) };
    if (!payload.nome.trim()) return setProblem('Informe o nome da empresa.');
    if (!/^[a-z0-9_]+$/.test(payload.id)) return setProblem('O identificador deve ter apenas letras minúsculas, números e "_".');
    if (!payload.procedimentos.length) return setProblem('Selecione ao menos um procedimento.');
    setBusy(true);
    try {
      await api.saveEmpresa(payload);
      if (file) await api.uploadLogo(payload.id, file);
      toast(`${payload.nome} salva com sucesso.`); onSaved();
    } catch (err) { setProblem(errorMessage(err)); } finally { setBusy(false); }
  }
  const updateUnidade = (i: number, patch: Partial<EmpresaInput['unidades'][number]>) => set({ unidades: form.unidades.map((u, j) => j === i ? { ...u, ...patch } : u) });

  return <div className="drawer-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
    <form className="drawer" role="dialog" aria-modal="true" aria-labelledby={`${uid}-t`} onSubmit={e => void submit(e)}>
      <header className="drawer-head"><div><div className="eyebrow">{empresa ? 'EDITAR EMPRESA' : 'NOVA EMPRESA'}</div><h2 id={`${uid}-t`}>{empresa?.nome ?? 'Cadastrar empresa'}</h2></div><button type="button" className="icon-button" aria-label="Fechar" onClick={onClose}><Icon name="close" /></button></header>
      <div className="drawer-body">
        <div className="field"><label htmlFor={`${uid}-nome`}>Nome</label><input id={`${uid}-nome`} ref={first} value={form.nome} onChange={e => set({ nome: e.target.value, ...(idTouched ? {} : { id: slugify(e.target.value) }) })} required /></div>
        <div className="field-row">
          <div className="field"><label htmlFor={`${uid}-id`}>Identificador</label><input id={`${uid}-id`} value={form.id} disabled={!!empresa} onChange={e => { setIdTouched(true); set({ id: slugify(e.target.value) }); }} placeholder="gerado a partir do nome" /></div>
          <div className="field"><label htmlFor={`${uid}-tipo`}>Tipo</label><select id={`${uid}-tipo`} value={form.tipo} onChange={e => set({ tipo: e.target.value as EmpresaInput['tipo'] })}><option value="independente">Independente</option><option value="franquia">Franquia</option></select></div>
        </div>
        <div className="field"><label htmlFor={`${uid}-alias`}>Apelidos (separados por vírgula)</label><input id={`${uid}-alias`} value={aliases} onChange={e => setAliases(e.target.value)} placeholder="Royal, RoyalFace" /></div>
        <fieldset className="field"><legend>Unidades</legend>
          {form.unidades.map((u, i) => <div className="unidade-row" key={i}>
            <input aria-label={`Nome da unidade ${i + 1}`} placeholder="Nome (ex.: Royal Face Castanhal)" value={u.nome} onChange={e => updateUnidade(i, { nome: e.target.value })} />
            <input aria-label={`Cidade da unidade ${i + 1}`} placeholder="Cidade" value={u.cidade} onChange={e => updateUnidade(i, { cidade: e.target.value })} />
            <input aria-label={`UF da unidade ${i + 1}`} placeholder="UF" maxLength={2} value={u.uf ?? ''} onChange={e => updateUnidade(i, { uf: e.target.value.toUpperCase() })} />
            <button type="button" className="icon-button" aria-label={`Remover unidade ${i + 1}`} onClick={() => set({ unidades: form.unidades.filter((_, j) => j !== i) })}><Icon name="trash" size={16} /></button>
          </div>)}
          <button type="button" className="button outline" onClick={() => set({ unidades: [...form.unidades, { id: '', nome: '', cidade: '', uf: '', aliases: [] }] })}><Icon name="plus" size={16} />Adicionar unidade</button>
        </fieldset>
        <fieldset className="field"><legend>Procedimentos</legend>
          <div className="check-list">{PROCEDIMENTOS.map(p => <label className="check" key={p}><input type="checkbox" checked={form.procedimentos.includes(p)} onChange={e => set({ procedimentos: e.target.checked ? PROCEDIMENTOS.filter(x => x === p || form.procedimentos.includes(x)) : form.procedimentos.filter(x => x !== p) })} />{PROCEDIMENTO_LABELS[p]}</label>)}</div>
        </fieldset>
        <fieldset className="field"><legend>Cores da marca</legend>
          <div className="color-row">{(['primaria', 'secundaria', 'texto'] as const).map(k => <label className="color-field" key={k}><input type="color" value={form.cores[k]} onChange={e => set({ cores: { ...form.cores, [k]: e.target.value } })} /><span>{k === 'primaria' ? 'Primária' : k === 'secundaria' ? 'Secundária' : 'Texto'}<small className="muted">{form.cores[k]}</small></span></label>)}</div>
        </fieldset>
        <div className="field"><label htmlFor={`${uid}-logo`}>Logo (PNG, JPG, SVG ou WebP · até 2 MB)</label>
          <div className="logo-upload"><div className="empresa-logo big" style={{ background: form.cores.secundaria }}>{logo ? <img src={logo} alt="Pré-visualização da logo" /> : <span aria-hidden="true">Sem logo</span>}</div>
            <input id={`${uid}-logo`} type="file" accept={LOGO_TIPOS.join(',')} onChange={e => pickFile(e.target.files?.[0])} /></div></div>
        {problem && <p className="notice error" role="alert">{problem}</p>}
      </div>
      <footer className="drawer-foot"><button type="button" className="button outline" onClick={onClose}>Cancelar</button><button className="button primary" disabled={busy}>{busy ? 'Salvando…' : 'Salvar empresa'}</button></footer>
    </form>
  </div>;
}
