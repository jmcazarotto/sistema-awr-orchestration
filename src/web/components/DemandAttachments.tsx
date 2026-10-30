import { useRef, useState } from 'react';
import type { AnexoDemanda, PapelAnexo } from '../../shared/types';
import { useRuntime } from '../state/context';
import { imageUrl } from '../transport/client';
import { errorMessage, Icon } from './ui';

const labels: Record<PapelAnexo, string> = { antes: 'Foto de antes', depois: 'Foto de depois', referencia: 'Referências visuais' };
export function AttachmentGallery({ anexos }: { anexos: AnexoDemanda[] }) {
  return <div className="demand-attachment-gallery">{anexos.map(a => <a key={a.id} href={imageUrl(a.arquivo)} target="_blank" rel="noreferrer"><img src={imageUrl(a.arquivo)} alt={`${labels[a.papel]}: ${a.nome}`} /><strong>{labels[a.papel]}</strong><small>{a.nome}</small></a>)}</div>;
}

export function DemandAttachments({ value, onChange, onBusy, disabled=false }: { value: AnexoDemanda[]; onChange: (value: AnexoDemanda[]) => void; onBusy: (busy: boolean) => void; disabled?: boolean }) {
  const { api } = useRuntime();
  const pending = useRef(false);
  const [busy, setBusy] = useState<PapelAnexo | null>(null);
  const [hover, setHover] = useState<PapelAnexo | null>(null);
  const [error, setError] = useState<string | null>(null);
  async function upload(files: File[], papel: PapelAnexo) {
    if (pending.current || disabled || !files.length) return;
    setError(null);
    if (files.some(f => !['image/png', 'image/jpeg', 'image/webp'].includes(f.type) || f.size > 10 * 1024 * 1024)) { setError('Envie imagens PNG, JPG ou WebP de até 10 MB cada.'); return; }
    if (papel !== 'referencia' && files.length > 1 || papel === 'referencia' && value.filter(a => a.papel === papel).length + files.length > 8) { setError('Use uma foto de antes, uma de depois e até 8 referências.'); return; }
    pending.current = true; setBusy(papel); onBusy(true);
    let next = [...value];
    try {
      for (const file of files) {
        const { anexo } = await api.uploadAnexo(file, papel);
        next = [...(papel === 'referencia' ? next : next.filter(a => a.papel !== papel)), anexo];
        onChange(next);
      }
    } catch (e) { setError(errorMessage(e)); }
    finally { pending.current = false; setBusy(null); onBusy(false); }
  }
  return <section className="demand-attachments" aria-label="Imagens da demanda">
    <div className="demand-upload-grid">{(['referencia', 'antes', 'depois'] as const).map(papel => <div key={papel}>
      <label className={`demand-dropzone ${hover === papel ? 'dragover' : ''} ${busy||disabled ? 'uploading' : ''}`} onDragOver={e => { e.preventDefault(); if (!busy && !disabled) setHover(papel); }} onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setHover(null); }} onDrop={e => { e.preventDefault(); setHover(null); void upload(Array.from(e.dataTransfer.files), papel); }}>
        <input type="file" accept="image/png,image/jpeg,image/webp" multiple={papel === 'referencia'} disabled={!!busy||disabled} aria-label={`Adicionar ${labels[papel].toLowerCase()}`} onChange={e => { void upload(Array.from(e.currentTarget.files ?? []), papel); e.currentTarget.value = ''; }} />
        <Icon name="image" size={20} /><strong>{labels[papel]}</strong><span>{busy === papel ? 'Enviando…' : 'Arraste ou clique'}</span><small>{papel === 'referencia' ? 'Até 8 imagens' : '1 imagem'}</small>
      </label>
      <div className="demand-upload-items">{value.filter(a => a.papel === papel).map(a => <div key={a.id}><img src={imageUrl(a.arquivo)} alt={a.nome} /><span title={a.nome}>{a.nome}</span><button className="button outline small" type="button" disabled={!!busy||disabled} aria-label={`Remover ${a.nome}`} onClick={() => onChange(value.filter(item => item.id !== a.id))}><Icon name="close" size={14} /></button></div>)}</div>
    </div>)}</div>
    {error && <p className="notice" role="alert">{error}</p>}
  </section>;
}
