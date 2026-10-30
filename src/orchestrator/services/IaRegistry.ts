import { IA_CATALOGO, IA_EFFORT_API, IA_SITUACOES, IA_SITUACAO_INFO, IaModelosSchema, IaUsoResponseSchema, iaModelo } from '../../shared/types';
import type { IaModeloConfig, IaModelos, IaProvedor, IaSituacao, IaUsoResponse, OrchestratorConfig } from '../../shared/types';
import type { EventBus } from '../core/EventBus';

/** Chamada real a um modelo (para custo/uso). Mock/heurística não registra. */
export interface IaChamada { modelo: string; provedor?: IaProvedor; tokensEntrada?: number; tokensSaida?: number; usd?: number }

/** Modelo + esforço por situação (Configurações › Modelos de IA) e medidor de uso/custo das integrações. */
export class IaRegistry {
  constructor(private readonly config: OrchestratorConfig, private readonly bus: EventBus) {}

  /** Defaults vêm do env (CLAUDE.md: modelos nunca hardcoded); a escolha salva na UI tem prioridade. */
  private padrao(situacao: IaSituacao): IaModeloConfig {
    // Imagem real só por padrão quando IMAGE_ENGINE_MODE=openai; Monalisa segue simulada até ser liberada nas Configurações.
    const imagem = this.config.IMAGE_ENGINE_MODE === 'openai' ? this.config.IMAGE_MODEL : 'simulado';
    // Como a imagem: Jev segue o provider do .env; Luna real por padrão só com AI_MODE=openai ou escolhida nas Configurações.
    const jev = this.config.CLASSIFIER_PROVIDER === 'jev'; const iaReal = this.config.AI_MODE === 'openai';
    const env: Record<IaSituacao, string> = {
      triagem: jev ? 'jev-latest' : iaReal ? this.config.CLASSIFIER_MODEL : 'simulado',
      leitura_briefing: jev || iaReal ? this.config.BRIEFING_MODEL : 'simulado',
      rubrica: this.config.REVIEW_MODEL, feedback: this.config.FEEDBACK_MODEL,
      aprendizado: this.config.FEEDBACK_MODEL, imagem_van_gogh: imagem, imagem_monalisa: 'simulado',
    };
    const permitido = IA_SITUACAO_INFO[situacao].modelos;
    const modelo = permitido.includes(env[situacao]) ? env[situacao] : permitido[0]!;
    const efforts = iaModelo(modelo)?.efforts ?? [];
    return { modelo, effort: efforts.includes('medio') ? 'medio' : null };
  }
  modelos(): IaModelos {
    const salvos = this.bus.snapshot().ia.modelos;
    // Escolha salva que saiu da lista (ex.: Decisions onde é preciso escrever texto) volta ao padrão.
    return Object.fromEntries(IA_SITUACOES.map(s => { const salvo = salvos[s]; return [s, salvo && IA_SITUACAO_INFO[s].modelos.includes(salvo.modelo) ? salvo : this.padrao(s)]; })) as IaModelos;
  }
  async salvarModelos(input: IaModelos): Promise<IaModelos> {
    const modelos = IaModelosSchema.parse(input);
    await this.bus.transaction(state => { state.ia.modelos = modelos; });
    this.bus.log('info', 'Modelos de IA atualizados nas Configurações');
    return this.modelos();
  }
  /** Modelo e esforço (já no formato da API) para uma situação. */
  para(situacao: IaSituacao): { modelo: string; effort?: string } {
    const { modelo, effort } = this.modelos()[situacao];
    return effort ? { modelo, effort: IA_EFFORT_API[effort] } : { modelo };
  }

  async registrar(chamada: IaChamada): Promise<void> {
    const catalogo = iaModelo(chamada.modelo);
    const provedor = chamada.provedor ?? catalogo?.provedor ?? 'openai';
    const entrada = chamada.tokensEntrada ?? 0; const saida = chamada.tokensSaida ?? 0;
    const usd = chamada.usd ?? (catalogo?.precoEntrada != null ? (entrada * catalogo.precoEntrada + saida * (catalogo.precoSaida ?? 0)) / 1_000_000 : 0);
    const agora = this.bus.clock.now().toISOString();
    await this.bus.transaction(state => {
      const chave = `${provedor}:${chamada.modelo}`;
      const atual = state.ia.uso[chave] ?? { provedor, modelo: chamada.modelo, chamadas: 0, tokensEntrada: 0, tokensSaida: 0, usd: 0 };
      state.ia.uso[chave] = { ...atual, chamadas: atual.chamadas + 1, tokensEntrada: atual.tokensEntrada + entrada, tokensSaida: atual.tokensSaida + saida, usd: atual.usd + usd };
      state.ia.usoDesde ??= agora;
    });
  }
  uso(): IaUsoResponse {
    const { uso, usoDesde } = this.bus.snapshot().ia; const cotacao = this.config.USD_BRL;
    // Jev, Decisions API e os modelos de imagem aparecem sempre (mesmo zerados); demais modelos só depois de usados.
    const fixos = IA_CATALOGO.filter(m => m.provedor !== 'local' && (m.provedor !== 'openai' || m.tipo === 'imagem')).map(m => `${m.provedor}:${m.id}`);
    const chaves = [...new Set([...fixos, ...Object.keys(uso)])];
    const itens = chaves.map(chave => {
      const [provedor, ...resto] = chave.split(':'); const modelo = resto.join(':'); const registro = uso[chave];
      const catalogo = iaModelo(modelo);
      const precificado = (catalogo?.precoEntrada ?? null) !== null || provedor === 'jev';
      const usd = registro?.usd ?? 0;
      return { provedor: provedor as IaProvedor, modelo, tipo: catalogo?.tipo ?? 'texto', chamadas: registro?.chamadas ?? 0, tokensEntrada: registro?.tokensEntrada ?? 0, tokensSaida: registro?.tokensSaida ?? 0, usd, brl: usd * cotacao, precificado };
    });
    const total = itens.reduce((acc, item) => ({ chamadas: acc.chamadas + item.chamadas, usd: acc.usd + item.usd, brl: acc.brl + item.brl }), { chamadas: 0, usd: 0, brl: 0 });
    return IaUsoResponseSchema.parse({ desde: usoDesde, cotacaoUsdBrl: cotacao, itens, total });
  }
  async zerarUso(): Promise<IaUsoResponse> {
    await this.bus.transaction(state => { state.ia.uso = {}; state.ia.usoDesde = null; });
    return this.uso();
  }
}
