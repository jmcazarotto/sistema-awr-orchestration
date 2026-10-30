import { useEffect, useRef, useState } from 'react';
import { IA_EFFORT_LABELS, IA_SITUACOES, IA_SITUACAO_INFO, iaModelo, iaModeloLabel } from '../../shared/types';
import type { IaEffort, IaModelos, IaProvedor, IaSituacao, IaUsoResponse } from '../../shared/types';
import { useRuntime } from '../state/context';
import { useLoad } from '../state/useLoad';
import { formatBrl, formatUsd } from '../state/format';
import { Badge, Icon, PageHeading, errorMessage, useToast } from '../components/ui';

const TABS = [['custos', 'Custos de integração'], ['modelos', 'Modelos de IA']] as const;
type Aba = typeof TABS[number][0];
const abaDaUrl = (): Aba => { const a = new URLSearchParams(location.hash.split('?')[1] ?? '').get('aba'); return TABS.some(([id]) => id === a) ? a as Aba : 'custos'; };

export function SettingsPage() {
  const [tab, setTab] = useState<Aba>(abaDaUrl);
  const select = (next: Aba) => { setTab(next); history.replaceState(null, '', `#/configuracoes${next === 'custos' ? '' : `?aba=${next}`}`); };
  return <>
    <PageHeading eyebrow="WORKSPACE / CONFIGURAÇÕES" title="Configurações" description="Custos das integrações de IA e modelos usados por cada agente." />
    <div className="live-tabs" role="tablist" aria-label="Configurações">{TABS.map(([id, label]) => <button key={id} id={`tab-${id}`} role="tab" aria-selected={tab === id} aria-controls={`panel-${id}`} tabIndex={tab === id ? 0 : -1} onClick={() => select(id)} onKeyDown={e => { if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); const i = TABS.findIndex(([t]) => t === tab); const next = TABS[(i + (e.key === 'ArrowRight' ? 1 : TABS.length - 1)) % TABS.length]![0]; select(next); document.getElementById(`tab-${next}`)?.focus(); } }}>{label}</button>)}</div>
    <div id="panel-custos" role="tabpanel" aria-labelledby="tab-custos" hidden={tab !== 'custos'}>{tab === 'custos' && <CustosPanel />}</div>
    <div id="panel-modelos" role="tabpanel" aria-labelledby="tab-modelos" hidden={tab !== 'modelos'}>{tab === 'modelos' && <ModelosPanel />}</div>
  </>;
}

const PROVEDOR_LABEL: Record<IaProvedor, string> = { jev: 'Jev · TypeSafe AI', openai_decisions: 'Decisions API · OpenAI', openai: 'OpenAI', local: 'Simulado (local)' };
const inteiro = (n: number) => n.toLocaleString('pt-BR');

function CustosPanel() {
  const { api } = useRuntime(); const notify = useToast();
  const { data, error, loading, reload, setData } = useLoad(() => api.iaUso(), [api]);
  const [zerando, setZerando] = useState(false);
  const [confirmando, setConfirmando] = useState(false);
  // Atualiza sozinho enquanto a aba está aberta (triagens novas entram no total).
  useEffect(() => { const timer = setInterval(() => void api.iaUso().then(setData, () => undefined), 10000); return () => clearInterval(timer); }, [api, setData]);
  const zerar = async () => {
    setZerando(true);
    try { setData(await api.zerarIaUso()); setConfirmando(false); notify('Contador de custos zerado.'); } catch (e) { notify(errorMessage(e), true); } finally { setZerando(false); }
  };
  if (error) return <div className="error-banner" role="alert"><span>{error}</span><button className="button outline" onClick={reload}>Tentar novamente</button></div>;
  if (loading && !data) return <section className="card loading-state" role="status"><span className="loader" /><h2>Carregando custos…</h2></section>;
  if (!data) return null;
  return <>
    <div className="stats-grid">
      <article className="card stat featured"><div className="stat-icon"><Icon name="activity" /></div><div><span className="muted">Chamadas às IAs</span><strong>{inteiro(data.total.chamadas)}</strong><span className="stat-caption">{data.desde ? `desde ${new Date(data.desde).toLocaleString('pt-BR')}` : 'nenhuma chamada registrada'}</span></div></article>
      <article className="card stat"><div className="stat-icon"><Icon name="code" /></div><div><span className="muted">Custo total em dólar</span><strong>{formatUsd(data.total.usd)}</strong><span className="stat-caption">modelos com preço configurado</span></div></article>
      <article className="card stat"><div className="stat-icon"><Icon name="check" /></div><div><span className="muted">Custo total em real</span><strong>{formatBrl(data.total.brl)}</strong><span className="stat-caption">cotação US$ 1 = {formatBrl(data.cotacaoUsdBrl)}</span></div></article>
    </div>
    <div className="cost-overview-heading"><div><h2>Custos por integração</h2><p className="muted">Chamadas reais registradas por categoria.</p></div></div>
    <div className="cost-sections">
      <CustoSecao titulo="Classificadora" descricao="Triagem e outras chamadas de texto" itens={data.itens.filter(item => item.tipo === 'texto')} />
      <CustoSecao titulo="Geração de imagem" descricao="Modelos usados para criar artes" itens={data.itens.filter(item => item.tipo === 'imagem')} imagem />
    </div>
    <p className="muted cost-note">Apenas chamadas reais são contabilizadas. Custo em real = custo em dólar × {data.cotacaoUsdBrl.toLocaleString('pt-BR')} (variável <code>USD_BRL</code> do .env). Preços por 1M de tokens: Jev US$ 0,042 de entrada; Luna na Decisions API US$ 0,10 de entrada, ambos com saída gratuita; Luna em texto US$ 0,10 de entrada e US$ 0,50 de saída. Modelos de imagem: texto de entrada US$ 5, imagem de entrada US$ 8 e imagem gerada US$ 30.</p>
    <div className="cost-reset"><button className="button outline" onClick={() => setConfirmando(true)} disabled={zerando || data.total.chamadas === 0}><Icon name="undo" />Zerar contador</button></div>
    {confirmando && <ZerarCustosModal busy={zerando} onClose={() => setConfirmando(false)} onConfirm={() => void zerar()} />}
  </>;
}

