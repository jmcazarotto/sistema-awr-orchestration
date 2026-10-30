import type { IaRegistry } from './IaRegistry';
import { nanoid } from 'nanoid';
import sharp from 'sharp';
import { BriefingTipoSchema, CriadorIdSchema, ProcedimentoSchema, TipoTemplateSchema, TriagemRequestSchema, TriagemSchema, iaModelo } from '../../shared/types';
import type { AnexoDemanda, BriefingItem, OrchestratorConfig, Triagem, TriagemEtapa, TriagemProvider } from '../../shared/types';
import { ClientesRegistry } from '../brain/ClientesRegistry';
import type { Cliente } from '../brain/ClientesRegistry';
import { matchEmpresa, unidadeCitada } from '../brain/EmpresaMatcher';
import type { AcervoStorage } from '../core/interfaces';
import type { EventBus } from '../core/EventBus';
import type { AiClient, ImagemDecisao } from './AiClient';
import { LeituraBriefingSchema, MAX_TRECHOS, SISTEMA_LEITURA, briefingHeuristico, briefingPorRegras, mesclarBriefing, promptLeitura, validarLeitura } from './briefingLeitura';
import type { Classificadora, Predicados } from './DecisionsClient';
import type { DemandaAnexos } from './DemandaAnexos';
import { classifyMock } from './FastClassifier';
import { criteriosAgente, decidirAgentePorRegra } from './agenteRouting';
import { criteriosTrecho, segmentar, tipoPorRegra } from './briefingExtractor';
import type { JevQuestions } from './JevClient';

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

const PREDICADOS_FOTOS: Predicados = {
  fotos_regiao: 'As fotos marcadas como ANTES e DEPOIS mostram a região do procedimento citado no pedido.',
  fotos_comparaveis: 'As fotos marcadas como ANTES e DEPOIS mostram a mesma região com enquadramento comparável.',
  fotos_ordem: 'A foto marcada como ANTES mostra o estado anterior e a marcada como DEPOIS mostra o resultado, sem papéis trocados.',
};
const ALERTA_FOTOS: Record<string, string> = {
  fotos_regiao: 'As fotos de antes e depois parecem não mostrar a região do procedimento pedido.',
  fotos_comparaveis: 'As fotos de antes e depois parecem não ter enquadramento comparável.',
  fotos_ordem: 'As fotos de antes e depois podem estar com os papéis trocados.',
};
const CACHE_TRIAGENS = 30;
const legendas: Record<AnexoDemanda['papel'], string> = { antes: 'foto real de ANTES', depois: 'foto real de DEPOIS', referencia: 'referência de layout, não é paciente da demanda' };

interface Leitura { itens: BriefingItem[]; etapa: TriagemEtapa; alerta?: string }
export interface TriagemDependencias { ai?: Pick<AiClient, 'disponivel' | 'jsonComUso'>; decisions?: Classificadora; anexos?: DemandaAnexos; storage?: Pick<AcervoStorage, 'read'> }

export class TriagemService {
  private readonly recentes = new Map<string, Triagem>();
  constructor(private readonly config: OrchestratorConfig, private readonly bus: Pick<EventBus, 'emit' | 'log' | 'clock'>, private readonly jev?: Classificadora, private readonly ia?: Pick<IaRegistry, 'registrar' | 'para'>, private readonly deps: TriagemDependencias = {}) {}

