import sharp from 'sharp';
import { ArteMetaSchema, FeedbackDiretorSchema, ReviewResultSchema } from '../../shared/types';
import type { Demanda, OrchestratorConfig, ReviewItem, ReviewResult, RubricaItem } from '../../shared/types';
import type { AcervoStorage } from '../core/interfaces';
import type { BrainLoader } from '../brain/BrainLoader';
import type { AiClient } from './AiClient';
import { metaPath } from './ImageEngine';

export function rubricaAprovada(itens: readonly ReviewItem[]): boolean {
  const critical = itens.filter(item => item.severidade === 'critico'); const normal = itens.filter(item => item.severidade === 'normal');
  return critical.every(item => item.resposta === 'sim') && (normal.length === 0 || normal.filter(item => item.resposta === 'sim').length / normal.length >= 0.8);
}
export function seededRng(seed: string): () => number {
  let value = 2166136261;
  for (const char of seed) value = Math.imul(value ^ char.charCodeAt(0), 16777619);
  return () => { value += 0x6d2b79f5; let next = Math.imul(value ^ value >>> 15, 1 | value); next ^= next + Math.imul(next ^ next >>> 7, 61 | next); return ((next ^ next >>> 14) >>> 0) / 4294967296; };
}
export interface ReviewerOptions { rng?: () => number; seed?: string }
export class VisionReviewer {
  constructor(private readonly config: OrchestratorConfig, private readonly storage: AcervoStorage, private readonly brain: BrainLoader, private readonly ai?: AiClient, private readonly options: ReviewerOptions = {}) {}
  async review(demanda: Demanda, path: string, versao: number): Promise<ReviewResult> {
    if (!demanda.classificacao) throw new Error('Demanda sem classificação');
    const { procedimento, tipoTemplate } = demanda.classificacao;
    const context = await this.brain.context(procedimento, tipoTemplate, demanda.clinicaNome);
    const photo = await this.storage.read(path);
    let itens: ReviewItem[];
    if (this.config.AI_MODE === 'openai') {
      if (!this.ai) throw new Error('VisionReviewer OpenAI não configurado');
      const agent = await this.brain.loadAgent('art_director');
      const validatedSchema = ReviewResultSchema.superRefine((result, ctx) => {
        if (result.itens.length !== context.rubrica.length || new Set(result.itens.map(item => item.id)).size !== context.rubrica.length || context.rubrica.some(item => !result.itens.some(value => value.id === item.id && value.severidade === item.severidade))) ctx.addIssue({ code: 'custom', message: 'Responder exatamente uma vez a cada item da rubrica' });
      });
      const result = await this.ai.json(this.config.REVIEW_MODEL, validatedSchema, agent.systemPrompt, JSON.stringify({ rubrica: context.rubrica, composicao: context.composition.conteudo, skill: context.skill.conteudo, template: tipoTemplate, instrucoes: 'Avalie cada item com sim/nao e evidência visual. Score é proporção de itens sim. Feedback cita IDs reprovados, até três correções executáveis.' }), photo);
      itens = result.itens;
    } else {
      const meta = ArteMetaSchema.parse(JSON.parse((await this.storage.read(metaPath(path))).toString('utf8')));
      const metadata = await sharp(photo).metadata();
      itens = context.rubrica.map(item => ({ id: item.id, severidade: item.severidade, resposta: 'sim', evidencia: 'Composição mock gerada por SVG com geometria e textos da Skill; fotografia ilustrativa.' }));
      const fail = (id: string, evidencia: string) => { const item = itens.find(value => value.id === id); if (item) { item.resposta = 'nao'; item.evidencia = evidencia; } };
      if (meta.textos.disclaimer !== context.skill.disclaimer) fail('R01', 'Disclaimer obrigatório ausente ou alterado.');
      if (metadata.width !== 1080 || metadata.height !== (this.config.IMAGE_SIZE === '1080x1920' ? 1920 : 1350)) fail('R06', 'Dimensão da arte incompatível com o template.');
      const rng = this.options.rng ?? seededRng(`${this.options.seed ?? ''}:${demanda.id}:${versao}`);
      if (rng() < this.config.MOCK_REJECT_RATE) {
        const candidates = context.rubrica.filter(item => item.id !== 'R01' && !item.id.startsWith('G'));
        const critical = candidates.filter(item => item.severidade === 'critico');
        const first = critical[Math.min(critical.length - 1, Math.floor(rng() * critical.length))] ?? candidates[0];
        if (first) fail(first.id, `Defeito simulado reproduzível (${demanda.id}, versão ${versao}): ${first.pergunta}`);
        if (rng() < 0.5) { const second = candidates.find(item => item.id !== first?.id); if (second) fail(second.id, `Defeito simulado adicional: ${second.pergunta}`); }
      }
    }
    const failed = itens.filter(item => item.resposta === 'nao').sort((a, b) => Number(b.severidade === 'critico') - Number(a.severidade === 'critico'));
    let feedback = { resumo: failed.length ? `Corrigir ${failed.map(item => item.id).join(', ')}.` : 'Rubrica aprovada.', correcoes: failed.slice(0, 3).map(item => ({ itemId: item.id, instrucao: instruction(context.rubrica.find(value => value.id === item.id)!) })) };
    if (failed.length && this.config.AI_MODE === 'openai' && this.ai) {
      const schema = FeedbackDiretorSchema.superRefine((result, ctx) => { if (result.correcoes.length === 0 || result.correcoes.some(item => !failed.some(value => value.id === item.itemId))) ctx.addIssue({ code: 'custom', message: 'Correções devem citar apenas IDs reprovados' }); });
      feedback = await this.ai.json(this.config.FEEDBACK_MODEL, schema, 'Redija feedback PT-BR executável: o quê, onde e como. Máximo três correções, críticos primeiro. Cite somente IDs reprovados.', JSON.stringify({ failed, template: context.skill.templates[tipoTemplate] }));
    }
    return ReviewResultSchema.parse({ aprovada: rubricaAprovada(itens), score: itens.filter(item => item.resposta === 'sim').length / itens.length, itens, feedback });
  }
}
function instruction(item: RubricaItem): string {
  if (/selo|sobrep|geometria|template|margem/i.test(item.pergunta)) return `Reposicione os elementos nas caixas exatas do template, sem cortes nem sobreposição. Verifique: ${item.pergunta}`;
  if (/texto|portugu|disclaimer|leg[ií]ve/i.test(item.pergunta)) return `Renderize os textos exatos da Skill via SVG, com 22 px mínimos no disclaimer e contraste legível. Verifique: ${item.pergunta}`;
  return `Corrija a camada fotográfica conforme a Skill, preservando o enquadramento e a grade. Verifique: ${item.pergunta}`;
}
