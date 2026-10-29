import { describe, expect, it } from 'vitest';
import type { Demanda } from '../../shared/types';
import { motivoAgente } from './agentes';

const base = { origem: 'cliente', briefing: 'x', clinicaNome: 'Royal Face Castanhal', classificacao: { procedimento: 'botox', tipoTemplate: 'banco_imagem_1', agenteDesignado: 'van_gogh', skillFile: 's', confianca: 1 }, criadorAtual: 'van_gogh', hop: 0, tentativaDiretor: 0, versaoAtual: 0, escalada: false, historico: [], createdAt: '2026-10-29T14:00:00.000Z', updatedAt: '2026-10-29T14:00:00.000Z' } as const;
const dem = (id: string, extra: Partial<Demanda>): Demanda => ({ ...base, id, estado: 'EM_PRODUCAO', ...extra } as Demanda);
const producao = (etapa: 'aguardando' | 'na_fila' | 'gerando') => ({ etapa, modelo: 'gpt-image-2', qualidade: 'medium', versao: 1, solicitadoEm: '2026-10-29T14:41:00.000Z', etapas: [] });

describe('motivoAgente', () => {
  it('explica demanda ativa: pedido de cliente pelo botão Produzir', () => {
    const m = motivoAgente('van_gogh', { status: 'generating', demandaId: 'DEM-0017' }, [dem('DEM-0017', { producao: producao('gerando') })], []);
    expect(m).toMatchObject({ situacao: 'trabalhando', demandaId: 'DEM-0017', titulo: 'Gerando imagem · DEM-0017 · Toxina Botulínica (Botox) · Royal Face Castanhal' });
    expect(m.motivo).toMatch(/^Pedido de cliente — produção solicitada às \d{2}:\d{2} \(botão Produzir\)\.$/);
  });
  it('status antigo sem demanda ativa vira "parado"; conta fila e aguardando Produzir', () => {
    const m = motivoAgente('van_gogh', { status: 'generating', demandaId: 'DEM-0001' }, [dem('DEM-0001', { estado: 'AGUARDANDO_APROVACAO_AWR' }), dem('DEM-0002', { estado: 'CLASSIFICADA', producao: producao('aguardando') })], []);
    expect(m).toMatchObject({ situacao: 'parado', titulo: 'Parado · nenhuma demanda ativa', aguardandoProduzir: 1 });
  });
  it('pausado mostra a fila esperando', () => {
    const m = motivoAgente('van_gogh', { status: 'idle', demandaId: null }, [dem('DEM-0003', { producao: producao('na_fila') })], ['van_gogh']);
    expect(m).toMatchObject({ situacao: 'pausado', fila: 1 });
    expect(m.motivo).toContain('1 na fila');
  });
  it('Monalisa: abastecimento automático do acervo', () => {
    const m = motivoAgente('monalisa', { status: 'generating', demandaId: 'DEM-0004' }, [dem('DEM-0004', { origem: 'acervo', criadorAtual: 'monalisa' })], []);
    expect(m.motivo).toContain('Abastecimento automático do acervo');
  });
});
