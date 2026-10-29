import { describe, expect, it } from 'vitest';
import { segmentar, tipoHeuristico, tipoPorRegra } from './briefingExtractor';

describe('briefingExtractor', () => {
  it('quebra o texto em trechos sem cortar valores com vírgula', () => {
    expect(segmentar('Criar uma arte de antes e depois para a Royal Face de Paranaguá com preço de 6x de R$99,90, tom acolhedor e chamada agende sua avaliação'))
      .toEqual(['Criar uma arte de antes e depois para a Royal Face de Paranaguá', 'preço de 6x de R$99,90', 'tom acolhedor', 'chamada agende sua avaliação']);
  });
  it.each([
    ['preço de 6x de R$99,90', { tipo: 'preco', valor: '6x de R$ 99,90' }],
    ['por apenas R$ 1.200,00', { tipo: 'preco', valor: 'R$ 1.200,00' }],
    ['20% de desconto em novembro', { tipo: 'promocao', valor: '20% de desconto' }],
    ['WhatsApp (41) 99999-1234', { tipo: 'contato', valor: '(41) 99999-1234' }],
    ['chamada "Agende sua avaliação"', { tipo: 'chamada_cta', valor: 'Agende sua avaliação' }],
  ] as const)('regra: %s', (trecho, esperado) => expect(tipoPorRegra(trecho)).toMatchObject(esperado));
  it('sem aviso de compliance no briefing; trecho sem padrão vai para o classificador', () => {
    expect(tipoPorRegra('6x de R$ 99,90')).toEqual({ tipo: 'preco', valor: '6x de R$ 99,90' });
    expect(tipoPorRegra('tom acolhedor')).toBeNull();
  });
  it('demanda da Royal Face Criciúma: preço e data de entrega formatados', () => {
    const trechos = segmentar('Arte de preenchimento labial para a Royal Face de Criciúma, Banco de Imagens\nTem que ser com preço de 6x de R$99,90 e deve ser feito até dia 30 de 10.');
    expect(trechos.map(tipoPorRegra).filter(Boolean)).toEqual([{ tipo: 'preco', valor: '6x de R$ 99,90' }, { tipo: 'data_entrega', valor: 'até 30/10' }]);
  });
  it.each([
    ['entrega até 30/10', { tipo: 'data_entrega', valor: 'até 30/10' }],
    ['prazo 5 de novembro', { tipo: 'data_entrega', valor: 'até 05/11' }],
    ['campanha de 15/12', { tipo: 'prazo_data', valor: '15/12' }],
    ['6 vezes de 99,90', { tipo: 'preco', valor: '6x de R$ 99,90' }],
  ] as const)('datas e preço sem R$: %s', (trecho, esperado) => expect(tipoPorRegra(trecho)).toEqual(esperado));
  it.each([['Criar uma arte de antes e depois para a Royal Face', 'pedido'], ['tom acolhedor', 'tom_estilo'], ['chamada agende sua avaliação', 'chamada_cta']] as const)('heurística: %s', (trecho, tipo) => {
    expect(tipoHeuristico(trecho)).toBe(tipo);
  });
});

describe('segmentar com acentos', () => {
  it('quebra em "e público" / "e preço"', () => {
    expect(segmentar('para o Dia das Mães e público mulheres 35+')).toEqual(['para o Dia das Mães', 'público mulheres 35+']);
  });
});
