import { imageUrl } from '../../transport/client';
import type { CSSProperties, ReactNode } from 'react';
import type { ElementoTemplate, TemplateArte } from '../../../shared/types';
import { fotoImagem, fundoCss } from '../../state/templateEditor';

export const FONT_FAMILIES = {
  serif_display: '"Playfair Display", Georgia, "Times New Roman", serif',
  sans_black: 'Montserrat, Inter, "Segoe UI", sans-serif',
  sans: 'Inter, -apple-system, "Segoe UI", sans-serif',
} as const;
const PHOTO_LABELS: Record<string, string> = { foto_antes: 'ANTES', foto_depois: 'DEPOIS', foto_principal: 'FOTO' };
const STRIPES = 'repeating-linear-gradient(135deg,rgba(16,23,47,.09) 0 14px,rgba(16,23,47,0) 14px 28px)';
const JUSTIFY = { esquerda: 'flex-start', centro: 'center', direita: 'flex-end' } as const;

export type CanvasTemplate = Pick<TemplateArte, 'canvas' | 'fundo' | 'elementos'>;

export function elementoStyle(el: ElementoTemplate): CSSProperties {
  const s = el.estilo;
  return {
    position: 'absolute', left: el.x, top: el.y, width: el.w, height: el.h, zIndex: el.z, boxSizing: 'border-box',
    transform: el.rotacao ? `rotate(${el.rotacao}deg)` : undefined, opacity: s.opacidade,
    background: fundoCss(s.fundo), borderRadius: s.raio, overflow: 'hidden',
    border: s.borda && s.borda.largura > 0 ? `${s.borda.largura}px solid ${s.borda.cor}` : undefined,
    boxShadow: s.sombra ? (s.sombraConfig ? `${s.sombraConfig.x}px ${s.sombraConfig.y}px ${s.sombraConfig.desfoque}px ${s.sombraConfig.expansao}px color-mix(in srgb, ${s.sombraConfig.cor} ${s.sombraConfig.opacidade * 100}%, transparent)` : '0 14px 34px rgba(0,0,0,.38)') : undefined,
    display: 'flex', alignItems: 'center', justifyContent: JUSTIFY[s.alinhamento], userSelect: 'none',
  };
}

export function ElementoView({ el, logoUrl, labels = true }: { el: ElementoTemplate; logoUrl?: string | null; labels?: boolean }) {
  const s = el.estilo;
  if (el.tipo === 'foto_antes' || el.tipo === 'foto_depois' || el.tipo === 'foto_principal') {
    const img = fotoImagem(el);
    if (img) return <div style={elementoStyle(el)}><img src={img} alt="" draggable={false} style={{ width: '100%', height: '100%', objectFit: 'cover', pointerEvents: 'none' }} /></div>;
    return <div style={{ ...elementoStyle(el), background: s.fundo ? `${STRIPES}, ${fundoCss(s.fundo)}` : STRIPES, color: 'rgba(16,23,47,.55)', fontFamily: FONT_FAMILIES.sans_black, fontWeight: 900, fontSize: Math.max(24, Math.min(el.w, el.h) / 8), letterSpacing: 4 }}>{labels && PHOTO_LABELS[el.tipo]}</div>;
  }
  if (el.tipo === 'logo') {
    const chosenLogo = empresaLogoUrl(el.logoArquivo) ?? logoUrl;
    return <div style={elementoStyle(el)}>{chosenLogo ? <img src={chosenLogo} alt="" draggable={false} style={{ width: '100%', height: '100%', objectFit: 'contain', pointerEvents: 'none' }} /> : <span style={{ fontFamily: FONT_FAMILIES.sans_black, fontWeight: 900, fontSize: Math.min(el.h / 3, 32), color: s.cor, letterSpacing: 3 }}>{labels ? 'LOGO' : ''}</span>}</div>;
  }
  if (el.tipo === 'forma') return <div style={elementoStyle(el)} />;
  return <div style={{ ...elementoStyle(el), color: s.cor, fontFamily: FONT_FAMILIES[s.fonte], fontSize: s.tamanho, fontWeight: s.peso, fontStyle: s.italico ? 'italic' : 'normal', textTransform: s.caixaAlta ? 'uppercase' : 'none', textAlign: s.alinhamento === 'esquerda' ? 'left' : s.alinhamento === 'direita' ? 'right' : 'center', lineHeight: 1.05, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}><span style={{ width: '100%' }}>{el.conteudo}</span></div>;
}

/** Renderiza o template nas coordenadas reais do canvas, escalado para `width` px de largura. */
export function TemplateRenderer({ template, width, logoUrl, labels = false, children, className }: { template: CanvasTemplate; width: number; logoUrl?: string | null; labels?: boolean; children?: ReactNode; className?: string }) {
  const { largura, altura } = template.canvas; const scale = width / largura;
  return <div className={className} style={{ width, height: altura * scale, position: 'relative', overflow: 'hidden', borderRadius: 4 * Math.min(1, scale * 4) }}>
    <div style={{ width: largura, height: altura, transform: `scale(${scale})`, transformOrigin: '0 0', position: 'absolute', left: 0, top: 0, background: fundoCss(template.fundo) ?? '#ffffff', overflow: 'hidden' }}>
      {template.elementos.map(el => <ElementoView key={el.id} el={el} logoUrl={logoUrl} labels={labels} />)}
      {children}
    </div>
  </div>;
}

/** Logo da empresa: caminho do acervo (/acervo/*) ou data URL (modo demonstração). */
export function empresaLogoUrl(logo: string | null | undefined) {
  if (!logo) return null;
  return /^(data:|https?:)/.test(logo) ? logo : imageUrl(logo);
}
