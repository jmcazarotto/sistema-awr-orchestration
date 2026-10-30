import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { Triagem } from '../../shared/types';
import { BriefingResumo, EtapasTriagem } from './BriefingItens';

const etapa = { latenciaMs: 900, tokens: { entrada: 800, saida: 0 }, usd: 0.0001 };
const triagem = { provider: 'openai_decisions', etapas: [
  { ...etapa, id: 'regras', modelo: 'regras', status: 'ok', campos: ['empresa'] },
  { ...etapa, id: 'leitura_texto', modelo: 'gpt-6-luna', status: 'falhou', campos: [] },
  { ...etapa, id: 'decisoes', modelo: 'gpt-6-luna-decisions', status: 'ok', campos: ['procedimento', 'imagens'] },
] } as unknown as Triagem;

describe('quem leu cada parte', () => {
  it('nomeia cada etapa, o que respondeu e o estado da execução', () => {
    const html = renderToStaticMarkup(<EtapasTriagem triagem={triagem}/>);
    expect(html).toContain('Regras do sistema');
    expect(html).toContain('Leitura de texto · Luna · Texto');
    expect(html).toContain('Classificadora · Luna · Decisions API');
    expect(html).toContain('Imagens anexadas');
    expect(html).toContain('falhou');
  });
  it('mostra o Jev como classificadora só de texto', () => {
    expect(renderToStaticMarkup(<EtapasTriagem triagem={{ ...triagem, provider: 'jev' }}/>)).toContain('Classificadora · Jev');
  });
  it('resume o briefing da demanda com rótulos legíveis', () => {
    const html = renderToStaticMarkup(<BriefingResumo itens={[{ texto: 'uma mulher loira', tipo: 'modelo_foto', valor: 'mulher loira', confianca: 0.9, metodo: 'leitura_ia' }]}/>);
    expect(html).toContain('Modelo da foto'); expect(html).toContain('mulher loira');
  });
});