function ZerarCustosModal({ busy, onClose, onConfirm }: { busy: boolean; onClose: () => void; onConfirm: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = dialog.current;
    const previous = document.activeElement as HTMLElement | null;
    element?.showModal();
    return () => { element?.close(); previous?.focus(); };
  }, []);
  return <dialog ref={dialog} className="feedback-modal" aria-labelledby="zerar-custos-title" aria-describedby="zerar-custos-description" onCancel={event => { event.preventDefault(); if (!busy) onClose(); }}>
    <div className="section-heading"><h2 id="zerar-custos-title">Zerar contador de custos?</h2><button className="icon-button" type="button" aria-label="Fechar janela" disabled={busy} onClick={onClose}><Icon name="close" /></button></div>
    <p id="zerar-custos-description" className="muted">As chamadas e os custos registrados para todas as integrações serão zerados. Esta ação não pode ser desfeita.</p>
    <div className="form-footer"><button type="button" className="button outline" autoFocus disabled={busy} onClick={onClose}>Cancelar</button><button type="button" className="button primary" disabled={busy} onClick={onConfirm}>{busy ? 'Zerando…' : 'Zerar contador'}</button></div>
  </dialog>;
}

function CustoSecao({ titulo, descricao, itens, imagem = false }: { titulo: string; descricao: string; itens: IaUsoResponse['itens']; imagem?: boolean }) {
  const total = itens.reduce((acc, item) => ({ chamadas: acc.chamadas + item.chamadas, usd: acc.usd + item.usd, brl: acc.brl + item.brl }), { chamadas: 0, usd: 0, brl: 0 });
  const custoParcial = itens.some(item => item.chamadas > 0 && !item.precificado);
  return <section className="card cost-section">
    <div className="cost-section-heading"><div className="cost-section-icon"><Icon name={imagem ? 'image' : 'activity'} /></div><div><h3>{titulo}</h3><p className="muted">{descricao}</p></div></div>
    <div className="cost-metrics">
      <div><span>Chamadas</span><strong>{inteiro(total.chamadas)}</strong></div>
      <div><span>Custo em dólar</span><strong>{formatUsd(total.usd)}</strong></div>
      <div><span>Custo em real</span><strong>{formatBrl(total.brl)}</strong></div>
    </div>
    {custoParcial && <p className="muted">O total inclui apenas modelos com preço configurado.</p>}
    <div className="cost-detail-title">Detalhamento por modelo</div>
    <div className="table-wrap"><table className="cost-table">
      <thead><tr><th>Modelo / integração</th><th>Chamadas</th><th>Tokens (entrada / saída)</th><th>Custo</th>{imagem && <th>Média por imagem</th>}</tr></thead>
      <tbody>{itens.map(item => <CustoRow key={`${item.provedor}:${item.modelo}`} item={item} imagem={imagem} />)}</tbody>
    </table></div>
  </section>;
}

function CustoRow({ item, imagem }: { item: IaUsoResponse['itens'][number]; imagem: boolean }) {
  const local = item.provedor === 'local';
  return <tr>
    <td><strong>{iaModeloLabel(item.modelo)}</strong><span className="cost-provider">{PROVEDOR_LABEL[item.provedor]} · {item.modelo}</span></td>
    <td>{inteiro(item.chamadas)}</td>
    <td>{inteiro(item.tokensEntrada)} / {inteiro(item.tokensSaida)}</td>
    <td>{local ? 'sem custo' : item.precificado ? <>{formatUsd(item.usd)}<span className="cost-provider">{formatBrl(item.brl)}</span></> : <Badge>Preço não configurado</Badge>}</td>
    {imagem && <td>{!local && item.precificado && item.chamadas > 0 ? <>{formatUsd(item.usd / item.chamadas)}<span className="cost-provider">{formatBrl(item.brl / item.chamadas)}</span></> : '—'}</td>}
  </tr>;
}