  /** A classificadora vem das Configurações; sem credencial cai no modo local. */
  private classificadora(): { cliente: Classificadora; provider: TriagemProvider; modelo: string } | null {
    const modelo = this.ia?.para('triagem').modelo ?? (this.config.CLASSIFIER_PROVIDER === 'jev' ? 'jev-latest' : 'simulado');
    const provedor = iaModelo(modelo)?.provedor;
    if (provedor === 'jev' && this.jev) return { cliente: this.jev, provider: 'jev', modelo: this.config.JEV_MODEL };
    if (provedor === 'openai_decisions' && this.deps.decisions && this.deps.ai?.disponivel) return { cliente: this.deps.decisions, provider: 'openai_decisions', modelo };
    return null;
  }
  /** true = classifica com IA real; false = FastClassifier usa a heurística sem emitir triagem. */
  get real(): boolean { return this.classificadora() !== null; }
  /** Triagem conferida na tela, desde que o texto e os anexos não tenham mudado. */
  recente(id: string | undefined, texto: string, anexos: string[] = []): Triagem | undefined {
    const triagem = id ? this.recentes.get(id) : undefined;
    return triagem && triagem.texto === texto.trim() && [...triagem.anexos].sort().join() === [...anexos].sort().join() ? triagem : undefined;
  }

  /** Etapa de texto: separa o que é livre (preço, CTA, modelo da foto…). Falha aqui não derruba a triagem. */
  private async lerTexto(texto: string, anexos: AnexoDemanda[]): Promise<Leitura | null> {
    const alvo = this.ia?.para('leitura_briefing'); const ai = this.deps.ai;
    if (!alvo || alvo.modelo === 'simulado' || !ai?.disponivel) return null;
    const start = performance.now();
    const base = { id: 'leitura_texto' as const, modelo: alvo.modelo };
    try {
      const { dados, tokens } = await ai.jsonComUso(alvo, LeituraBriefingSchema, SISTEMA_LEITURA, promptLeitura(texto, anexos));
      const { itens, descartados } = validarLeitura(dados, texto);
      const catalogo = iaModelo(alvo.modelo);
      return { itens, ...(descartados ? { alerta: `${descartados} informação(ões) da leitura foram descartadas por não estarem no pedido. Confira o briefing.` } : {}),
        etapa: { ...base, status: 'ok', campos: [...new Set(itens.map(item => item.tipo))], latenciaMs: performance.now() - start, tokens, usd: (tokens.entrada * (catalogo?.precoEntrada ?? 0) + tokens.saida * (catalogo?.precoSaida ?? 0)) / 1e6 } };
    } catch {
      this.bus.log('warn', 'Leitura do briefing por IA falhou; usando regras e classificadora.');
      return { itens: [], alerta: 'A leitura do texto por IA falhou: o briefing veio só das regras. Confira antes de produzir.', etapa: { ...base, status: 'falhou', campos: [], latenciaMs: performance.now() - start, tokens: { entrada: 0, saida: 0 }, usd: 0 } };
    }
  }
  /** Só a Decisions API olha imagens. Redução controla custo: a análise é de conteúdo, não de detalhe fino. */
  private async imagens(anexos: AnexoDemanda[], provider: TriagemProvider): Promise<ImagemDecisao[]> {
    if (provider !== 'openai_decisions' || !this.deps.storage) return [];
    return Promise.all(anexos.map(async (anexo, i) => ({ legenda: `Imagem ${i + 1}: ${legendas[anexo.papel]}.`, buffer: await sharp(await this.deps.storage!.read(anexo.arquivo)).resize(768, 768, { fit: 'inside', withoutEnlargement: true }).png().toBuffer() })));
  }

