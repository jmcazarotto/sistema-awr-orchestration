import { nanoid } from 'nanoid';
import { BriefingTipoSchema, CriadorIdSchema, ProcedimentoSchema, TipoTemplateSchema, TriagemRequestSchema, TriagemSchema } from '../../shared/types';
import type { BriefingItem, OrchestratorConfig, Triagem } from '../../shared/types';
import { ClientesRegistry } from '../brain/ClientesRegistry';
import type { Cliente } from '../brain/ClientesRegistry';
import { matchEmpresa, unidadeCitada } from '../brain/EmpresaMatcher';
import type { EventBus } from '../core/EventBus';
import { classifyMock } from './FastClassifier';
import { criteriosAgente, decidirAgentePorRegra } from './agenteRouting';
import { criteriosTrecho, segmentar, tipoHeuristico, tipoPorRegra } from './briefingExtractor';
import type { JevClient, JevQuestions } from './JevClient';

// Descriptions distilled from the procedure skills §1 and template_composition §3.
const procedimentos = {
  preenchimento_labial: 'Harmonização dos lábios com ácido hialurônico: hidratação, contorno, simetria e proporção da boca, com naturalidade e equilíbrio.',
  botox: 'Toxina botulínica (botox): suavização de linhas de expressão dinâmicas na testa, glabela e pés de galinha, preservando expressividade.',
  fios_sustentacao: 'Fios de sustentação PDO/PLLA: sustentação e reposicionamento sutil dos tecidos faciais, contorno mandibular, terço médio e pescoço; estímulo de colágeno.',
};
const templates = {
  antes_depois_1: 'Comparação ANTES/DEPOIS com fotos lado a lado, split vertical 50/50. Padrão quando pede antes e depois sem especificar orientação.',
  antes_depois_2: 'Comparação ANTES em cima e DEPOIS embaixo, fotos empilhadas em split horizontal.',
  banco_imagem_1: 'Foto cheia (full-bleed), com gradiente e texto no terço inferior. Post informativo com imagem de banco.',
  banco_imagem_2: 'Layout institucional: foto na parte de cima e painel sólido de texto embaixo.',
};
const normalize = (text: string) => text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
/** Conservative proper-name span extraction; no generated names. */
export function extractEmpresa(texto: string): string | null {
  const name = "[\\p{Lu}][\\p{L}\\p{N}'’.-]*(?:\\s+(?:(?:de|da|do|dos|das)\\s+)?[\\p{Lu}][\\p{L}\\p{N}'’.-]*){0,7}";
  const prefix = /(?:clínica|clinica|unidade)\s+/giu;
  for (const match of texto.matchAll(prefix)) {
    const proper = new RegExp(`^${name}`, 'u').exec(texto.slice(match.index + match[0].length))?.[0];
    if (proper) return /cl[ií]nica/i.test(match[0]) ? `Clínica ${proper}` : proper;
  }
  return new RegExp(`(?:para(?:\\s+(?:a|o))?|pra|da|do)\\s+(${name})`, 'u').exec(texto)?.[1] ?? null;
}

type Empresa = Triagem['empresa'];
/** Limite de trechos perguntados ao classificador por triagem (custo/latência). */
const MAX_TRECHOS = 8;
/** Rede citada literalmente no texto → confiança 1, sem gastar pergunta no classificador. */
function empresaPorCadastro(texto: string, clientes: Cliente[]): Empresa | null {
  const match = matchEmpresa(texto, clientes);
  if (!match) return null;
  const unidade = match.unidade ? { id: match.unidade.id, nome: match.unidade.cidade, cadastrada: true }
    : match.unidadeNaoCadastrada ? { id: null, nome: match.unidadeNaoCadastrada, cadastrada: false } : null;
  const nome = match.unidade?.nome ?? (unidade ? `${match.rede.nome} ${unidade.nome}` : match.rede.nome);
  return { id: match.unidade?.id ?? match.rede.id, nome, cadastrada: true, confianca: 1, rede: match.rede, unidade, metodo: 'cadastro' };
}
/** Nome próprio não cadastrado: exibido, mas com confiança baixa (não existe no cadastro para confirmar). */
function empresaPorExtracao(texto: string): Empresa {
  const nome = extractEmpresa(texto);
  return { id: null, nome, cadastrada: false, confianca: nome ? 0.5 : 0, rede: null, unidade: null, metodo: nome ? 'extracao' : 'nenhum' };
}

