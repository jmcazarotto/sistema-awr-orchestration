import sharp from 'sharp';

/** Variantes oficiais disponíveis (PNG/SVG cadastrados em Empresas). */
export interface LogosMarca { claro?: Buffer; escuro?: Buffer; principal?: Buffer }
export interface LogoAplicado { posicao: string; variante: 'claro' | 'escuro' | 'principal'; origem: 'marcador' | 'zona_limpa' }
interface Box { left: number; top: number; width: number; height: number }

const MARGEM = 56;
/** Candidatas quando não há marcador: topo preferido (rodapé costuma ter disclaimer/oferta e ganha penalidade). */
const ZONAS = [
  { posicao: 'topo-esquerda', x: 'esq', y: 'topo' }, { posicao: 'topo-direita', x: 'dir', y: 'topo' }, { posicao: 'topo-centro', x: 'centro', y: 'topo' },
  { posicao: 'rodape-esquerda', x: 'esq', y: 'base' }, { posicao: 'rodape-direita', x: 'dir', y: 'base' }, { posicao: 'rodape-centro', x: 'centro', y: 'base' },
] as const;

/** Ruído visual da região: desvio padrão da luminância + energia de borda (Laplaciano). Menor = mais limpa. */
async function analisar(arte: Buffer, box: Box): Promise<{ ruido: number; luminancia: number }> {
  // stats() ignora extract() no mesmo pipeline: materializa a região antes de medir.
  const regiao = await sharp(arte).extract(box).greyscale().png().toBuffer();
  const stats = await sharp(regiao).stats();
  const bordas = await sharp(await sharp(regiao).convolve({ width: 3, height: 3, kernel: [0, -1, 0, -1, 4, -1, 0, -1, 0] }).png().toBuffer()).stats();
  const canal = stats.channels[0]!; const borda = bordas.channels[0]!;
  return { ruido: canal.stdev + borda.mean * 2, luminancia: canal.mean };
}

const magenta = (r: number, g: number, b: number) => r > 170 && b > 170 && g < 110 && Math.abs(r - b) < 90;
const posicaoDe = (box: Box, width: number, height: number) => {
  const cx = box.left + box.width / 2; const cy = box.top + box.height / 2;
  return `${cy < height / 3 ? 'topo' : cy > (height * 2) / 3 ? 'rodape' : 'meio'}-${cx < width / 3 ? 'esquerda' : cx > (width * 2) / 3 ? 'direita' : 'centro'}`;
};

/**
 * Marcador do logo: a IA desenha um retângulo magenta (#FF00FF) onde o logo deve ficar.
 * Retorna a caixa e a arte com o marcador apagado (preenchido com a cor do entorno, com transição suave).
 */
export async function removerMarcador(arte: Buffer): Promise<{ buffer: Buffer; box: Box; luminancia: number } | null> {
  const { data, info } = await sharp(arte).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: W, height: H } = info;
  let minX = W, minY = H, maxX = -1, maxY = -1, total = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 3;
    if (magenta(data[i]!, data[i + 1]!, data[i + 2]!)) { total++; if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y; }
  }
  if (total < 1500) return null;
  const box = { left: minX, top: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
  if (total / (box.width * box.height) < 0.5) throw new Error('A IA gerou marcadores de logo dispersos ou duplicados. A arte não será entregue com marcadores visíveis; solicite um ajuste com apenas um espaço de logo.');
  // Cor do entorno: anel de 8–28 px fora da caixa, ignorando magenta.
  let soma = [0, 0, 0], n = 0;
  for (let y = Math.max(0, minY - 28); y <= Math.min(H - 1, maxY + 28); y++) for (let x = Math.max(0, minX - 28); x <= Math.min(W - 1, maxX + 28); x++) {
    const fora = x < minX - 8 || x > maxX + 8 || y < minY - 8 || y > maxY + 8;
    const i = (y * W + x) * 3;
    if (fora && !magenta(data[i]!, data[i + 1]!, data[i + 2]!)) { soma = [soma[0]! + data[i]!, soma[1]! + data[i + 1]!, soma[2]! + data[i + 2]!]; n++; }
  }
  const cor = soma.map(v => Math.round(v / Math.max(1, n)));
  // Pinta caixa+6 px com a cor do entorno e suaviza a transição com blur numa janela maior.
  const pintado = Buffer.from(data);
  for (let y = Math.max(0, minY - 6); y <= Math.min(H - 1, maxY + 6); y++) for (let x = Math.max(0, minX - 6); x <= Math.min(W - 1, maxX + 6); x++) {
    const i = (y * W + x) * 3; pintado[i] = cor[0]!; pintado[i + 1] = cor[1]!; pintado[i + 2] = cor[2]!;
  }
  const janela = { left: Math.max(0, minX - 24), top: Math.max(0, minY - 24), width: Math.min(W, maxX + 25) - Math.max(0, minX - 24), height: Math.min(H, maxY + 25) - Math.max(0, minY - 24) };
  const suave = await sharp(pintado, { raw: { width: W, height: H, channels: 3 } }).extract(janela).blur(10).png().toBuffer();
  const interno = { left: Math.max(0, minX - 6) - janela.left, top: Math.max(0, minY - 6) - janela.top, width: Math.min(W - 1, maxX + 6) - Math.max(0, minX - 6) + 1, height: Math.min(H - 1, maxY + 6) - Math.max(0, minY - 6) + 1 };
  const remendo = await sharp(suave).extract(interno).png().toBuffer();
  const buffer = await sharp(arte).composite([{ input: remendo, left: janela.left + interno.left, top: janela.top + interno.top }]).png().toBuffer();
  return { buffer, box, luminancia: 0.299 * cor[0]! + 0.587 * cor[1]! + 0.114 * cor[2]! };
}

