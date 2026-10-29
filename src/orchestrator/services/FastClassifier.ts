import { ClassificacaoSchema, skillPath } from '../../shared/types';
import type { Classificacao, OrchestratorConfig, Procedimento, SubmitDemandInput, TipoTemplate } from '../../shared/types';
import { decidirAgentePorRegra } from './agenteRouting';
import type { TriagemService } from './TriagemService';
import type { AiClient } from './AiClient';

export class FastClassifier {
  constructor(private readonly config: OrchestratorConfig, private readonly ai?: AiClient, private readonly triagem?: TriagemService) {}
  async classify(input: SubmitDemandInput): Promise<Classificacao> {
    if (this.config.CLASSIFIER_PROVIDER === 'jev') {
      if (!this.triagem) return classifyMock(input);
      const result = await this.triagem.triar(input.briefing);
      const procedimento = input.procedimento ?? result.procedimento;
      const confidences = [!input.procedimento ? result.procedimentoConfianca : 1, !input.tipoTemplate ? result.tipoTemplateConfianca : 1, result.agenteConfianca];
      if (!input.clinicaNome && result.empresa.nome) { input.clinicaNome = result.empresa.nome; confidences.push(result.empresa.confianca); }
      return ClassificacaoSchema.parse({ procedimento, tipoTemplate: input.tipoTemplate ?? result.tipoTemplate, agenteDesignado: result.agente, skillFile: skillPath(procedimento), confianca: Math.min(...confidences) });
    }
    if (this.config.AI_MODE === 'openai' && this.ai) {
      const classification = await this.ai.json(this.config.CLASSIFIER_MODEL, ClassificacaoSchema,
        'Classifique briefing PT-BR. Procedimentos: preenchimento_labial, botox, fios_sustentacao. Templates: antes_depois_1 (lado a lado), antes_depois_2 (empilhado), banco_imagem_1 (foto inteira), banco_imagem_2 (institucional). Respeite procedimento e template explícitos. Cliente é sempre van_gogh. skillFile é skills/<procedimento>.skill.md.', JSON.stringify(input));
      return ClassificacaoSchema.parse({ ...classification, procedimento: input.procedimento ?? classification.procedimento, tipoTemplate: input.tipoTemplate ?? classification.tipoTemplate, agenteDesignado: 'van_gogh', skillFile: skillPath(input.procedimento ?? classification.procedimento) });
    }
    return classifyMock(input);
  }
}

export function classifyMock(input: SubmitDemandInput): Classificacao {
    const text = input.briefing.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    const matches: [Procedimento, RegExp][] = [['preenchimento_labial', /labio|labial|boca|hialuron/], ['botox', /botox|toxina|ruga|testa|expressao/], ['fios_sustentacao', /fio|sustentacao|mandibula|contorno facial/]];
    const found = matches.find(([, regex]) => regex.test(text));
    const procedimento = input.procedimento ?? found?.[0] ?? 'preenchimento_labial';
    const tipoTemplate: TipoTemplate = input.tipoTemplate ?? (/empilhad|horizontal.*antes|antes.*cima|antes_depois_2/.test(text) ? 'antes_depois_2' : /antes|depois|comparativ/.test(text) ? 'antes_depois_1' : /institucional|painel|banco_imagem_2/.test(text) ? 'banco_imagem_2' : 'banco_imagem_1');
    return ClassificacaoSchema.parse({ procedimento, tipoTemplate, agenteDesignado: decidirAgentePorRegra(input.briefing, Boolean(input.clinicaNome))?.agente ?? 'van_gogh', skillFile: skillPath(procedimento), confianca: input.procedimento || found ? 0.95 : 0.55 });
}
