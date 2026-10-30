import { describe, expect, it } from 'vitest';
import type { BriefingItem } from '../../shared/types';
import { direcaoDeArte, textosExatos } from './arteFinal';
import { segmentar, tipoPorRegra } from './briefingExtractor';
import { briefingHeuristico, briefingPorRegras, mesclarBriefing, validarLeitura } from './briefingLeitura';

const item = (tipo: BriefingItem['tipo'], valor: string, trecho = valor) => ({ tipo, valor, trecho });
const regra = (tipo: BriefingItem['tipo'], texto: string, valor?: string): BriefingItem => ({ texto, tipo, ...(valor ? { valor } : {}), confianca: 1, metodo: 'regra' });
const lido = (tipo: BriefingItem['tipo'], texto: string, valor = texto): BriefingItem => ({ texto, tipo, valor, confianca: 0.9, metodo: 'leitura_ia' });

describe('regras de briefing', () => {
  it.each([
    ['preço de R$99,90', 'R$ 99,90'], ['por 99,90 reais', 'R$ 99,90'], ['botox de 199 reais', 'R$ 199'], ['10x de R$ 129,00', '10x de R$ 129,00'],
  ])('reconhece preço em "%s"', (trecho, valor) => { expect(tipoPorRegra(trecho)).toEqual({ tipo: 'preco', valor }); });
  it('negação nunca vira promoção', () => {
    expect(tipoPorRegra('sem falar em desconto')).toEqual({ tipo: 'restricao' });
    expect(tipoPorRegra('não usar promoção')).toEqual({ tipo: 'restricao' });
    expect(tipoPorRegra('com 20% de desconto')).toEqual({ tipo: 'promocao', valor: '20% de desconto' });
  });
  it('modo sem IA separa modelo da foto e a boca de antes e de depois', () => {
    const texto = 'Antes: boca fina. Depois: boca com volume natural. Usar uma mulher loira. Preço R$ 99,90';
    expect(segmentar(texto).length).toBeGreaterThan(1);
    const tipos = briefingHeuristico('Antes boca fina; depois boca volumosa natural; usar uma mulher loira', 8).map(i => i.tipo);
    expect(tipos).toEqual(['descricao_antes', 'descricao_depois', 'modelo_foto']);
    expect(briefingPorRegras(texto, 8)).toEqual([expect.objectContaining({ tipo: 'preco', valor: 'R$ 99,90' })]);
  });
});

describe('conferência da leitura por IA', () => {
  const pedido = 'Arte por 199 reais em 6x de R$ 39,90. CTA: Agende pelo WhatsApp. Mulher loira.';
  it('aceita valor normalizado que existe no pedido', () => {
    const { itens, descartados } = validarLeitura({ itens: [item('preco', 'R$ 199,00', '199 reais'), item('preco', '6x de R$ 39,90', '6x de R$ 39,90'), item('chamada_cta', 'Agende pelo WhatsApp'), item('modelo_foto', 'mulher loira', 'Mulher loira')] }, pedido);
    expect(descartados).toBe(0); expect(itens).toHaveLength(4);
    expect(itens[0]).toMatchObject({ metodo: 'leitura_ia', valor: 'R$ 199,00' });
  });
  it('tira a pontuação final de CTA e título', () => {
    expect(validarLeitura({ itens: [item('chamada_cta', 'Agende pelo WhatsApp.')] }, 'CTA: Agende pelo WhatsApp.').itens[0]!.valor).toBe('Agende pelo WhatsApp');
  });
  it.each([
    ['preço inventado', item('preco', 'R$ 149,90', '199 reais')],
    ['CTA reescrito', item('chamada_cta', 'Marque agora mesmo', 'CTA: Agende pelo WhatsApp')],
    ['trecho que não está no pedido', item('modelo_foto', 'mulher ruiva', 'mulher ruiva')],
  ])('descarta %s', (_nome, entrada) => { expect(validarLeitura({ itens: [entrada] }, pedido)).toEqual({ itens: [], descartados: 1 }); });
  it('mescla sem duplicar e mantém preço que a IA esqueceu', () => {
    const itens = mesclarBriefing([lido('preco', 'R$ 99,90'), lido('restricao', 'sem falar em desconto')], [regra('preco', 'preço de R$99,90', 'R$ 99,90'), regra('preco', 'ou R$ 499,00', 'R$ 499,00'), regra('promocao', 'sem falar em desconto')]);
    expect(itens.map(i => `${i.tipo}:${i.valor ?? i.texto}`)).toEqual(['preco:R$ 99,90', 'restricao:sem falar em desconto', 'preco:R$ 499,00']);
  });
});

describe('briefing estruturado na produção', () => {
  const itens = [lido('preco', 'R$ 99,90'), lido('preco', '6x de R$ 19,90'), lido('chamada_cta', 'Agende pelo WhatsApp'), lido('headline', 'Lábios naturais'), lido('modelo_foto', 'mulher loira'), lido('descricao_antes', 'boca fina'), lido('restricao', 'sem desconto')];
  it('textos exatos vêm do briefing, com parcelado primeiro; campos manuais têm prioridade', () => {
    expect(textosExatos({ briefing: 'x', briefingItens: itens }, 'Preenchimento', 'Agende')).toEqual({ titulo: 'Lábios naturais', cta: 'Agende pelo WhatsApp', literais: [], oferta: ['6x de R$ 19,90', 'R$ 99,90'] });
    expect(textosExatos({ briefing: 'x', briefingItens: itens, cta: 'Manual', headline: 'Título manual' }, 'Preenchimento', 'Agende')).toMatchObject({ titulo: 'Título manual', cta: 'Manual' });
  });
  it('demanda antiga sem briefing estruturado segue pelas regras', () => {
    expect(textosExatos({ briefing: 'preço de R$ 99,90' }, 'Botox', 'Agende').oferta).toEqual(['R$ 99,90']);
  });
  it('banco de imagem pede a modelo; antes e depois nunca altera a foto real', () => {
    expect(direcaoDeArte(itens, false, [])).toContain('PERSON TO SHOW: mulher loira');
    const comparativo = direcaoDeArte(itens, true, []);
    expect(comparativo).not.toContain('PERSON TO SHOW');
    expect(comparativo).toContain('never alter a real photo');
    expect(comparativo).toContain('BEFORE PHOTO: boca fina');
    expect(direcaoDeArte([lido('preco', 'R$ 1')], false, [])).toBe('');
  });
  it('não vaza nome de clínica na direção de arte', () => {
    expect(direcaoDeArte([lido('outro_briefing', 'igual à Royal Face Maringá')], false, ['Royal Face Maringá'])).toContain('igual à a clínica');
  });
});
