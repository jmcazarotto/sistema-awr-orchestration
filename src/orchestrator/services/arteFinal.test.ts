import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { FakeClock } from '../core/Clock';
import { BrainLoader } from '../brain/BrainLoader';
import { composicaoPara, montarPrompt, selecionarReferencias, textosExatos } from './arteFinal';
import { aplicarLogo } from './logoCompositor';

const brain = new BrainLoader('brain', new FakeClock());

describe('skill de marca Royal Face', () => {
  it('carrega identidade, rubrica M, composições e o índice de referências', async () => {
    const marca = (await brain.loadMarca('royal_face'))!;
    expect(marca.label).toBe('Royal Face Estética');
    expect(marca.rubrica.map(item => item.id)).toEqual(['M01', 'M02', 'M03', 'M04', 'M05', 'M06', 'M07']);
    expect(Object.keys(marca.composicoes)).toEqual(['modelo_destaque', 'close_procedimento', 'informativa_clean', 'antes_depois_editorial', 'corporal']);
    expect(marca.promptMarca).toContain('NEVER use blue');
    expect(marca.referencias).toHaveLength(23);
    expect(marca.referencias.find(ref => ref.id === 'botox_3_regioes_linhas_expressao')).toMatchObject({ usarCopy: false, arquivo: '_marcas/royal_face/referencias/botox/botox_3_regioes_linhas_expressao.jpg' });
    expect((await brain.listMarcas()).map(item => item.id)).toEqual(['royal_face']);
  });
  it('resolve a marca pela empresa citada (franquia → rede) e soma rubrica R + M + T', async () => {
    const { empresa, marca } = await brain.marcaDaDemanda('Arte para a Royal Face Castanhal');
    expect(empresa?.id).toBe('royal_face'); expect(marca?.id).toBe('royal_face');
    const context = await brain.context('botox', 'banco_imagem_1', undefined, { marcaId: 'royal_face' });
    const prefixos = new Set(context.rubrica.map(item => item.id[0]));
    expect([...prefixos].filter(p => 'RMT'.includes(p!))).toEqual(['R', 'M', 'T']);
    expect((await brain.marcaDaDemanda('Clínica sem cadastro')).marca).toBeNull();
  });
});

describe('arte final por IA', () => {
  it('composição por tipo de arte; antes/depois não é gerado por IA', () => {
    expect(composicaoPara('preenchimento_labial', 'banco_imagem_1')).toBe('close_procedimento');
    expect(composicaoPara('botox', 'banco_imagem_1')).toBe('modelo_destaque');
    expect(composicaoPara('fios_sustentacao', 'banco_imagem_2')).toBe('informativa_clean');
    expect(composicaoPara('botox', 'antes_depois_1')).toBeNull();
  });
  it('referências: procedimento e composição primeiro, nunca antes/depois, completa com modelo_destaque', async () => {
    const { referencias } = (await brain.loadMarca('royal_face'))!;
    const labial = selecionarReferencias(referencias, 'preenchimento_labial', 'close_procedimento');
    expect(labial.map(ref => ref.id)).toEqual(['labial_close_cards', 'labial_close_central', 'labial_modelo_beneficios']);
    const fios = selecionarReferencias(referencias, 'fios_sustentacao', 'modelo_destaque');
    expect(fios).toHaveLength(3);
    expect(fios.every(ref => ref.composicao === 'modelo_destaque')).toBe(true);
  });
  it('textos exatos do briefing: oferta parcelada primeiro; sem oferta → instrução de não desenhar bloco', async () => {
    const textos = textosExatos({ briefing: 'Botox para a Royal Face, à vista R$ 899,00 ou 6x de R$ 149,90, chamada "Agende agora"' }, 'Botox', 'Agende sua avaliação');
    expect(textos).toEqual({ titulo: 'Botox', cta: 'Agende agora', literais: [], oferta: ['6x de R$ 149,90', 'R$ 899,00'] });
    const skill = await brain.loadSkill('botox'); const tecnica = await brain.loadSkill('arte_final_ia'); const marca = await brain.loadMarca('royal_face');
    const semOferta = montarPrompt({ agente: 'AGENTE', tecnica, marca, skill, composicao: 'modelo_destaque', textos: { ...textos, oferta: [] }, referencias: [], briefing: 'x', aprendizados: [] });
    expect(semOferta).toContain('NO OFFER'); expect(semOferta).toContain(skill.disclaimer); expect(semOferta).not.toMatch(/\{\{\w+\}\}/);
    const comOferta = montarPrompt({ agente: 'AGENTE', tecnica, marca, skill, composicao: 'modelo_destaque', textos, referencias: marca!.referencias.slice(0, 2), briefing: 'x', aprendizados: [] });
    expect(comOferta).toContain('"6x de R$ 149,90" and "R$ 899,00"'); expect(comOferta).toContain('NEVER use blue');
  });
});

