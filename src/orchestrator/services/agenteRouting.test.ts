import { describe, expect, it } from 'vitest';
import { decidirAgentePorRegra } from './agenteRouting';

describe('decidirAgentePorRegra', () => {
  it.each([
    ['precisamos abastecer o acervo de imagens de Botox', false, 'monalisa'],
    ['reabastecer acervo de fios de sustentação', false, 'monalisa'],
    ['completar a grade de templates de preenchimento labial no acervo', false, 'monalisa'],
    ['recebemos uma demanda de cliente da unidade Royal Face Colombo para a criação de antes e depois', true, 'van_gogh'],
    ['antes e depois de botox para a Royal Face Maringá', true, 'van_gogh'],
    ['o franqueado pediu um post de botox', false, 'van_gogh'],
  ] as const)('%s → %s', (texto, empresa, agente) => expect(decidirAgentePorRegra(texto, empresa)).toMatchObject({ agente, confianca: 1 }));

  it.each([['arte de botox antes e depois', false], ['abastecer o acervo com artes da Royal Face', true]] as const)('sem sinal claro → classificador: %s', (texto, empresa) => {
    expect(decidirAgentePorRegra(texto, empresa)).toBeNull();
  });
});
