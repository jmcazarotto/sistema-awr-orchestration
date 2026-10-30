import { ClassificacaoSchema, skillPath } from '../../shared/types';
import type { BriefingItem, Classificacao, Procedimento, SubmitDemandInput, TipoTemplate } from '../../shared/types';
import { decidirAgentePorRegra } from './agenteRouting';
import { MAX_TRECHOS, briefingHeuristico } from './briefingLeitura';
import type { TriagemService } from './TriagemService';

export type ClassificacaoDemanda = Classificacao & { briefingItens: BriefingItem[] };
export class FastClassifier {
  constructor(private readonly triagem?: TriagemService) {}
  async classify(input: SubmitDemandInput): Promise<ClassificacaoDemanda> {
    if (!this.triagem?.real) return { ...classifyMock(input), briefingItens: briefingHeuristico(input.briefing, MAX_TRECHOS) };
    const result = this.triagem.recente(input.triagemId, input.briefing, input.anexos) ?? await this.triagem.triar(input.briefing, input.anexos);
    const procedimento = input.procedimento ?? result.procedimento;
    const confidences = [!input.procedimento ? result.procedimentoConfianca : 1, !input.tipoTemplate ? result.tipoTemplateConfianca : 1, result.agenteConfianca];
    if (!input.clinicaNome && result.empresa.nome) { input.clinicaNome = result.empresa.nome; confidences.push(result.empresa.confianca); }
    return { ...ClassificacaoSchema.parse({ procedimento, tipoTemplate: input.tipoTemplate ?? result.tipoTemplate, agenteDesignado: result.agente, skillFile: skillPath(procedimento), confianca: Math.min(...confidences) }), briefingItens: result.briefing };
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
