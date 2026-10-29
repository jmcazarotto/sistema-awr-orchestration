import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { Empresa } from '../../../shared/types';
import { galeriaLogos } from '../../../shared/logos';
import { empresaLogoUrl } from './TemplateRenderer';
import { Icon } from '../ui';

export function LogoContextPicker({ empresa, current, x, y, onPick, onClose }: {
  empresa: Empresa | null; current?: string | null; x: number; y: number;
  onPick: (arquivo: string | null) => void; onClose: () => void;
}) {
  const [modal, setModal] = useState(false);
  const menu = useRef<HTMLDivElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const close = useRef(onClose); close.current = onClose;
  useEffect(() => {
    if (modal) { dialog.current?.showModal(); return; }
    menu.current?.querySelector('button')?.focus({ preventScroll: true });
    const outside = (event: PointerEvent) => { if (!menu.current?.contains(event.target as Node)) close.current(); };
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') { event.preventDefault(); close.current(); } };
    const dismiss = () => close.current();
    window.addEventListener('pointerdown', outside); window.addEventListener('keydown', escape);
    window.addEventListener('resize', dismiss); window.addEventListener('wheel', dismiss, true);
    return () => { window.removeEventListener('pointerdown', outside); window.removeEventListener('keydown', escape); window.removeEventListener('resize', dismiss); window.removeEventListener('wheel', dismiss, true); };
  }, [modal]);
  const pick = (arquivo: string | null) => { onPick(arquivo); onClose(); };
  return createPortal(modal ? <dialog ref={dialog} className="tpl-logo-dialog" aria-labelledby="logo-picker-title" onCancel={onClose} onClick={event => { if (event.target === event.currentTarget) { const r = event.currentTarget.getBoundingClientRect(); if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) onClose(); } }}>
    <header className="section-heading"><div><div className="eyebrow">BIBLIOTECA DA EMPRESA</div><h2 id="logo-picker-title">Escolher logo · {empresa?.nome ?? 'Empresa'}</h2></div><button type="button" className="icon-button" aria-label="Fechar biblioteca de logos" onClick={onClose}><Icon name="close"/></button></header>
    <p className="muted small-text">Escolha uma logo para substituir apenas este elemento no design.</p>
    <button type="button" className="button outline small" onClick={() => pick(null)}>Usar logo principal da empresa</button>
    {empresa?.logo && <div className="tpl-logo-modal-grid"><button type="button" className="tpl-logo-choice" aria-pressed={!current || current === empresa.logo} onClick={() => pick(empresa.logo)}><span className="tpl-logo-preview"><img src={empresaLogoUrl(empresa.logo)!} alt="Logo principal"/></span><span>Logo principal</span></button></div>}
    {(['claro', 'escuro'] as const).map(fundo => {
      const logos = empresa ? galeriaLogos(empresa).filter(l => l.fundo === fundo) : [];
      return <section key={fundo}><h3>Para fundo {fundo}</h3><div className="tpl-logo-modal-grid">{logos.map((logo, i) => <button type="button" className="tpl-logo-choice" key={logo.arquivo} aria-label={`Escolher logo para fundo ${fundo} ${i + 1}`} aria-pressed={current === logo.arquivo} onClick={() => pick(logo.arquivo)}><span className="tpl-logo-preview" style={{ background: fundo === 'claro' ? '#f7f5f0' : '#171717' }}><img src={empresaLogoUrl(logo.arquivo)!} alt={`Logo ${i + 1}`}/></span><span>{logo.principal ? '★ Principal' : `Logo ${i + 1}`}{current === logo.arquivo && ' ✓'}</span></button>)}</div>{!logos.length && <p className="muted small-text">Nenhuma logo cadastrada neste grupo.</p>}</section>;
    })}
  </dialog> : <div ref={menu} role="menu" aria-label="Opções da logo" className="tpl-context-menu" style={{ left: Math.max(8, Math.min(x, window.innerWidth - 208)), top: Math.max(8, Math.min(y, window.innerHeight - 64)) }} onContextMenu={e => e.preventDefault()}>
    <button type="button" role="menuitem" onClick={() => setModal(true)}><Icon name="image" size={18}/>Escolher logo</button>
  </div>, document.body);
}
