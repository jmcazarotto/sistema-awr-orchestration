import { ElementoTemplateSchema, TemplateArteSchema, TIPOS_TEMPLATE, templateId } from '../../shared/types';
import type { Empresa, ElementoTemplate, Procedimento, TemplateArte } from '../../shared/types';
import type { TemplateStore } from '../core/interfaces';

const textos: Record<Procedimento, [string, string]> = {
  preenchimento_labial: ['Preenchimento', 'LABIAL'], botox: ['Toxina', 'BOTULÍNICA'], fios_sustentacao: ['Fios de', 'SUSTENTAÇÃO'],
};
const element = (tipo: ElementoTemplate['tipo'], rotulo: string, x: number, y: number, w: number, h: number, extra: Record<string, unknown> = {}): ElementoTemplate =>
  ElementoTemplateSchema.parse({ id: tipo, tipo, rotulo, x, y, w, h, ...extra });
const photo = (tipo: 'foto_antes' | 'foto_depois' | 'foto_principal', x: number, y: number, w: number, h: number) =>
  element(tipo, tipo === 'foto_antes' ? 'Foto antes' : tipo === 'foto_depois' ? 'Foto depois' : 'Foto principal', x, y, w, h, { estilo: { borda: { cor: '#8d8b88', largura: 16 }, raio: 40, sombra: true } });

export function createTemplateSeeds(empresa: Empresa, atualizadoEm: string): TemplateArte[] {
  return empresa.procedimentos.flatMap(procedimento => TIPOS_TEMPLATE.map(tipoTemplate => {
    const [titulo, subtitulo] = textos[procedimento];
    const base = [
      element('titulo', 'Título', 140, 780, 800, 120, { conteudo: titulo, estilo: { fonte: 'serif_display', peso: 700, tamanho: 104 } }),
      element('subtitulo', 'Subtítulo', 160, 895, 470, 115, { conteudo: subtitulo, estilo: { fonte: 'sans_black', tamanho: procedimento === 'preenchimento_labial' ? 120 : 70, caixaAlta: true } }),
      element('destaque', 'Destaque da oferta', 648, 902, 278, 82, { conteudo: '{{procedimento}}', estilo: { fundo: 'linear:#e9cf8e,#b88a45', cor: '#111111', raio: 14, fonte: 'sans_black', tamanho: 52, caixaAlta: true } }),
      element('preco', 'Preço e parcelamento', 245, 1020, 300, 110, { conteudo: '12X R$ {{preco}} 1ML', estilo: { fonte: 'sans_black' } }),
      element('forma', 'Divisor da oferta', 583, 1025, 3, 105, { id: 'divisor', estilo: { fundo: '#ffffff' } }),
      element('logo', 'Logo da empresa', 620, 1012, 220, 130, { conteudo: empresa.logo ?? '' }),
      element('forma', 'Faixa do rodapé', 0, 1308, 1080, 42, { id: 'faixa', estilo: { fundo: 'linear:#c08a55,#f3d79a' } }),
    ];
    let fotos: ElementoTemplate[];
    if (tipoTemplate === 'antes_depois_1') fotos = [photo('foto_antes', 68, 243, 460, 462), photo('foto_depois', 550, 243, 460, 462)];
    else if (tipoTemplate === 'antes_depois_2') {
      fotos = [photo('foto_antes', 80, 360, 530, 440), photo('foto_depois', 470, 520, 530, 440)];
      Object.assign(base[0]!, { x: 100, y: 210, w: 880, h: 130 });
      Object.assign(base[5]!, { x: 410, y: 40, w: 260, h: 150 });
      Object.assign(base[1]!, { x: 70, y: 970, w: 560, h: 100 });
      Object.assign(base[2]!, { x: 670, y: 980 });
      Object.assign(base[3]!, { x: 260, y: 1120 });
      Object.assign(base[4]!, { x: 650, y: 1120 });
    } else if (tipoTemplate === 'banco_imagem_1') {
      fotos = [element('foto_principal', 'Foto principal', 0, 0, 1080, 1350), element('forma', 'Degradê escuro sobre a foto', 0, 650, 1080, 700, { id: 'overlay', estilo: { fundo: 'linear:#00000000,#24211fee' }, z: 1 })];
    } else {
      fotos = [photo('foto_principal', 68, 55, 944, 745), element('forma', 'Painel de texto', 0, 810, 1080, 498, { id: 'painel', estilo: { fundo: 'linear:#4a4947,#9b7d57' } })];
      Object.assign(base[0]!, { y: 825 }); Object.assign(base[1]!, { y: 945 }); Object.assign(base[2]!, { y: 952 });
      Object.assign(base[3]!, { y: 1100 }); Object.assign(base[4]!, { y: 1105 }); Object.assign(base[5]!, { y: 1090 });
    }
    return TemplateArteSchema.parse({ id: templateId(empresa.id, procedimento, tipoTemplate), empresaId: empresa.id, procedimento,
      familia: tipoTemplate.startsWith('antes_depois') ? 'antes_depois' : 'banco_imagem', tipoTemplate,
      nome: `${empresa.nome} · ${titulo} ${subtitulo} · ${tipoTemplate.endsWith('1') ? '1' : '2'}`,
      canvas: { largura: 1080, altura: 1350 }, fundo: 'linear:#4a4947,#9b7d57',
      elementos: [...fotos, ...base].map((entry, z) => ({ ...entry, z })), atualizadoEm });
  }));
}

/** Só preenche IDs ausentes; arquivos editados pelo usuário permanecem intactos. */
export async function seedTemplates(store: TemplateStore, empresas: Empresa[], timestamp: string): Promise<void> {
  for (const empresa of empresas) for (const seed of createTemplateSeeds(empresa, timestamp)) {
    if (!await store.get(seed.id)) await store.save(seed);
  }
}
