import { OrchestratorError } from '../core/errors';
import type { AiClient, ImagemDecisao } from './AiClient';
import type { JevQuestions } from './JevClient';

/** Pergunta Sim/Não sobre o pedido e seus anexos; só a Decisions API responde (o Jev é apenas texto). */
export type Predicados = Record<string, string>;
export interface OpcoesDecisao { imagens?: ImagemDecisao[]; predicados?: Predicados }
export interface RespostaDecisao {
  model: string; latenciaMs: number; usage: { input_tokens: number; output_tokens: number };
  answers: Record<string, { type: 'choice'; choice: string; confidence: number; probabilities: Record<string, number> }>;
  predicados: Record<string, number>;
}
/** Contrato comum das classificadoras (Luna via Decisions API ou Jev): mesmas perguntas, mesma resposta. */
export interface Classificadora { ask(state: string, questions: JevQuestions, opcoes?: OpcoesDecisao): Promise<RespostaDecisao> }

/** Adapta perguntas e respostas para a Decisions API. Erros do fornecedor não cruzam esta fronteira. */
export class DecisionsClient implements Classificadora {
  constructor(private readonly ai: AiClient, private readonly modelo: string, private readonly now: () => number = () => performance.now()) {}
  async ask(state: string, questions: JevQuestions, { imagens = [], predicados = {} }: OpcoesDecisao = {}): Promise<RespostaDecisao> {
    const start = this.now();
    try {
      const decision = await this.ai.decidir(this.modelo, state, imagens, [
        ...Object.entries(questions).map(([name, question]) => ({ type: 'choice' as const, name, instructions: question.instructions, choices: Object.entries(question.criteria).map(([value, description]) => ({ value, description })) })),
        ...Object.entries(predicados).map(([name, instructions]) => ({ type: 'predicate' as const, name, instructions })),
      ]);
      const answers: RespostaDecisao['answers'] = {}; const probabilidades: Record<string, number> = {};
      for (const answer of decision.answers) {
        if (answer.type === 'predicate' && answer.name) probabilidades[answer.name] = answer.probability;
        if (answer.type !== 'choice' || !answer.name) continue;
        answers[answer.name] = { type: 'choice', choice: String(answer.choice), confidence: answer.confidence, probabilities: Object.fromEntries(answer.probabilities.map(item => [String(item.value), item.probability])) };
      }
      // Recusa pontual em pergunta obrigatória invalida a resposta, como no Jev; predicado recusado só fica sem alerta.
      for (const [name, question] of Object.entries(questions)) {
        const answer = answers[name];
        if (!answer || !Object.hasOwn(question.criteria, answer.choice) || Object.keys(question.criteria).some(key => !Object.hasOwn(answer.probabilities, key))) throw new Error('resposta inválida');
      }
      return { model: decision.model, answers, predicados: probabilidades, usage: { input_tokens: decision.usage.input_tokens, output_tokens: decision.usage.output_tokens }, latenciaMs: Math.max(0, this.now() - start) };
    } catch { throw new OrchestratorError('UPSTREAM_ERROR', 'Falha no classificador de IA.', 502); }
  }
}
