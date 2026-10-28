import { describe, expect, it } from 'vitest';
import type { Cliente } from './ClientesRegistry';
import { matchEmpresa } from './EmpresaMatcher';

const clientes: Cliente[] = [
  { id: 'royal_face', nome: 'Royal Face', tipo: 'franquia', aliases: ['Royal Face', 'RoyalFace'], unidades: [
    { id: 'royal_face_castanhal', nome: 'Royal Face Castanhal', cidade: 'Castanhal', uf: 'PA', aliases: [] },
    { id: 'royal_face_maringa', nome: 'Royal Face Maringá', cidade: 'Maringá', uf: 'PR', aliases: [] },
  ] },
  { id: 'clinica_aurora', nome: 'Clínica Aurora', tipo: 'independente', aliases: [], unidades: [] },
];
const resumo = (texto: string) => {
  const m = matchEmpresa(texto, clientes);
  return m && { rede: m.rede.id, unidade: m.unidade?.id ?? null, nova: m.unidadeNaoCadastrada };
};

describe('matchEmpresa', () => {
  it.each([
    ['arte de botox para Royal Face Maringá antes e depois', { rede: 'royal_face', unidade: 'royal_face_maringa', nova: null }],
    ['arte de botox para royal face maringa antes e depois', { rede: 'royal_face', unidade: 'royal_face_maringa', nova: null }],
    ['Antes e depois de lábios — RoyalFace Castanhal', { rede: 'royal_face', unidade: 'royal_face_castanhal', nova: null }],
    ['post de fios para a unidade de Maringá da Royal Face', { rede: 'royal_face', unidade: 'royal_face_maringa', nova: null }],
    ['botox para Royal Face Londrina antes e depois', { rede: 'royal_face', unidade: null, nova: 'Londrina' }],
    ['botox para Royal Face de São José dos Campos, lado a lado', { rede: 'royal_face', unidade: null, nova: 'São José dos Campos' }],
    ['botox para royal face londrina', { rede: 'royal_face', unidade: null, nova: 'Londrina' }],
    ['Royal Face: antes e depois de botox', { rede: 'royal_face', unidade: null, nova: null }],
    ['arte de botox Royal Face antes e depois', { rede: 'royal_face', unidade: null, nova: null }],
    ['institucional para a clinica aurora', { rede: 'clinica_aurora', unidade: null, nova: null }],
  ])('%s', (texto, esperado) => expect(resumo(texto)).toEqual(esperado));

  it.each(['antes e depois de botox', 'Royal Dental antes e depois', 'face lift royal'])('não inventa empresa: %s', texto => {
    expect(matchEmpresa(texto, clientes)).toBeNull();
  });
});