/**
 * Prepara a arte final com o logo oficial, sem alterar os pixels do logo (só redimensiona proporcionalmente).
 * 1) Marcador magenta desenhado pela IA → logo exatamente ali (o marcador é sempre apagado, mesmo sem logo cadastrado).
 * 2) Sem marcador → zona mais limpa entre topo/rodapé × esquerda/centro/direita.
 * Variante pela luminância do fundo: claro → logo para fundo claro; escuro → logo para fundo escuro.
 */
export async function prepararLogo(arte: Buffer, logos: LogosMarca, larguraLogo = 300): Promise<{ buffer: Buffer; logo: LogoAplicado | null; marcador: boolean }> {
  const marcador = await removerMarcador(arte);
  const base = marcador?.buffer ?? arte;
  const referencia = logos.claro ?? logos.escuro ?? logos.principal;
  if (!referencia) return { buffer: base, logo: null, marcador: Boolean(marcador) };
  const { width = 1080, height = 1350 } = await sharp(base).metadata();
  const meta = await sharp(referencia).metadata();
  const proporcao = (meta.height ?? 1) / (meta.width ?? 1);
  let box: Box; let luminancia: number; let posicao: string;
  if (marcador) {
    box = marcador.box; luminancia = marcador.luminancia; posicao = posicaoDe(box, width, height);
  } else {
    const w = Math.min(larguraLogo, Math.round(width * 0.32)); const h = Math.min(Math.round(w * proporcao), 190); const wFinal = Math.round(h / proporcao);
    const caixa = (zona: typeof ZONAS[number]): Box => ({
      left: zona.x === 'esq' ? MARGEM : zona.x === 'dir' ? width - MARGEM - wFinal : Math.round((width - wFinal) / 2),
      top: zona.y === 'topo' ? MARGEM : height - MARGEM - h, width: wFinal, height: h,
    });
    const avaliadas = await Promise.all(ZONAS.map(async zona => { const caixaZona = caixa(zona); const analise = await analisar(base, caixaZona); return { zona, box: caixaZona, ...analise, nota: analise.ruido * (zona.y === 'base' ? 1.25 : 1) }; }));
    const melhor = avaliadas.sort((a, b) => a.nota - b.nota)[0]!;
    box = melhor.box; luminancia = melhor.luminancia; posicao = melhor.zona.posicao;
  }
  const fundoClaro = luminancia >= 140;
  const variante = fundoClaro ? (logos.claro ? 'claro' : logos.principal ? 'principal' : 'escuro') : (logos.escuro ? 'escuro' : logos.principal ? 'principal' : 'claro');
  const logo = await sharp(logos[variante]!, { density: 300 }).resize(box.width, box.height, { fit: 'inside' }).png().toBuffer();
  const dims = await sharp(logo).metadata();
  // Centraliza o logo na caixa (o marcador pode ter proporção diferente do arquivo oficial).
  const left = box.left + Math.round((box.width - (dims.width ?? box.width)) / 2); const top = box.top + Math.round((box.height - (dims.height ?? box.height)) / 2);
  const buffer = await sharp(base).composite([{ input: logo, left, top }]).png().toBuffer();
  return { buffer, logo: { posicao, variante, origem: marcador ? 'marcador' : 'zona_limpa' }, marcador: Boolean(marcador) };
}

/** Compatibilidade: aplica o logo (ou null quando não há logo cadastrado). */
export async function aplicarLogo(arte: Buffer, logos: LogosMarca, larguraLogo = 300): Promise<(LogoAplicado & { buffer: Buffer }) | null> {
  const resultado = await prepararLogo(arte, logos, larguraLogo);
  return resultado.logo ? { ...resultado.logo, buffer: resultado.buffer } : null;
}
