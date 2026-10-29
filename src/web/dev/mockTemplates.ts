import { PROCEDIMENTOS, TIPOS_TEMPLATE, ElementoTemplateSchema, templateId } from '../../shared/types';
import type { ElementoTemplate, Empresa, Procedimento, TemplateArte, TipoTemplate } from '../../shared/types';

/* Dados de demonstração (modo ?mock=1): empresa Royal Face e 12 templates (3 procedimentos × 4 slots). */
export const seedEmpresas = (): Empresa[] => [{
  id: 'royal_face', nome: 'Royal Face', tipo: 'franquia', aliases: ['Royal', 'RoyalFace'],
  unidades: [
    { id: 'castanhal', nome: 'Royal Face Castanhal', cidade: 'Castanhal', uf: 'PA', aliases: [] },
    { id: 'maringa', nome: 'Royal Face Maringá', cidade: 'Maringá', uf: 'PR', aliases: [] },
  ],
  procedimentos: [...PROCEDIMENTOS], logo: null, logos: { claro: null, escuro: null }, cores: { primaria: '#c9a45c', secundaria: '#3f3d3b', texto: '#ffffff' },
}];

const TEXTOS: Record<Procedimento, { titulo: string; sub: string; destaque: string; tamSub: number }> = {
  preenchimento_labial: { titulo: 'Preenchimento', sub: 'BIGODE', destaque: 'CHINÊS', tamSub: 120 },
  botox: { titulo: 'Toxina', sub: 'BOTOX', destaque: 'NATURAL', tamSub: 120 },
  fios_sustentacao: { titulo: 'Fios de', sub: 'LIFTING', destaque: 'SUSTENTAÇÃO', tamSub: 112 },
};
const GOLD = 'linear:#e9cf8e,#b88a45';
type Parcial = Partial<Omit<ElementoTemplate, 'estilo'>> & { estilo?: Partial<ElementoTemplate['estilo']> };
let seq = 0;
function el(tipo: ElementoTemplate['tipo'], rotulo: string, x: number, y: number, w: number, h: number, extra: Parcial = {}): ElementoTemplate {
  return ElementoTemplateSchema.parse({ id: `${tipo}_${++seq}`, tipo, rotulo, x, y, w, h, z: seq, ...extra, estilo: extra.estilo ?? {} });
}
const foto = { fundo: '#d9d6d1', raio: 40, borda: { cor: '#8d8b88', largura: 16 }, sombra: true };

