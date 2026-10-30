import { LogoDropzone } from '../components/LogoDropzone';
import { galeriaLogos } from '../../shared/logos';
import { useEffect, useId, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { COMPOSICOES, PROCEDIMENTOS, PROCEDIMENTO_LABELS } from '../../shared/types';
import type { Empresa, EmpresaInput, Procedimento, ReferenciaMarca } from '../../shared/types';
import { imageUrl } from '../transport/client';
import { useRuntime } from '../state/context';
import { slugify, useLoad } from '../state/useLoad';
import { Badge, Empty, Icon, PageHeading, errorMessage, useToast } from '../components/ui';
import { logosCadastrados } from '../state/arteFinal';
import { empresaLogoUrl } from '../components/template/TemplateRenderer';

type PendingLogo = { id: string; file: File; fundo: 'claro' | 'escuro'; principal: boolean };
type SavedLogo = NonNullable<Empresa['galeriaLogos']>[number];
const blank = (): EmpresaInput => ({ id: '', nome: '', tipo: 'independente', aliases: [], unidades: [], procedimentos: [...PROCEDIMENTOS], cores: { primaria: '#c9a45c', secundaria: '#3f3d3b', texto: '#ffffff' } });
const toInput = (e: Empresa): EmpresaInput => ({ id: e.id, nome: e.nome, tipo: e.tipo, aliases: e.aliases, unidades: e.unidades, procedimentos: e.procedimentos, cores: e.cores, galeriaLogos: galeriaLogos(e) });

export function EmpresasPage() {
  const { api } = useRuntime();
  const { data, error, loading, reload } = useLoad(() => api.empresas().then(r => r.empresas), [api]);

  return <>
    <PageHeading eyebrow="WORKSPACE / EMPRESAS" title="Empresas (clientes)" description="Marcas, unidades, procedimentos e paleta que alimentam os templates e as demandas." action={<button className="button primary" onClick={() => { window.location.hash = '/empresas/nova'; }}><Icon name="plus" />Nova empresa</button>} />
    {error && <div className="error-banner" role="alert"><span>{error}</span><button className="button outline" onClick={reload}>Tentar novamente</button></div>}
    {loading && !data ? <section className="card loading-state" role="status"><span className="loader" /><h2>Carregando empresas…</h2></section>
      : data?.length ? <div className="empresa-grid">{data.map(e => <EmpresaCard key={e.id} empresa={e} onEdit={() => { window.location.hash = `/empresas/${e.id}`; }} />)}</div>
      : !error && <Empty>Nenhuma empresa cadastrada ainda.</Empty>}

  </>;
}

function LogoGroup({ fundo, itens, pendentes, onToggle, onTogglePending, onRemove, onRemovePending, onAdd, onProblem, uploading, disabled }: {
  uploading: boolean; disabled: boolean; fundo: 'claro' | 'escuro'; itens: SavedLogo[]; pendentes: PendingLogo[];
  onToggle: (arquivo: string, principal: boolean) => void; onTogglePending: (id: string, principal: boolean) => void;
  onRemove: (arquivo: string) => void; onRemovePending: (id: string) => void;
  onAdd: (files: File[]) => void; onProblem: (message: string | null) => void;
}) {
  return <section className="logo-group"><h3>Logos para fundo {fundo}</h3><p className="muted small-text">Marque as principais para priorizá-las na geração. Você pode marcar mais de uma.</p>
    <div className="logo-gallery">{itens.map(item => <LogoItem key={item.arquivo} fundo={fundo} src={empresaLogoUrl(item.arquivo)} nome={item.arquivo.split('/').pop()!} principal={item.principal} onToggle={value => onToggle(item.arquivo, value)} onRemove={() => onRemove(item.arquivo)}/>)}
      {pendentes.map(item => <LogoItem key={item.id} fundo={fundo} file={item.file} nome={item.file.name} principal={item.principal} onToggle={value => onTogglePending(item.id, value)} onRemove={() => onRemovePending(item.id)}/>)}</div>
    {!itens.length && !pendentes.length && <p className="muted small-text">Nenhuma logo adicionada.</p>}
    <LogoDropzone label={`Adicionar logos para fundo ${fundo}`} multiple disabled={disabled} uploading={uploading} onFiles={onAdd} onProblem={onProblem}/>

  </section>;
}

function LogoItem({ fundo, src, file, nome, principal, onToggle, onRemove }: {
  fundo: 'claro' | 'escuro'; src?: string | null; file?: File; nome: string; principal: boolean;
  onToggle: (value: boolean) => void; onRemove: () => void;
}) {
  const [preview, setPreview] = useState<string | null>(null);
  useEffect(() => { if (!file) return; const url = URL.createObjectURL(file); setPreview(url); return () => URL.revokeObjectURL(url); }, [file]);
  return <article className={`logo-gallery-item${principal ? ' is-primary' : ''}`}>
    <div className="logo-slot-preview" style={{ background: fundo === 'claro' ? '#f7f5f0' : '#111111' }}>{(preview ?? src) && <img src={(preview ?? src)!} alt={nome}/>}</div>
    <p className="logo-filename" title={nome}>{nome}</p>{file && <span className="muted small-text">Aguardando salvar</span>}
    <div className="logo-item-actions"><label className="check"><input type="checkbox" checked={principal} onChange={e => onToggle(e.target.checked)}/>Principal</label><button type="button" className="icon-button" aria-label={`Remover logo ${nome}`} onClick={onRemove}><Icon name="trash" size={16}/></button></div>
  </article>;
}

export function EmpresaDetailPage({ id }: { id: string }) {
  const { api } = useRuntime();
  const { data, error, loading, reload } = useLoad(() => id === 'nova' ? Promise.resolve(null) : api.empresa(id).then(r => r.empresa), [api, id]);
  const voltar = () => { window.location.hash = '/empresas'; };
  if (loading) return <section className="card" role="status">Carregando empresa...</section>;
  if (error) return <section className="card" role="alert"><p>{error}</p><button className="button outline" onClick={reload}>Tentar novamente</button><button className="button outline" onClick={voltar}>Voltar para empresas</button></section>;
  return <><PageHeading eyebrow="WORKSPACE / EMPRESAS" title={data?.nome ?? 'Nova empresa'} description="Dados da empresa, unidades, identidade visual e logos oficiais." action={<a className="button outline" href="#/empresas">Voltar para empresas</a>}/><EmpresaForm key={id} empresa={data ?? null} onClose={voltar} onSaved={voltar}/></>;
}

function EmpresaCard({ empresa, onEdit }: { empresa: Empresa; onEdit: () => void }) {
  const logo = empresaLogoUrl(empresa.logo);
  return <article className="card empresa-card">
    <div className="empresa-card-head">
      <div className="empresa-logo" style={{ background: empresa.cores.secundaria }}>{logo ? <img src={logo} alt={`Logo ${empresa.nome}`} /> : <span aria-hidden="true">{empresa.nome.slice(0, 2).toUpperCase()}</span>}</div>
      <div><h2>{empresa.nome}</h2><Badge active={empresa.tipo === 'franquia'}>{empresa.tipo === 'franquia' ? 'Franquia' : 'Independente'}</Badge></div>
    </div>
    {empresa.unidades.length > 0 && <p className="muted empresa-unidades"><Icon name="building" size={14} />{empresa.unidades.map(u => `${u.cidade}${u.uf ? `/${u.uf}` : ''}`).join(' · ')}</p>}
    <div className="chip-row" aria-label="Logos cadastradas">{logosCadastrados(empresa).map(l => <span className={`chip logo-chip${l.ok ? ' ok' : ''}`} key={l.id} title={l.ok ? `Logo ${l.label.toLowerCase()} cadastrada` : `Logo ${l.label.toLowerCase()} não cadastrada`}>{l.ok ? '✓' : '—'} {l.label}</span>)}</div>
    <div className="chip-row" aria-label="Procedimentos">{empresa.procedimentos.map(p => <span className="chip" key={p}>{PROCEDIMENTO_LABELS[p]}</span>)}</div>
    <div className="swatch-row" aria-label="Cores da marca">{Object.entries(empresa.cores).map(([nome, cor]) => <span className="swatch" key={nome} title={`${nome}: ${cor}`} style={{ background: cor }}><span className="sr-only">{nome} {cor}</span></span>)}</div>
    <div className="empresa-card-actions">
      <button className="button outline" onClick={onEdit}><Icon name="edit" size={16} />Editar</button>
      <a className="button primary" href={`#/templates?empresa=${encodeURIComponent(empresa.id)}`}><Icon name="layout" size={16} />Ver templates</a>
    </div>
  </article>;
}

const composicaoLabel = (value: string) => ({ modelo_destaque: 'Modelo em destaque', close_procedimento: 'Close do procedimento', informativa_clean: 'Informativa', antes_depois_editorial: 'Antes e depois', corporal: 'Corporal' } as Record<string, string>)[value] ?? value;

function ReferenciasEmpresa({ empresa }: { empresa: Empresa }) {
  const { api } = useRuntime(); const toast = useToast();
  const { data, error, loading, reload, setData } = useLoad(() => api.referenciasEmpresa(empresa.id).then(r => r.referencias), [api, empresa.id]);
  const [procedimento, setProcedimento] = useState<Procedimento>('botox');
  const [composicao, setComposicao] = useState('modelo_destaque');
  const [filtro, setFiltro] = useState('todos');
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  async function enviar(files: File[]) {
    if (!files.length || busy) return;
    setBusy(true); let enviados = 0;
    try {
      for (const file of files) { const result = await api.uploadReferencia(empresa.id, file, procedimento, composicao); setData(result.referencias); enviados++; }
      toast(`${enviados} referência(s) adicionada(s).`);
    } catch (e) { toast(`Enviadas: ${enviados}. ${errorMessage(e)}`, true); }
    finally { setBusy(false); }
  }
  async function categorizar(ref: ReferenciaMarca, proc: string, comp: string) {
    if (!(PROCEDIMENTOS as readonly string[]).includes(proc)) return;
    setBusy(true);
    try { setData((await api.categorizarReferencia(empresa.id, ref.id, proc as Procedimento, comp)).referencias); toast('Referência atualizada.'); }
    catch (e) { toast(errorMessage(e), true); } finally { setBusy(false); }
  }
  const refs = data?.filter(ref => filtro === 'todos' || ref.procedimento === filtro) ?? [];
  return <section className="card empresa-section"><div className="empresa-section-heading"><span className="stat-icon"><Icon name="image" /></span><div><h2>Referências aprovadas</h2><p>Organize imagens por procedimento para orientar a criação.</p></div></div>
    <div className="referencia-upload"><label>Procedimento para novos arquivos<select value={procedimento} onChange={e => setProcedimento(e.target.value as Procedimento)} disabled={busy}>{PROCEDIMENTOS.map(p => <option key={p} value={p}>{PROCEDIMENTO_LABELS[p]}</option>)}</select></label><label>Tipo de composição<select value={composicao} onChange={e => setComposicao(e.target.value)} disabled={busy}>{COMPOSICOES.map(c => <option key={c} value={c}>{composicaoLabel(c)}</option>)}</select></label><input ref={input} className="sr-only" type="file" multiple accept="image/png,image/jpeg,image/webp" onChange={e => { void enviar(Array.from(e.target.files ?? [])); e.target.value = ''; }} /><button type="button" className="button primary" disabled={busy} onClick={() => input.current?.click()}><Icon name="upload" size={16} />{busy ? 'Salvando…' : 'Adicionar imagens'}</button></div>
    <p className="muted small-text">PNG, JPG ou WebP, até 10 MB por imagem. Para imagens de antes e depois, selecione essa composição.</p>
    <div className="referencia-filter"><label>Mostrar <select value={filtro} onChange={e => setFiltro(e.target.value)}><option value="todos">Todos os procedimentos</option>{PROCEDIMENTOS.map(p => <option key={p} value={p}>{PROCEDIMENTO_LABELS[p]}</option>)}<option value="outros">Outros</option></select></label><span className="muted small-text">{refs.length} referência(s)</span></div>
    {error ? <div role="alert">{error} <button type="button" className="button outline" onClick={reload}>Tentar novamente</button></div> : loading && !data ? <p>Carregando referências…</p> : refs.length ? <div className="marca-gallery referencia-empresa-gallery">{refs.map(ref => <article className="marca-ref" key={ref.id}><a href={imageUrl(ref.arquivo)} target="_blank" rel="noreferrer"><img src={imageUrl(ref.arquivo)} alt={`Referência ${ref.id}`} loading="lazy" /></a><div className="referencia-controls"><strong>{ref.id.replace(/_/g, ' ')}</strong><label>Procedimento<select aria-label={`Procedimento de ${ref.id}`} disabled={busy} value={ref.procedimento} onChange={e => void categorizar(ref, e.target.value, ref.composicao)}>{!(PROCEDIMENTOS as readonly string[]).includes(ref.procedimento) && <option value={ref.procedimento}>{ref.procedimento}</option>}{PROCEDIMENTOS.map(p => <option key={p} value={p}>{PROCEDIMENTO_LABELS[p]}</option>)}</select></label><label>Composição<select aria-label={`Composição de ${ref.id}`} disabled={busy} value={ref.composicao} onChange={e => void categorizar(ref, ref.procedimento, e.target.value)}>{COMPOSICOES.map(c => <option key={c} value={c}>{composicaoLabel(c)}</option>)}</select></label></div></article>)}</div> : <Empty>Nenhuma referência neste procedimento.</Empty>}
  </section>;
}

function EmpresaForm({ empresa, onClose, onSaved }: { empresa: Empresa | null; onClose: () => void; onSaved: () => void }) {
  const { api } = useRuntime(); const toast = useToast(); const uid = useId();
  const [form, setForm] = useState<EmpresaInput>(() => empresa ? toInput(empresa) : blank());
  const [tab, setTab] = useState('informacoes');
  const tabs = [{ id: 'informacoes', label: 'Informações', icon: 'building' }, { id: 'unidades', label: 'Unidades', icon: 'grid' }, { id: 'identidade', label: 'Identidade Visual', icon: 'image' }, { id: 'referencias', label: 'Referências', icon: 'image' }];
  const [idTouched, setIdTouched] = useState(!!empresa);
  const [aliases, setAliases] = useState(() => (empresa?.aliases ?? []).join(', '));
  const [file, setFile] = useState<File | null>(null);
  const [pendentes, setPendentes] = useState<PendingLogo[]>([]);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState<'principal' | 'claro' | 'escuro' | null>(null);
  const uploadLock = useRef(false);
  const [uploadedLogo, setUploadedLogo] = useState(empresa?.logo ?? null);
  const [uploadStatus, setUploadStatus] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const first = useRef<HTMLInputElement>(null);
  useEffect(() => { first.current?.focus(); }, []);
  useEffect(() => { if (!file) { setPreview(null); return; } const url = URL.createObjectURL(file); setPreview(url); return () => URL.revokeObjectURL(url); }, [file]);
  const set = (patch: Partial<EmpresaInput>) => setForm(f => ({ ...f, ...patch }));
  const logo = preview ?? empresaLogoUrl(uploadedLogo);

  async function addFiles(files: File[], fundo: 'principal' | 'claro' | 'escuro') {
    if (uploadLock.current || busy) return;
    if (!empresa) {
      if (fundo === 'principal') setFile(files[0]!);
      else setPendentes(items => [...items, ...files.map(file => ({ id: crypto.randomUUID(), file, fundo, principal: false }))]);
      return;
    }
    uploadLock.current = true; setUploading(fundo); setProblem(null); setUploadStatus('');
    let enviados = 0; const falhas: string[] = [];
    try {
      for (const arquivo of files) {
        try {
          const { empresa: saved } = await api.uploadLogo(empresa.id, arquivo, fundo, fundo === 'principal');
          if (fundo === 'principal') setUploadedLogo(saved.logo);
          else {
            const added = galeriaLogos(saved).filter(l => l.fundo === fundo).at(-1)!;
            setForm(f => ({ ...f, galeriaLogos: [...(f.galeriaLogos ?? []), added] }));
          }
          enviados++;
        } catch (error) { falhas.push(`${arquivo.name}: ${errorMessage(error)}`); }
      }
      if (enviados) setUploadStatus(`${enviados} arquivo(s) enviado(s) e salvo(s) na empresa.`);
      if (falhas.length) setProblem(`Não foi possível enviar: ${falhas.join('; ')}. Arraste esses arquivos novamente para tentar de novo.`);
    } finally { uploadLock.current = false; setUploading(null); }
  }
  async function submit(e: FormEvent) {
    e.preventDefault(); if (uploadLock.current || busy) return; setProblem(null);
    const payload: EmpresaInput = { ...form, id: form.id || slugify(form.nome), aliases: aliases.split(',').map(a => a.trim()).filter(Boolean), unidades: form.unidades.map(({ uf, ...u }) => ({ ...u, ...(uf ? { uf } : {}), id: u.id || slugify(u.nome || u.cidade) })).filter(u => u.nome.trim() && u.cidade.trim()) };
    if (!payload.nome.trim()) { setTab('informacoes'); setProblem('Informe o nome da empresa.'); return; }
    if (!/^[a-z0-9_]+$/.test(payload.id)) return setProblem('O identificador deve ter apenas letras minúsculas, números e "_".');
    if (!payload.procedimentos.length) return setProblem('Selecione ao menos um procedimento.');
    setBusy(true);
    try {
      await api.saveEmpresa(payload);
      if (file) { await api.uploadLogo(payload.id, file, 'principal'); setFile(null); }
      for (const item of pendentes) {
        const { empresa: saved } = await api.uploadLogo(payload.id, item.file, item.fundo, item.principal);
        setForm(f => ({ ...f, galeriaLogos: galeriaLogos(saved) }));
        setPendentes(items => items.filter(l => l.id !== item.id));
      }
      toast(`${payload.nome} salva com sucesso.`); onSaved();
    } catch (err) { setProblem(errorMessage(err)); } finally { setBusy(false); }
  }
  const updateUnidade = (i: number, patch: Partial<EmpresaInput['unidades'][number]>) => set({ unidades: form.unidades.map((u, j) => j === i ? { ...u, ...patch } : u) });

  return <div className="empresa-detail">
    <form className="empresa-form" aria-labelledby={`${uid}-t`} noValidate onSubmit={e => void submit(e)}>
      <fieldset className="empresa-form-fields" disabled={busy}>
      <h2 id={`${uid}-t`} className="sr-only">Configurações da empresa</h2>
      <div className="empresa-tabs" role="tablist" aria-label="Configurações da empresa">{tabs.map((item, index) => <button type="button" role="tab" id={`${uid}-tab-${item.id}`} aria-controls={`${uid}-panel-${item.id}`} aria-selected={tab === item.id} tabIndex={tab === item.id ? 0 : -1} key={item.id} onClick={() => setTab(item.id)} onKeyDown={event => {
        const next = event.key === 'ArrowRight' ? (index + 1) % tabs.length : event.key === 'ArrowLeft' ? (index + tabs.length - 1) % tabs.length : event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : null;
        if (next !== null) { event.preventDefault(); setTab(tabs[next]!.id); document.getElementById(`${uid}-tab-${tabs[next]!.id}`)?.focus(); }
      }}><Icon name={item.icon} size={18}/>{item.label}</button>)}</div>
      <div className="empresa-form-body">
        <div role="tabpanel" id={`${uid}-panel-informacoes`} aria-labelledby={`${uid}-tab-informacoes`} hidden={tab !== 'informacoes'}>
        <section className="card empresa-section company-basics"><div className="empresa-section-heading"><span className="stat-icon"><Icon name="building"/></span><div><h2>Dados da empresa</h2><p>Identificação e organização do cadastro.</p></div></div>
        <div className="field"><label htmlFor={`${uid}-nome`}>Nome</label><input id={`${uid}-nome`} ref={first} value={form.nome} onChange={e => set({ nome: e.target.value, ...(idTouched ? {} : { id: slugify(e.target.value) }) })} required /></div>
        <div className="field-row">
          <div className="field"><label htmlFor={`${uid}-id`}>Identificador</label><input id={`${uid}-id`} value={form.id} disabled={!!empresa} onChange={e => { setIdTouched(true); set({ id: slugify(e.target.value) }); }} placeholder="gerado a partir do nome" /></div>
          <div className="field"><label htmlFor={`${uid}-tipo`}>Tipo</label><select id={`${uid}-tipo`} value={form.tipo} onChange={e => set({ tipo: e.target.value as EmpresaInput['tipo'] })}><option value="independente">Independente</option><option value="franquia">Franquia</option></select></div>
        </div>
        <div className="field"><label htmlFor={`${uid}-alias`}>Apelidos (separados por vírgula)</label><input id={`${uid}-alias`} value={aliases} onChange={e => setAliases(e.target.value)} placeholder="Royal, RoyalFace" /></div>
        <fieldset className="field"><legend>Procedimentos</legend>
          <div className="check-list">{PROCEDIMENTOS.map(p => <label className="check" key={p}><input type="checkbox" checked={form.procedimentos.includes(p)} onChange={e => set({ procedimentos: e.target.checked ? PROCEDIMENTOS.filter(x => x === p || form.procedimentos.includes(x)) : form.procedimentos.filter(x => x !== p) })} />{PROCEDIMENTO_LABELS[p]}</label>)}</div>
        </fieldset>
        </section></div><div role="tabpanel" id={`${uid}-panel-unidades`} aria-labelledby={`${uid}-tab-unidades`} hidden={tab !== 'unidades'}><section className="card empresa-section company-units"><div className="empresa-section-heading"><span className="stat-icon"><Icon name="grid"/></span><div><h2>Unidades da empresa</h2><p>Organize as unidades e suas cidades de atendimento.</p></div></div><fieldset className="field"><legend>Unidades</legend>
          {form.unidades.map((u, i) => <div className="unidade-row" key={i}>
            <input aria-label={`Nome da unidade ${i + 1}`} placeholder="Nome (ex.: Royal Face Castanhal)" value={u.nome} onChange={e => updateUnidade(i, { nome: e.target.value })} />
            <input aria-label={`Cidade da unidade ${i + 1}`} placeholder="Cidade" value={u.cidade} onChange={e => updateUnidade(i, { cidade: e.target.value })} />
            <input aria-label={`UF da unidade ${i + 1}`} placeholder="UF" maxLength={2} value={u.uf ?? ''} onChange={e => updateUnidade(i, { uf: e.target.value.toUpperCase() })} />
            <button type="button" className="icon-button" aria-label={`Remover unidade ${i + 1}`} onClick={() => set({ unidades: form.unidades.filter((_, j) => j !== i) })}><Icon name="trash" size={16} /></button>
          </div>)}
          <button type="button" className="button outline" onClick={() => set({ unidades: [...form.unidades, { id: '', nome: '', cidade: '', uf: '', aliases: [] }] })}><Icon name="plus" size={16} />Adicionar unidade</button>
        </fieldset>

        </section></div><div role="tabpanel" id={`${uid}-panel-identidade`} aria-labelledby={`${uid}-tab-identidade`} hidden={tab !== 'identidade'}><section className="card empresa-section company-identity"><div className="empresa-section-heading"><span className="stat-icon"><Icon name="image"/></span><div><h2>Identidade visual</h2><p>As cores e a assinatura principal da sua marca.</p></div></div><fieldset className="field"><legend>Cores da marca</legend>
          <div className="color-row">{(['primaria', 'secundaria', 'texto'] as const).map(k => <label className="color-field" key={k}><input type="color" value={form.cores[k]} onChange={e => set({ cores: { ...form.cores, [k]: e.target.value } })} /><span>{k === 'primaria' ? 'Primária' : k === 'secundaria' ? 'Secundária' : 'Texto'}<small className="muted">{form.cores[k]}</small></span></label>)}</div>
        </fieldset>
        <div className="primary-logo-layout"><div className="primary-logo-current"><h3>Logo principal</h3><p className="muted small-text">Assinatura usada no cadastro e como alternativa nas artes.</p><div className="empresa-logo big" style={{ background: form.cores.secundaria }}>{logo ? <img src={logo} alt="Logo principal da empresa"/> : <span>Sem logo</span>}</div></div><LogoDropzone label="Adicionar logo principal" jpeg disabled={busy || !!uploading} uploading={uploading === 'principal'} onFiles={files => void addFiles(files, 'principal')} onProblem={setProblem}/></div>
        </section><section className="card empresa-section company-logos"><div className="empresa-section-heading"><span className="stat-icon"><Icon name="upload"/></span><div><h2>Biblioteca de logos</h2><p>{empresa ? 'Arraste os arquivos para o fundo correspondente. O envio é automático.' : 'Adicione as logos abaixo. Os arquivos serão enviados ao salvar a nova empresa.'}</p></div></div>
        <fieldset className="field logo-variantes"><legend>Logos para a arte final</legend>
          <p className="muted small-text">O Van Gogh cola o arquivo oficial na arte automaticamente, escolhendo posição e variante conforme o fundo.</p>
          <div className="logo-slots">
            {(['claro', 'escuro'] as const).map(fundo => <LogoGroup key={fundo} fundo={fundo} disabled={busy || !!uploading} uploading={uploading === fundo} itens={(form.galeriaLogos ?? []).filter(l => l.fundo === fundo)} pendentes={pendentes.filter(l => l.fundo === fundo)}
              onToggle={(arquivo, principal) => set({ galeriaLogos: form.galeriaLogos?.map(l => l.arquivo === arquivo && l.fundo === fundo ? { ...l, principal } : l) })}
              onTogglePending={(id, principal) => setPendentes(items => items.map(l => l.id === id ? { ...l, principal } : l))}
              onRemove={arquivo => set({ galeriaLogos: form.galeriaLogos?.filter(l => !(l.arquivo === arquivo && l.fundo === fundo)) })}
              onRemovePending={id => setPendentes(items => items.filter(l => l.id !== id))}
              onAdd={files => void addFiles(files, fundo)} onProblem={setProblem}/>) }
          </div>
        </fieldset>
        </section></div>
        <div role="tabpanel" id={`${uid}-panel-referencias`} aria-labelledby={`${uid}-tab-referencias`} hidden={tab !== 'referencias'}>{tab === 'referencias' && (empresa ? <ReferenciasEmpresa empresa={empresa} /> : <section className="card"><p>Salve a empresa para adicionar referências.</p></section>)}</div>
        {uploadStatus && <p className="upload-status" role="status"><Icon name="check" size={18}/>{uploadStatus}</p>}
        {problem && <p className="notice error" role="alert">{problem}</p>}
      </div>
      <footer className="empresa-form-foot"><p className="muted small-text">{empresa ? 'Uploads são salvos na hora. Salve as demais configurações ao concluir.' : 'Salve para cadastrar a empresa e enviar os arquivos.'}</p><button type="button" className="button outline" onClick={onClose}>Cancelar</button><button className="button primary" disabled={busy || !!uploading}>{busy ? 'Salvando…' : 'Salvar empresa'}</button></footer>
      </fieldset>
    </form>
  </div>;
}

