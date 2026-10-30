import { useMemo } from 'react';
import { PROCEDIMENTO_LABELS } from '../../shared/types';
import type { FamiliaArte, Procedimento } from '../../shared/types';
import { useRuntime } from '../state/context';
import { useLoad } from '../state/useLoad';
import { Empty, Icon, PageHeading } from '../components/ui';
import { TemplateRenderer, empresaLogoUrl } from '../components/template/TemplateRenderer';

const FAMILIAS: { id: FamiliaArte; label: string }[] = [{ id: 'antes_depois', label: 'Antes e depois' }, { id: 'banco_imagem', label: 'Banco de imagem' }];
const proporcao = (largura: number, altura: number) => {
  let a = largura, b = altura;
  while (b) [a, b] = [b, a % b];
  return `${largura / a}:${altura / a}`;
};
const go = (params: Record<string, string | undefined>) => {
  const q = new URLSearchParams(Object.entries(params).filter((e): e is [string, string] => !!e[1]));
  location.hash = `/templates${q.size ? `?${q}` : ''}`;
};

/** Fluxo: empresa → procedimento → tipo de arte → 2 templates. A seleção vive na query do hash. */
export function TemplatesPage({ query }: { query: URLSearchParams }) {
  const { api } = useRuntime();
  const empresas = useLoad(() => api.empresas().then(r => r.empresas), [api]);
  const empresaId = query.get('empresa') ?? '';
  const empresa = empresas.data?.find(e => e.id === empresaId);
  const procedimento = empresa?.procedimentos.find(p => p === query.get('procedimento'));
  const familia = FAMILIAS.find(f => f.id === query.get('familia'))?.id;
  const ready = !!(empresa && procedimento && familia);
  const templates = useLoad(() => ready ? api.templates({ empresaId: empresa.id, procedimento, familia }).then(r => r.templates) : Promise.resolve([]), [api, empresa?.id, procedimento, familia]);
  const sorted = useMemo(() => [...(templates.data ?? [])].sort((a, b) => a.tipoTemplate.localeCompare(b.tipoTemplate)), [templates.data]);
  const logo = empresaLogoUrl(empresa?.logo);
  const base = { empresa: empresaId || undefined, procedimento, familia };

  return <>
    <PageHeading eyebrow="WORKSPACE / TEMPLATES" title="Templates por empresa" description="Escolha a empresa, o procedimento e o tipo de arte para ver e editar os dois templates da combinação." action={<a className="button outline" href="#/empresas"><Icon name="building" size={16} />Empresas</a>} />
    {empresas.error && <div className="error-banner" role="alert"><span>{empresas.error}</span><button className="button outline" onClick={empresas.reload}>Tentar novamente</button></div>}
    <section className="card template-steps" aria-label="Seleção de template">
      <div className="field"><label htmlFor="tpl-empresa"><span className="step-no">1</span>Empresa</label>
        <select id="tpl-empresa" value={empresaId} onChange={e => go({ empresa: e.target.value || undefined })}>
          <option value="">Selecione…</option>{empresas.data?.map(e => <option key={e.id} value={e.id}>{e.nome}</option>)}
        </select></div>
      <div className="field" role="group" aria-labelledby="tpl-proc-l"><span className="field-label" id="tpl-proc-l"><span className="step-no">2</span>Procedimento</span>
        <div className="segmented">{empresa ? empresa.procedimentos.map(p => <button key={p} type="button" aria-pressed={p === procedimento} className={p === procedimento ? 'active' : ''} onClick={() => go({ ...base, procedimento: p as Procedimento })}>{PROCEDIMENTO_LABELS[p]}</button>) : <span className="muted">Escolha uma empresa.</span>}</div></div>
      <div className="field" role="group" aria-labelledby="tpl-fam-l"><span className="field-label" id="tpl-fam-l"><span className="step-no">3</span>Tipo de arte</span>
        <div className="segmented">{FAMILIAS.map(f => <button key={f.id} type="button" disabled={!procedimento} aria-pressed={f.id === familia} className={f.id === familia ? 'active' : ''} onClick={() => go({ ...base, familia: f.id })}>{f.label}</button>)}</div></div>
    </section>
    {!ready ? <div style={{ marginTop: 20 }}><Empty>Selecione empresa, procedimento e tipo de arte para ver os templates.</Empty></div>
      : templates.error ? <div className="error-banner" role="alert" style={{ marginTop: 20 }}><span>{templates.error}</span><button className="button outline" onClick={templates.reload}>Tentar novamente</button></div>
      : templates.loading && !templates.data ? <section className="card loading-state" role="status" style={{ marginTop: 20 }}><span className="loader" /><h2>Carregando templates…</h2></section>
      : sorted.length === 0 ? <div style={{ marginTop: 20 }}><Empty>Nenhum template cadastrado para esta combinação.</Empty></div>
      : <div className="template-grid">{sorted.map(t => <article className="card template-card" key={t.id}>
        <div className="template-card-preview"><TemplateRenderer template={t} width={300} logoUrl={logo} labels /></div>
        <div className="template-card-info"><div><h2>{t.nome}</h2><p className="muted">{PROCEDIMENTO_LABELS[t.procedimento]} · {t.elementos.length} elementos</p>
          <p className="muted" style={{ marginTop: 6 }}><span title="Proporção">{proporcao(t.canvas.largura, t.canvas.altura)}</span> · <span title="Resolução">{t.canvas.largura} × {t.canvas.altura} px</span></p></div>
          <a className="button primary" href={`#/templates/${encodeURIComponent(t.id)}`} aria-label={`Editar ${t.nome}`}><Icon name="edit" size={16} />Editar</a></div>
      </article>)}</div>}
  </>;
}
