import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { Rubric } from './ui';
import { ReviewResultSchema } from '../../shared/types';

describe('análise do Diretor', () => {
  it('preserva versões antigas e substitui a repetição técnica por aviso de simulação', () => {
    const review = ReviewResultSchema.parse({ aprovada: true, score: 1, itens: ['R01','R02'].map(id=>({id,severidade:'critico',resposta:'sim',evidencia:'Composição mock gerada por SVG com geometria e textos da Skill; fotografia ilustrativa.'})), feedback:{resumo:'Rubrica aprovada.',correcoes:[]} });
    const html = renderToStaticMarkup(<Rubric review={review}/>);
    expect(html).toContain('Simulada');
    expect(html).toContain('conferência humana');
    expect(html).not.toContain('Composição mock');
    expect(html).not.toContain('100%');
    expect(html).toContain('<details');
    expect(html).not.toContain(' open=');
  });
  it('mostra critério, evidência e correção juntos; recolhe os acertos sem ocultar pendências', () => {
    const review = ReviewResultSchema.parse({ modo:'visual',aprovada:false,score:0.5,itens:[{id:'R01',criterio:'O aviso está legível?',severidade:'critico',resposta:'nao',evidencia:'O aviso no rodapé está pequeno.'},{id:'M01',criterio:'A marca está correta?',severidade:'normal',resposta:'sim',evidencia:'Logo oficial no topo.'}],feedback:{resumo:'Aumentar o aviso no rodapé.',correcoes:[{itemId:'R01',instrucao:'Aumente o texto do rodapé.'}]} });
    const html = renderToStaticMarkup(<Rubric review={review}/>);
    expect(html).toContain('O aviso está legível?');
    expect(html).toContain('O aviso no rodapé está pequeno.');
    expect(html.match(/Aumente o texto do rodapé/g)).toHaveLength(1);
    expect(html.indexOf('O aviso está legível?')).toBeLessThan(html.indexOf('<details'));
    expect(html.indexOf('A marca está correta?')).toBeGreaterThan(html.indexOf('<details'));
  });
});