describe('logo oficial aplicado dinamicamente', () => {
  const logo = (cor: string) => sharp({ create: { width: 400, height: 160, channels: 4, background: cor } }).png().toBuffer();
  it('escolhe a zona mais limpa e a variante pela luminância do fundo, sem distorcer', async () => {
    // Arte clara com "texto" (listras) no topo-esquerdo/centro e no rodapé → topo-direita é a zona limpa.
    const faixas = await sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="600" height="300">${Array.from({ length: 15 }, (_, i) => `<rect y="${i * 20}" width="600" height="8" fill="#111"/>`).join('')}</svg>`)).png().toBuffer();
    const arte = await sharp({ create: { width: 1080, height: 1350, channels: 3, background: '#E6DDCF' } })
      .composite([{ input: faixas, left: 0, top: 0 }, { input: faixas, left: 200, top: 1050 }, { input: faixas, left: 700, top: 1050 }]).png().toBuffer();
    const aplicado = (await aplicarLogo(arte, { claro: await logo('#000000'), escuro: await logo('#ffffff') }))!;
    expect(aplicado.posicao).toBe('topo-direita'); expect(aplicado.variante).toBe('claro');
    const escura = await sharp({ create: { width: 1080, height: 1350, channels: 3, background: '#151515' } }).png().toBuffer();
    expect((await aplicarLogo(escura, { claro: await logo('#000000'), escuro: await logo('#ffffff') }))!.variante).toBe('escuro');
    expect(await aplicarLogo(arte, {})).toBeNull();
  });
});

describe('nome da marca fora do prompt', () => {
  it('troca empresa e unidade por "a clínica" sem depender de acento/caixa', async () => {
    const { ocultarNomes } = await import('./arteFinal');
    expect(ocultarNomes('Arte para a Royal Face de Maringá e ROYAL FACE Castanhal', ['Royal Face', 'Maringa', 'Castanhal'])).toBe('Arte para a a clínica de a clínica e a clínica a clínica');
  });
});

describe('marcador magenta do logo', () => {
  it('bloqueia entrega quando a IA cria dois marcadores separados', async () => {
    const { prepararLogo } = await import('./logoCompositor');
    const arte = await sharp(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1350"><rect width="1080" height="1350" fill="#eee"/><rect x="400" y="70" width="300" height="130" fill="#ff00ff"/><rect x="750" y="1100" width="250" height="130" fill="#ff00ff"/></svg>')).png().toBuffer();
    await expect(prepararLogo(arte, {})).rejects.toThrow('marcadores');
  });
  it('logo vai exatamente no marcador desenhado pela IA, e o magenta some mesmo sem logo cadastrado', async () => {
    const { prepararLogo } = await import('./logoCompositor');
    const marcador = await sharp({ create: { width: 300, height: 130, channels: 3, background: '#FF00FF' } }).png().toBuffer();
    const arte = await sharp({ create: { width: 1080, height: 1350, channels: 3, background: '#E6DDCF' } }).composite([{ input: marcador, left: 700, top: 900 }]).png().toBuffer();
    const temMagenta = async (img: Buffer) => { const { data } = await sharp(img).removeAlpha().raw().toBuffer({ resolveWithObject: true }); for (let i = 0; i < data.length; i += 3) if (data[i]! > 170 && data[i + 2]! > 170 && data[i + 1]! < 110) return true; return false; };
    const semLogo = await prepararLogo(arte, {});
    expect(semLogo).toMatchObject({ logo: null, marcador: true }); expect(await temMagenta(semLogo.buffer)).toBe(false);
    const logo = await sharp({ create: { width: 400, height: 160, channels: 4, background: '#000000' } }).png().toBuffer();
    const comLogo = await prepararLogo(arte, { claro: logo });
    expect(comLogo.logo).toEqual({ posicao: 'rodape-direita', variante: 'claro', origem: 'marcador' });
    expect(await temMagenta(comLogo.buffer)).toBe(false);
    const { data, info } = await sharp(comLogo.buffer).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    const px = (x: number, y: number) => data[(y * info.width + x) * 3]!;
    expect(px(850, 965)).toBeLessThan(40); // logo preto no centro do marcador
    expect(px(100, 100)).toBeGreaterThan(200); // resto da arte intacto
  });
});