function elementos(p: Procedimento, slot: TipoTemplate): { fundo: string; els: ElementoTemplate[] } {
  seq = 0;
  const t = TEXTOS[p];
  if (slot === 'antes_depois_1') return { fundo: 'linear:#4a4947,#9b7d57', els: [
    el('foto_antes', 'Foto antes', 68, 243, 460, 462, { estilo: foto }),
    el('foto_depois', 'Foto depois', 550, 243, 460, 462, { estilo: foto }),
    el('titulo', 'Título', 140, 780, 800, 120, { conteudo: t.titulo, estilo: { fonte: 'serif_display', tamanho: 104, peso: 500, cor: '#ffffff' } }),
    el('subtitulo', 'Subtítulo', 160, 895, 470, 115, { conteudo: t.sub, estilo: { fonte: 'sans_black', tamanho: t.tamSub, peso: 900, caixaAlta: true, alinhamento: 'direita' } }),
    el('destaque', 'Destaque', 648, 902, 278, 82, { conteudo: t.destaque, estilo: { fonte: 'sans_black', tamanho: 48, peso: 900, cor: '#111111', fundo: GOLD, raio: 14, caixaAlta: true } }),
    el('preco', 'Preço', 245, 1020, 300, 110, { conteudo: '12X R$ {{preco}} 1ML', estilo: { fonte: 'sans_black', tamanho: 44, peso: 900 } }),
    el('forma', 'Divisor', 583, 1025, 3, 105, { estilo: { fundo: '#ffffff' } }),
    el('logo', 'Logo', 620, 1012, 220, 130),
    el('forma', 'Faixa', 0, 1308, 1080, 42, { estilo: { fundo: 'linear:#c08a55,#f3d79a' } }),
  ] };
  if (slot === 'antes_depois_2') return { fundo: 'linear:#3f3d3b,#8a6f4e', els: [
    el('titulo', 'Título', 90, 70, 900, 130, { conteudo: t.titulo, estilo: { fonte: 'serif_display', tamanho: 100, peso: 500 } }),
    el('subtitulo', 'Subtítulo', 90, 195, 900, 110, { conteudo: t.sub, estilo: { fonte: 'sans_black', tamanho: 96, peso: 900, caixaAlta: true, cor: '#e9cf8e' } }),
    el('foto_antes', 'Foto antes', 140, 340, 800, 380, { estilo: foto }),
    el('foto_depois', 'Foto depois', 140, 750, 800, 380, { estilo: foto }),
    el('preco', 'Preço', 90, 1160, 520, 90, { conteudo: '12X R$ {{preco}}', estilo: { fonte: 'sans_black', tamanho: 52, peso: 900, alinhamento: 'esquerda' } }),
    el('logo', 'Logo', 720, 1150, 270, 110),
    el('forma', 'Faixa', 0, 1308, 1080, 42, { estilo: { fundo: 'linear:#c08a55,#f3d79a' } }),
  ] };
  if (slot === 'banco_imagem_1') return { fundo: '#2b2a29', els: [
    el('foto_principal', 'Foto principal', 0, 0, 1080, 1350),
    el('forma', 'Degradê escuro', 0, 650, 1080, 700, { estilo: { fundo: 'linear:#00000000,#000000e6' } }),
    el('titulo', 'Título', 80, 900, 920, 130, { conteudo: t.titulo, estilo: { fonte: 'serif_display', tamanho: 104, peso: 500, alinhamento: 'esquerda' } }),
    el('subtitulo', 'Subtítulo', 80, 1020, 920, 120, { conteudo: t.sub, estilo: { fonte: 'sans_black', tamanho: 100, peso: 900, caixaAlta: true, alinhamento: 'esquerda', cor: '#e9cf8e' } }),
    el('destaque', 'Destaque', 80, 1170, 300, 80, { conteudo: 'AGENDE', estilo: { fonte: 'sans_black', tamanho: 40, peso: 900, cor: '#111111', fundo: GOLD, raio: 14 } }),
    el('logo', 'Logo', 760, 1150, 240, 110),
  ] };
  return { fundo: 'linear:#3f3d3b,#6e5a43', els: [
    el('foto_principal', 'Foto principal', 0, 0, 1080, 810, { estilo: { fundo: '#d9d6d1', raio: 0 } }),
    el('titulo', 'Título', 80, 850, 920, 130, { conteudo: t.titulo, estilo: { fonte: 'serif_display', tamanho: 96, peso: 500 } }),
    el('subtitulo', 'Subtítulo', 80, 970, 920, 110, { conteudo: t.sub, estilo: { fonte: 'sans_black', tamanho: 96, peso: 900, caixaAlta: true, cor: '#e9cf8e' } }),
    el('preco', 'Preço', 80, 1100, 600, 90, { conteudo: '12X R$ {{preco}}', estilo: { fonte: 'sans_black', tamanho: 52, peso: 900, alinhamento: 'esquerda' } }),
    el('logo', 'Logo', 740, 1090, 260, 120),
    el('forma', 'Faixa', 0, 1308, 1080, 42, { estilo: { fundo: 'linear:#c08a55,#f3d79a' } }),
  ] };
}

export function seedTemplates(empresaId = 'royal_face'): TemplateArte[] {
  const ts = new Date().toISOString();
  return PROCEDIMENTOS.flatMap(procedimento => TIPOS_TEMPLATE.map(tipoTemplate => {
    const { fundo, els } = elementos(procedimento, tipoTemplate);
    const familia = tipoTemplate.startsWith('antes_depois') ? 'antes_depois' as const : 'banco_imagem' as const;
    return { id: templateId(empresaId, procedimento, tipoTemplate), empresaId, procedimento, familia, tipoTemplate, nome: `${familia === 'antes_depois' ? 'Antes e depois' : 'Banco de imagem'} ${tipoTemplate.slice(-1)}`, canvas: { largura: 1080, altura: 1350 }, fundo, elementos: els, atualizadoEm: ts };
  }));
}