function ModelosPanel() {
  const { api } = useRuntime(); const notify = useToast();
  const { data, error, loading, reload } = useLoad(() => api.iaModelos().then(r => r.modelos), [api]);
  const [draft, setDraft] = useState<IaModelos | null>(null);
  const [saving, setSaving] = useState(false);
  useEffect(() => { if (data) setDraft(data); }, [data]);
  if (error) return <div className="error-banner" role="alert"><span>{error}</span><button className="button outline" onClick={reload}>Tentar novamente</button></div>;
  if (!draft) return loading ? <section className="card loading-state" role="status"><span className="loader" /><h2>Carregando modelos…</h2></section> : null;
  const dirty = JSON.stringify(draft) !== JSON.stringify(data);
  const setModelo = (s: IaSituacao, modelo: string) => {
    const efforts = iaModelo(modelo)?.efforts ?? [];
    const atual = draft[s].effort;
    setDraft({ ...draft, [s]: { modelo, effort: atual && efforts.includes(atual) ? atual : efforts.includes('medio') ? 'medio' : efforts[0] ?? null } });
  };
  const salvar = async () => {
    setSaving(true);
    try { const { modelos } = await api.saveIaModelos(draft); setDraft(modelos); reload(); notify('Modelos de IA salvos. Valem a partir da próxima chamada.'); }
    catch (e) { notify(errorMessage(e), true); } finally { setSaving(false); }
  };
  const grupos = [...new Set(IA_SITUACOES.map(s => IA_SITUACAO_INFO[s].agente))];
  return <section className="card">
    <div className="section-heading"><div><h2>Modelos de IA por situação</h2><p className="muted">Escolha o modelo e o nível de esforço (raciocínio) usado por cada agente. Mais esforço = respostas mais cuidadosas, porém mais lentas e caras.</p></div>
      <div className="model-actions"><button className="button outline" disabled={!dirty || saving} onClick={() => data && setDraft(data)}>Descartar</button><button className="button primary" disabled={!dirty || saving} onClick={() => void salvar()}><Icon name="save" />{saving ? 'Salvando…' : 'Salvar'}</button></div></div>
    {grupos.map(agente => <div key={agente} className="model-group">
      <div className="eyebrow">{agente.toUpperCase()}</div>
      {IA_SITUACOES.filter(s => IA_SITUACAO_INFO[s].agente === agente).map(s => {
        const info = IA_SITUACAO_INFO[s]; const escolha = draft[s]; const catalogo = iaModelo(escolha.modelo); const efforts = catalogo?.efforts ?? [];
        return <div key={s} className="model-row">
          <div className="model-info"><strong>{info.label}</strong><p className="muted">{info.descricao}</p></div>
          <label><span className="sr-only">Modelo · {info.label}</span>
            <select value={escolha.modelo} onChange={e => setModelo(s, e.target.value)} disabled={info.modelos.length === 1}>
              {info.modelos.map(id => { const m = iaModelo(id)!; return <option key={id} value={id}>{iaModeloLabel(m.id)}</option>; })}
            </select>
            <small className="muted">{catalogo?.descricao}</small>
          </label>
          <label><span className="sr-only">Esforço · {info.label}</span>
            {efforts.length ? <select value={escolha.effort ?? ''} onChange={e => setDraft({ ...draft, [s]: { ...escolha, effort: e.target.value as IaEffort } })}>
              {efforts.map(effort => <option key={effort} value={effort}>{s.startsWith('imagem_') ? `Qualidade ${IA_EFFORT_LABELS[effort].toLowerCase()}` : `Esforço ${IA_EFFORT_LABELS[effort].toLowerCase()}`}</option>)}
            </select> : <select disabled value=""><option value="">{s.startsWith('imagem_') ? 'Qualidade não se aplica' : 'Esforço não se aplica'}</option></select>}
          </label>
        </div>;
      })}
    </div>)}
    <div className="reading-map"><div className="eyebrow">Como a demanda é lida</div><dl>
      <div><dt>Regras do sistema</dt><dd>Preço com valor exato, telefone, datas, empresa citada no cadastro e fotos de antes e depois. Sem IA, sem custo.</dd></div>
      <div><dt>Leitura do briefing (texto)</dt><dd>Preço escrito de outro jeito, CTA, título, modelo da foto, descrição do antes e depois, tom e restrições. Não escolhe layout.</dd></div>
      <div><dt>Classificadora (Decisions API ou Jev)</dt><dd>Empresa, procedimento, tipo de arte e agente, sempre entre opções fechadas e com probabilidade. Só a Luna olha as imagens anexadas. Não escreve texto.</dd></div>
    </dl><p className="muted">Com a leitura desligada, a classificadora categoriza os trechos, mas não extrai valores.</p></div>
    <p className="muted cost-note">Padrões vêm do .env (<code>CLASSIFIER_PROVIDER</code>, <code>CLASSIFIER_MODEL</code>, <code>BRIEFING_MODEL</code>, <code>REVIEW_MODEL</code>, <code>FEEDBACK_MODEL</code>, <code>IMAGE_MODEL</code>). “Simulado” roda localmente, sem chamada de IA.</p>
  </section>;
}