const porRegra = (d: { agente: Triagem['agente']; confianca: number; motivo: string }) => ({ agente: d.agente, agenteConfianca: d.confianca, agenteMotivo: d.motivo, agenteRegra: d.confianca === 1 });
/** Distribuição heurística (modo mock): a escolha recebe `p`, o restante é dividido igualmente. */
function distribuicao<K extends string>(keys: readonly K[], escolha: K, p: number): Record<string, number> {
  return Object.fromEntries(keys.map(k => [k, k === escolha ? p : (1 - p) / (keys.length - 1)]));
}

export class TriagemService {
  constructor(private readonly config: OrchestratorConfig, private readonly bus: Pick<EventBus, 'emit' | 'log' | 'clock'>, private readonly jev?: JevClient) {}
  async triar(value: string): Promise<Triagem> {
    const { texto } = TriagemRequestSchema.parse({ texto: value });
    const id = `TRI-${nanoid()}`;
    const real = this.config.CLASSIFIER_PROVIDER === 'jev' && Boolean(this.jev);
    const provider = real ? 'jev' : 'mock';
    const modelo = real ? this.config.JEV_MODEL : 'heuristica';
    this.bus.emit({ type: 'triagem.started', payload: { triagemId: id, texto, provider, modelo } });
    const clientes = await new ClientesRegistry(this.config.BRAIN_DIR).list();
    let fields: Pick<Triagem, 'empresa' | 'procedimento' | 'procedimentoConfianca' | 'tipoTemplate' | 'tipoTemplateConfianca' | 'agente' | 'agenteConfianca' | 'agenteMotivo' | 'agenteRegra' | 'probabilidades' | 'briefing' | 'tokens' | 'latenciaMs' | 'modelo'>;
    if (real && this.jev) {
      const porCadastro = empresaPorCadastro(texto, clientes);
      const agentePorRegra = decidirAgentePorRegra(texto, Boolean(porCadastro));
      const trechos = segmentar(texto).slice(0, MAX_TRECHOS).map(texto => ({ texto, regra: tipoPorRegra(texto) }));
      const questions: JevQuestions = {
        procedimento: { type: 'choice', instructions: 'Qual procedimento estético é solicitado no texto?', criteria: procedimentos },
        ...(porCadastro ? {} : { empresa: { type: 'choice' as const, instructions: 'Para qual rede/franquia de clínicas é a arte? Considere variações de grafia do nome. Se o texto não cita nenhuma rede cadastrada, escolha nao_identificada. Não associe uma clínica desconhecida a uma cadastrada.', criteria: { ...Object.fromEntries(clientes.map(cliente => [cliente.id, `${cliente.nome}${cliente.tipo === 'franquia' ? ' (franquia)' : ''}; nomes conhecidos: ${[cliente.nome, ...cliente.aliases].join(', ')}${cliente.unidades.length ? `; unidades: ${cliente.unidades.map(u => u.cidade).join(', ')}` : ''}`])), nao_identificada: 'Empresa não citada ou não cadastrada entre as opções.' } } }),
        tipo_arte: { type: 'choice', instructions: 'Qual layout de arte foi solicitado? Use a orientação descrita; para antes e depois sem orientação use lado a lado. Post institucional usa foto em cima e painel embaixo.', criteria: templates },
        // Sempre perguntado (mesmo com regra) para exibir a distribuição completa na UI.
        ...Object.fromEntries(trechos.flatMap((t, i) => t.regra ? [] : [[`trecho_${i}`, { type: 'choice' as const, instructions: `O trecho "${t.texto}" é só identificação do pedido ou é briefing para a criação da arte? Se for briefing, de que tipo?`, criteria: criteriosTrecho }]])),
        agente: { type: 'choice', instructions: 'Qual agente de arte deve produzir? Pedido pontual de cliente/clínica/unidade vai para van_gogh; abastecimento rotineiro do acervo (peças de estoque), mesmo citando a rede, vai para monalisa.', criteria: criteriosAgente },
      };
      const response = await this.jev.ask(texto, questions);
      const { procedimento, empresa, tipo_arte, agente } = response.answers;
      const rede = !porCadastro && empresa && empresa.confidence >= 0.7 ? clientes.find(cliente => cliente.id === empresa.choice) : undefined;
      const unidadeIa = rede ? unidadeCitada(texto, rede) : null;
      fields = {
        empresa: porCadastro ?? (rede
          ? { id: unidadeIa?.id ?? rede.id, nome: unidadeIa?.nome ?? rede.nome, cadastrada: true, confianca: empresa!.confidence, rede: { id: rede.id, nome: rede.nome }, unidade: unidadeIa && { id: unidadeIa.id, nome: unidadeIa.cidade, cadastrada: true }, metodo: 'ia' }
          : empresaPorExtracao(texto)),
        procedimento: ProcedimentoSchema.parse(procedimento!.choice), procedimentoConfianca: procedimento!.confidence,
        tipoTemplate: TipoTemplateSchema.parse(tipo_arte!.choice), tipoTemplateConfianca: tipo_arte!.confidence,
        ...(agentePorRegra ? porRegra(agentePorRegra) : { agente: CriadorIdSchema.parse(agente!.choice), agenteConfianca: agente!.confidence, agenteMotivo: 'Decidido pelo classificador (texto sem sinal claro de cliente ou de acervo).', agenteRegra: false }),
        briefing: trechos.flatMap((t, i): BriefingItem[] => {
          if (t.regra) return [{ texto: t.texto, ...t.regra, confianca: 1, metodo: 'regra' }];
          const a = response.answers[`trecho_${i}`];
          return a && a.choice !== 'pedido' ? [{ texto: t.texto, tipo: BriefingTipoSchema.parse(a.choice), confianca: a.probabilities[a.choice] ?? a.confidence, metodo: 'ia' }] : [];
        }),
        probabilidades: { procedimento: procedimento!.probabilities, tipoTemplate: tipo_arte!.probabilities, agente: agente!.probabilities, ...(empresa ? { empresa: empresa.probabilities } : {}) },
        tokens: { entrada: response.usage.input_tokens, saida: response.usage.output_tokens }, latenciaMs: response.latenciaMs, modelo: response.model,
      };
    } else {
      this.bus.log('warn', this.config.CLASSIFIER_PROVIDER !== 'jev' ? 'Triagem mock: CLASSIFIER_PROVIDER diferente de jev.' : 'Triagem mock: credencial Jev ausente.');
      const start = performance.now();
      const mock = classifyMock({ briefing: texto });
      const empresaMock = empresaPorCadastro(texto, clientes) ?? empresaPorExtracao(texto);
      const agenteMock = decidirAgentePorRegra(texto, empresaMock.cadastrada) ?? { agente: 'van_gogh' as const, confianca: 0.5, motivo: 'Sem sinal claro: padrão demanda de cliente.' };
      const probabilidades = { procedimento: distribuicao(Object.keys(procedimentos) as (keyof typeof procedimentos)[], mock.procedimento, mock.confianca), tipoTemplate: distribuicao(Object.keys(templates) as (keyof typeof templates)[], mock.tipoTemplate, mock.confianca), agente: distribuicao(['van_gogh', 'monalisa'] as const, agenteMock.agente, agenteMock.confianca) };
      const briefing = segmentar(texto).slice(0, MAX_TRECHOS).flatMap((trecho): BriefingItem[] => {
        const regra = tipoPorRegra(trecho);
        if (regra) return [{ texto: trecho, ...regra, confianca: 1, metodo: 'regra' }];
        const tipo = tipoHeuristico(trecho);
        return tipo === 'pedido' ? [] : [{ texto: trecho, tipo, confianca: 0.6, metodo: 'heuristica' }];
      });
      fields = { empresa: empresaMock, ...porRegra(agenteMock), probabilidades, briefing, procedimento: mock.procedimento, procedimentoConfianca: mock.confianca, tipoTemplate: mock.tipoTemplate, tipoTemplateConfianca: mock.confianca, tokens: { entrada: 0, saida: 0 }, latenciaMs: performance.now() - start, modelo };
    }
    const usd = (fields.tokens.entrada * this.config.JEV_PRICE_INPUT_USD_PER_MTOK + fields.tokens.saida * this.config.JEV_PRICE_OUTPUT_USD_PER_MTOK) / 1e6;
    const triagem = TriagemSchema.parse({ id, texto, ...fields, familiaArte: fields.tipoTemplate.startsWith('antes_depois') ? 'antes_depois' : 'banco_imagem', provider, custo: { usd, brl: usd * this.config.USD_BRL, cotacaoUsdBrl: this.config.USD_BRL }, criadoEm: this.bus.clock.now().toISOString() });
    this.bus.emit({ type: 'triagem.result', payload: triagem });
    this.bus.log('info', `Triagem ${id}: ${provider}, ${triagem.procedimento}, ${triagem.tipoTemplate}, ${triagem.agente}, ${triagem.latenciaMs.toFixed(1)} ms, ${triagem.tokens.entrada + triagem.tokens.saida} tokens.`);
    return triagem;
  }
}
