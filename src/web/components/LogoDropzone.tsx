import { useId, useRef, useState } from 'react';
import { Icon } from './ui';

export function LogoDropzone({ label, multiple = false, jpeg = false, disabled = false, uploading = false, onFiles, onProblem }: {
  label: string; multiple?: boolean; jpeg?: boolean; disabled?: boolean; uploading?: boolean;
  onFiles: (files: File[]) => void; onProblem: (message: string | null) => void;
}) {
  const id = useId(); const input = useRef<HTMLInputElement>(null); const [dragging, setDragging] = useState(false);
  const types = ['image/png', 'image/svg+xml', 'image/webp', ...(jpeg ? ['image/jpeg'] : [])];
  function receive(files: File[]) {
    setDragging(false);
    if (disabled || !files.length) return;
    if (!multiple && files.length > 1) return onProblem('Adicione apenas um arquivo para a logo principal.');
    if (files.some(f => !types.includes(f.type) || !f.size || f.size > 2 * 1024 * 1024)) return onProblem(`Use arquivos ${jpeg ? 'PNG, JPG, SVG ou WebP' : 'PNG, SVG ou WebP'} de até 2 MB cada.`);
    onProblem(null); onFiles(files);
  }
  return <div className="logo-drop-wrap">
    <input ref={input} id={id} className="sr-only" tabIndex={-1} aria-label={label} type="file" multiple={multiple} accept={types.join(',')} disabled={disabled} onChange={e => { receive(Array.from(e.target.files ?? [])); e.target.value = ''; }}/>
    <button type="button" className={`logo-dropzone${dragging ? ' dragging' : ''}`} aria-label={label} aria-disabled={disabled} aria-busy={uploading}
      onClick={() => { if (!disabled) input.current?.click(); }}
      onDragEnter={e => { e.preventDefault(); if (!disabled) setDragging(true); }}
      onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = disabled ? 'none' : 'copy'; }}
      onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragging(false); }}
      onDrop={e => { e.preventDefault(); e.stopPropagation(); receive(Array.from(e.dataTransfer.files)); }}>
      <span className="dropzone-icon"><Icon name={uploading ? 'clock' : 'upload'} size={28}/></span>
      <strong>{uploading ? 'Enviando arquivos…' : dragging ? 'Solte os arquivos aqui' : 'Arraste sua logo aqui'}</strong>
      <span>{uploading ? 'Aguarde o envio terminar' : 'ou clique para escolher'}</span>
      <small>{jpeg ? 'PNG, JPG, SVG ou WebP' : 'PNG, SVG ou WebP'}<br/>Até 2 MB por arquivo{multiple && ' · múltiplos arquivos'}</small>
    </button>
  </div>;
}
