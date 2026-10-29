import { ClientesRegistry } from '../orchestrator/brain/ClientesRegistry';
import { MemoryTemplateStore } from '../orchestrator/core/MemoryTemplateStore';
import { seedTemplates } from '../orchestrator/templates/seeds';
import { OrchestratorError } from '../orchestrator/core/errors';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { vi } from 'vitest';
import { IA_SITUACOES, IA_SITUACAO_INFO, IaModelosSchema } from '../shared/types';
import type { IaModelos } from '../shared/types';
import {
  OrchestratorConfigSchema, PROCEDIMENTOS, SkillIdSchema, TIPOS_TEMPLATE,
} from '../shared/types';
import type {
  AcervoGrid, Demanda, EventBusPublic, FeedbackHumano, InboxMessage, MessagesFilter,
  Orchestrator, OrchestratorConfig, SseEnvelope, SubmitDemandInput, Triagem,
} from '../shared/types';
import { closeAppStreams, createApp } from './app';

export const agora = '2026-10-28T14:00:00.000Z';
export function criarDemanda(alteracoes: Partial<Demanda> = {}): Demanda {
  return {
    id: 'DEM-0001', origem: 'cliente', briefing: 'Toxina botulínica',
    estado: 'AGUARDANDO_APROVACAO_AWR',
    classificacao: { procedimento: 'botox', agenteDesignado: 'van_gogh', tipoTemplate: 'banco_imagem_1', skillFile: 'skills/botox.skill.md', confianca: 1 },
    criadorAtual: 'van_gogh', hop: 0, tentativaDiretor: 0, versaoAtual: 1,
    escalada: false, historico: [], createdAt: agora, updatedAt: agora, ...alteracoes,
  };
}

export const mensagem: InboxMessage = {
  id: 'msg-1', demandaId: 'DEM-0001', from: 'system', to: 'art_director', hop: 0,
  action: 'DEMANDA_CLASSIFICADA', payload: { classificacao: criarDemanda().classificacao! }, createdAt: agora,
};

export function evento(id: string): SseEnvelope {
  return { id, ts: agora, type: 'log', payload: { level: 'info', message: `Evento ${id}` } };
}

export class FakeBus implements EventBusPublic {
  readonly listeners = new Set<(event: SseEnvelope) => void>();
  readonly eventos: SseEnvelope[] = [];
  duranteHistory: (() => void) | undefined;
  subscribe(listener: (event: SseEnvelope) => void): () => void {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }
  history(n: number): SseEnvelope[] {
    this.duranteHistory?.();
    return n === 0 ? [] : this.eventos.slice(-n);
  }
  publish(event: SseEnvelope): void {
    this.eventos.push(event);
    for (const listener of this.listeners) listener(event);
  }
}