  async triar(value: string, ids: string[] = []): Promise<Triagem> {
    const { texto, anexos: idsAnexos = [] } = TriagemRequestSchema.parse({ texto: value, ...(ids.length ? { anexos: ids } : {}) });
    const anexos = await this.deps.anexos?.resolve(idsAnexos) ?? [];
    const id = `TRI-${nanoid()}`;
    const classificadora = this.classificadora();
    const provider = classificadora?.provider ?? 'mock';
    const modelo = classificadora?.modelo ?? 'heuristica';
    this.bus.emit({ type: 'triagem.started', payload: { triagemId: id, texto, provider, modelo } });
    const clientes = await new ClientesRegistry(this.config.BRAIN_DIR).list();
    const porCadastro = empresaPorCadastro(texto, clientes);
    const regras = briefingPorRegras(texto, MAX_TRECHOS);
    const leitura = await this.lerTexto(texto, anexos);
    const comFotos = anexos.some(anexo => anexo.papel === 'antes');
    const etapaRegras = (briefing: BriefingItem[], extras: string[] = []): TriagemEtapa => ({ id: 'regras', modelo: 'regras', status: 'ok', campos: [...new Set([...(porCadastro ? ['empresa'] : []), ...(comFotos ? ['familia_antes_depois'] : []), ...extras, ...briefing.filter(item => item.metodo === 'regra').map(item => item.tipo)])], latenciaMs: 0, tokens: { entrada: 0, saida: 0 }, usd: 0 });
    const alertas: string[] = leitura?.alerta ? [leitura.alerta] : [];
    const etapas: TriagemEtapa[] = leitura ? [leitura.etapa] : [];
    const briefingLido = leitura ? mesclarBriefing(leitura.itens, regras) : null;
    let fields: Pick<Triagem, 'empresa' | 'procedimento' | 'procedimentoConfianca' | 'tipoTemplate' | 'tipoTemplateConfianca' | 'agente' | 'agenteConfianca' | 'agenteMotivo' | 'agenteRegra' | 'probabilidades' | 'briefing' | 'modelo'>;
    if (classificadora) {
      const agentePorRegra = decidirAgentePorRegra(texto, Boolean(porCadastro));
      // Com a leitura de texto ok, trechos não voltam à classificadora (uma pergunta a menos por trecho).
      const trechos = leitura?.etapa.status === 'ok' ? [] : segmentar(texto).slice(0, MAX_TRECHOS).map(texto => ({ texto, regra: tipoPorRegra(texto) }));
      const imagens = await this.imagens(anexos, classificadora.provider);
      const opcoesTemplate = comFotos ? { antes_depois_1: templates.antes_depois_1, antes_depois_2: templates.antes_depois_2 } : templates;
      const questions: JevQuestions = {
        procedimento: { type: 'choice', instructions: 'Qual procedimento estético é solicitado no texto?', criteria: procedimentos },
        ...(porCadastro ? {} : { empresa: { type: 'choice' as const, instructions: 'Para qual rede/franquia de clínicas é a arte? Considere variações de grafia do nome. Se o texto não cita nenhuma rede cadastrada, escolha nao_identificada. Não associe uma clínica desconhecida a uma cadastrada.', criteria: { ...Object.fromEntries(clientes.map(cliente => [cliente.id, `${cliente.nome}${cliente.tipo === 'franquia' ? ' (franquia)' : ''}; nomes conhecidos: ${[cliente.nome, ...cliente.aliases].join(', ')}${cliente.unidades.length ? `; unidades: ${cliente.unidades.map(u => u.cidade).join(', ')}` : ''}`])), nao_identificada: 'Empresa não citada ou não cadastrada entre as opções.' } } }),
        tipo_arte: { type: 'choice', instructions: `Qual layout de arte foi solicitado? Use a orientação descrita; para antes e depois sem orientação use lado a lado. Post institucional usa foto em cima e painel embaixo.${imagens.some(imagem => imagem.legenda.includes('referência')) ? ' Havendo imagem de referência, escolha o layout mais parecido com ela.' : ''}`, criteria: opcoesTemplate },
        // Sempre perguntado (mesmo com regra) para exibir a distribuição completa na UI.
        ...Object.fromEntries(trechos.flatMap((t, i) => t.regra ? [] : [[`trecho_${i}`, { type: 'choice' as const, instructions: `O trecho "${t.texto}" é só identificação do pedido ou é briefing para a criação da arte? Se for briefing, de que tipo?`, criteria: criteriosTrecho }]])),
        agente: { type: 'choice', instructions: 'Qual agente de arte deve produzir? Pedido pontual de cliente/clínica/unidade vai para van_gogh; abastecimento rotineiro do acervo (peças de estoque), mesmo citando a rede, vai para monalisa.', criteria: criteriosAgente },
      };
      const response = await classificadora.cliente.ask(texto, questions, { imagens, ...(comFotos && imagens.length ? { predicados: PREDICADOS_FOTOS } : {}) });
      const { procedimento, empresa, tipo_arte, agente } = response.answers;
      const rede = !porCadastro && empresa && empresa.confidence >= 0.7 ? clientes.find(cliente => cliente.id === empresa.choice) : undefined;
      const unidadeIa = rede ? unidadeCitada(texto, rede) : null;
      for (const [nome, probabilidade] of Object.entries(response.predicados)) if (probabilidade < 0.5 && ALERTA_FOTOS[nome]) alertas.push(ALERTA_FOTOS[nome]);
      const trechosIa = trechos.flatMap((t, i): BriefingItem[] => {
        if (t.regra) return [{ texto: t.texto, ...t.regra, confianca: 1, metodo: 'regra' }];
        const a = response.answers[`trecho_${i}`];
        return a && a.choice !== 'pedido' ? [{ texto: t.texto, tipo: BriefingTipoSchema.parse(a.choice), confianca: a.probabilities[a.choice] ?? a.confidence, metodo: 'ia' }] : [];
      });
      const usd = (response.usage.input_tokens * (classificadora.provider === 'jev' ? this.config.JEV_PRICE_INPUT_USD_PER_MTOK : iaModelo(modelo)?.precoEntrada ?? 0) + response.usage.output_tokens * (classificadora.provider === 'jev' ? this.config.JEV_PRICE_OUTPUT_USD_PER_MTOK : iaModelo(modelo)?.precoSaida ?? 0)) / 1e6;
      etapas.push({ id: 'decisoes', modelo: classificadora.provider === 'jev' ? response.model : modelo, status: 'ok', campos: [...Object.keys(questions).filter(nome => !nome.startsWith('trecho_')), ...(trechos.some(t => !t.regra) ? ['trechos'] : []), ...(imagens.length ? ['imagens'] : [])], latenciaMs: response.latenciaMs, tokens: { entrada: response.usage.input_tokens, saida: response.usage.output_tokens }, usd });
      // Jev cobra pelo preço do contrato (.env); a Decisions API já é registrada no AiClient.
      if (classificadora.provider === 'jev') await this.ia?.registrar({ modelo: 'jev-latest', provedor: 'jev', tokensEntrada: response.usage.input_tokens, tokensSaida: response.usage.output_tokens, usd });
      fields = {
        empresa: porCadastro ?? (rede
          ? { id: unidadeIa?.id ?? rede.id, nome: unidadeIa?.nome ?? rede.nome, cadastrada: true, confianca: empresa!.confidence, rede: { id: rede.id, nome: rede.nome }, unidade: unidadeIa && { id: unidadeIa.id, nome: unidadeIa.cidade, cadastrada: true }, metodo: 'ia' }
          : empresaPorExtracao(texto)),
        procedimento: ProcedimentoSchema.parse(procedimento!.choice), procedimentoConfianca: procedimento!.confidence,
        tipoTemplate: TipoTemplateSchema.parse(tipo_arte!.choice), tipoTemplateConfianca: tipo_arte!.confidence,
        ...(agentePorRegra ? porRegra(agentePorRegra) : { agente: CriadorIdSchema.parse(agente!.choice), agenteConfianca: agente!.confidence, agenteMotivo: 'Decidido pelo classificador (texto sem sinal claro de cliente ou de acervo).', agenteRegra: false }),
        briefing: briefingLido ?? trechosIa,
        probabilidades: { procedimento: procedimento!.probabilities, tipoTemplate: tipo_arte!.probabilities, agente: agente!.probabilities, ...(empresa ? { empresa: empresa.probabilities } : {}) },
        modelo: response.model,
      };
      etapas.unshift(etapaRegras(fields.briefing, agentePorRegra ? ['agente'] : []));
    } else {
      this.bus.log('warn', 'Triagem simulada: classificadora local ou sem credencial.');
      const start = performance.now();
      const mock = classifyMock({ briefing: texto, ...(comFotos ? { tipoTemplate: 'antes_depois_1' as const } : {}) });
      const empresaMock = porCadastro ?? empresaPorExtracao(texto);
      const agenteMock = decidirAgentePorRegra(texto, empresaMock.cadastrada) ?? { agente: 'van_gogh' as const, confianca: 0.5, motivo: 'Sem sinal claro: padrão demanda de cliente.' };
      const probabilidades = { procedimento: distribuicao(Object.keys(procedimentos) as (keyof typeof procedimentos)[], mock.procedimento, mock.confianca), tipoTemplate: distribuicao(Object.keys(templates) as (keyof typeof templates)[], mock.tipoTemplate, mock.confianca), agente: distribuicao(['van_gogh', 'monalisa'] as const, agenteMock.agente, agenteMock.confianca) };
      const briefing = briefingLido ?? briefingHeuristico(texto, MAX_TRECHOS);
      fields = { empresa: empresaMock, ...porRegra(agenteMock), probabilidades, briefing, procedimento: mock.procedimento, procedimentoConfianca: mock.confianca, tipoTemplate: mock.tipoTemplate, tipoTemplateConfianca: mock.confianca, modelo };
      etapas.unshift(etapaRegras(briefing), { id: 'decisoes', modelo: 'simulado', status: 'simulada', campos: ['procedimento', 'tipo_arte', 'agente'], latenciaMs: performance.now() - start, tokens: { entrada: 0, saida: 0 }, usd: 0 });
      if (!leitura) etapas.splice(1, 0, { id: 'leitura_texto', modelo: 'simulado', status: 'simulada', campos: [...new Set(briefing.filter(item => item.metodo === 'heuristica').map(item => item.tipo))], latenciaMs: 0, tokens: { entrada: 0, saida: 0 }, usd: 0 });
    }
    // Só depois da classificação: a arte de acervo não recebe fotos de cliente.
    if (fields.tipoTemplate.startsWith('antes_depois') && fields.agente === 'van_gogh' && !comFotos) alertas.push('Antes e depois exige as duas fotos reais anexadas. Sem elas o Van Gogh não produz.');
    const soma = etapas.reduce((acc, etapa) => ({ entrada: acc.entrada + etapa.tokens.entrada, saida: acc.saida + etapa.tokens.saida, usd: acc.usd + etapa.usd, latenciaMs: acc.latenciaMs + etapa.latenciaMs }), { entrada: 0, saida: 0, usd: 0, latenciaMs: 0 });
    const triagem = TriagemSchema.parse({ id, texto, ...fields, anexos: idsAnexos, etapas, alertas, tokens: { entrada: soma.entrada, saida: soma.saida }, latenciaMs: soma.latenciaMs, familiaArte: fields.tipoTemplate.startsWith('antes_depois') ? 'antes_depois' : 'banco_imagem', provider, custo: { usd: soma.usd, brl: soma.usd * this.config.USD_BRL, cotacaoUsdBrl: this.config.USD_BRL }, criadoEm: this.bus.clock.now().toISOString() });
    this.recentes.set(id, triagem);
    if (this.recentes.size > CACHE_TRIAGENS) this.recentes.delete(this.recentes.keys().next().value!);
    this.bus.emit({ type: 'triagem.result', payload: triagem });
    this.bus.log('info', `Triagem ${id}: ${provider}, ${triagem.procedimento}, ${triagem.tipoTemplate}, ${triagem.agente}, ${triagem.latenciaMs.toFixed(1)} ms, ${triagem.tokens.entrada + triagem.tokens.saida} tokens.`);
    return triagem;
  }
}