export class FakeOrchestrator implements Orchestrator {
  readonly config: OrchestratorConfig;
  readonly bus = new FakeBus();
  demandas: Demanda[] = [criarDemanda()];
  messages: InboxMessage[] = [mensagem];
  readonly grade: AcervoGrid = {
    slots: PROCEDIMENTOS.flatMap(procedimento => TIPOS_TEMPLATE.map(tipoTemplate => ({ procedimento, tipoTemplate, preenchido: false, arquivos: [] }))),
    total: 12, preenchidos: 0, vazios: 12, emProducao: 0,
  };
  readonly acervo = { grid: vi.fn(async () => this.grade), fill: vi.fn<Orchestrator['acervo']['fill']>(async () => {}) };
  private readonly templateStore = new MemoryTemplateStore();
  private registry(): ClientesRegistry { return new ClientesRegistry(this.config.BRAIN_DIR); }
  readonly empresas: Orchestrator['empresas'] = {
    list: () => this.registry().list(),
    get: async id => (await this.registry().list()).find(empresa => empresa.id === id),
    upsert: async input => { const empresa = await this.registry().upsert(input); await seedTemplates(this.templateStore, [empresa], agora); return empresa; },
    setLogo: async (id, arquivo) => {
      if (!await this.empresas.get(id)) throw new OrchestratorError('NOT_FOUND', 'Empresa não encontrada.', 404);
      const path = `_marcas/${id}/logo.${arquivo.nome.split('.').pop()}`;
      await mkdir(join(this.config.ACERVO_DIR, '_marcas', id), { recursive: true });
      await writeFile(join(this.config.ACERVO_DIR, path), arquivo.dados);
      return this.registry().setLogo(id, path);
    },
  };
  readonly templates: Orchestrator['templates'] = {
    list: async filtro => (await this.templateStore.list()).filter(t => (!filtro?.empresaId || t.empresaId === filtro.empresaId) && (!filtro?.procedimento || t.procedimento === filtro.procedimento) && (!filtro?.familia || t.familia === filtro.familia)),
    get: id => this.templateStore.get(id),
    save: async (id, input) => {
      const previous = await this.templateStore.get(id);
      if (!previous) throw new OrchestratorError('NOT_FOUND', 'Template não encontrado.', 404);
      const template = { ...previous, ...input, atualizadoEm: agora };
      await this.templateStore.save(template); return template;
    },
  };
  private iaModelos: IaModelos = Object.fromEntries(IA_SITUACOES.map(s => [s, { modelo: IA_SITUACAO_INFO[s].modelos[0]!, effort: null }])) as IaModelos;
  readonly ia: Orchestrator['ia'] = {
    modelos: () => this.iaModelos,
    salvarModelos: async input => (this.iaModelos = IaModelosSchema.parse(input)),
    uso: () => ({ desde: null, cotacaoUsdBrl: this.config.USD_BRL, itens: [{ provedor: 'jev', modelo: 'jev-latest', chamadas: 2, tokensEntrada: 900, tokensSaida: 10, usd: 0.0000378, brl: 0.0000378 * this.config.USD_BRL, precificado: true }], total: { chamadas: 2, usd: 0.0000378, brl: 0.0000378 * this.config.USD_BRL } }),
    zerarUso: async () => ({ desde: null, cotacaoUsdBrl: this.config.USD_BRL, itens: [], total: { chamadas: 0, usd: 0, brl: 0 } }),
  };
  constructor(config = OrchestratorConfigSchema.parse({})) { this.config = config; }
  readonly submitDemand = vi.fn(async (input: SubmitDemandInput): Promise<Demanda> => {
    const demanda = criarDemanda({ id: 'DEM-0002', estado: 'CLASSIFICADA', ...input });
    this.demandas.push(demanda);
    return demanda;
  });
  readonly triar = vi.fn(async (texto: string): Promise<Triagem> => ({
    id: 'TRI-test', texto, empresa: { id: null, nome: null, cadastrada: false, confianca: 0, rede: null, unidade: null, metodo: 'nenhum' },
    procedimento: 'botox', procedimentoConfianca: 0.95, tipoTemplate: 'antes_depois_1', familiaArte: 'antes_depois', tipoTemplateConfianca: 0.95, agente: 'van_gogh', agenteConfianca: 1, agenteMotivo: 'teste', agenteRegra: true, briefing: [],
    provider: 'mock', modelo: 'heuristica', latenciaMs: 1, tokens: { entrada: 0, saida: 0 }, custo: { usd: 0, brl: 0, cotacaoUsdBrl: 5.5 }, criadoEm: agora,
  }));
  readonly humanReview = vi.fn(async (id: string, feedback: FeedbackHumano): Promise<Demanda> => {
    const demanda = this.getDemanda(id)!;
    demanda.estado = feedback.decisao === 'aprovar' ? 'APROVADA_SALVA_NO_ACERVO' : 'EM_PRODUCAO';
    return demanda;
  });
  readonly resetHops = vi.fn(async (id: string): Promise<Demanda> => {
    const demanda = this.getDemanda(id)!;
    demanda.hop = 0;
    if (demanda.motivoEscalada === 'hop_limit') { demanda.escalada = false; delete demanda.motivoEscalada; }
    return demanda;
  });
  listDemandas(): Demanda[] { return this.demandas; }
  getDemanda(id: string): Demanda | undefined { return this.demandas.find(demanda => demanda.id === id); }
  listMessages(filtro?: MessagesFilter): InboxMessage[] { return this.messages.filter(message => !filtro?.demandaId || message.demandaId === filtro.demandaId); }
  async start(): Promise<void> {}
  async stop(): Promise<void> {}
}

export const skillMarkdown = (id: string) => `---
id: ${id}
procedimento: ${id === 'template_composition' ? '"*"' : id}
label: Skill ${id}
versao: 1
atualizado_em: 2026-10-28
---
# Skill
## 1. Contexto do Procedimento
- [R99][normal] Esta linha não é da rubrica?
## 5. Checklist de Rubrica do Diretor de Arte
- [R01][critico] O texto está legível?
- [R02][normal] O layout está coerente?
## Self-Improvement Log
### L01 · 2026-10-28T14:02Z · antes_depois_1 · fonte: awr_humano · DEM-0001
- **Regra:** Evitar sobreposição.
- **Motivo original:** "O selo cobre o lábio."
- **Status:** ativo
### L02 · 2026-10-28T14:03Z · escopo: global · fonte: seed · —
- **Regra:** Usar português.
- **Motivo original:** Exemplo.
- **Status:** exemplo
### L03 · 2026-10-28T14:04Z · banco_imagem_1 · fonte: diretor_arte · —
- **Regra:** Regra antiga.
- **Motivo original:** Substituída.
- **Status:** inativo
`;

export async function fixture() {
  const raiz = await mkdtemp(join(tmpdir(), 'awr-server-'));
  const acervoDir = join(raiz, 'acervo');
  const brainDir = join(raiz, 'brain');
  await Promise.all([mkdir(join(acervoDir, '_staging'), { recursive: true }), mkdir(join(acervoDir, 'botox'), { recursive: true }), mkdir(join(brainDir, 'skills'), { recursive: true })]);
  await Promise.all(SkillIdSchema.options.map(id => writeFile(join(brainDir, 'skills', `${id}.skill.md`), skillMarkdown(id))));
  const config = OrchestratorConfigSchema.parse({ ACERVO_DIR: acervoDir, BRAIN_DIR: brainDir, DATA_DIR: join(raiz, 'data') });
  const orchestrator = new FakeOrchestrator(config);
  const app = createApp({ orchestrator, config, acervoDir, brainDir });
  return { raiz, acervoDir, brainDir, config, orchestrator, app, async cleanup() { closeAppStreams(app); await rm(raiz, { recursive: true, force: true }); } };
}
