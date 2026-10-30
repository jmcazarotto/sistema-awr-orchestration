import sharp from 'sharp';
import { z } from 'zod';
import { ArteMetaSchema, FeedbackDiretorSchema, ReviewItemSchema, ReviewResultSchema } from '../../shared/types';
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
    const meta = ArteMetaSchema.parse(JSON.parse((await this.storage.read(metaPath(path))).toString('utf8')));
    // Arte final por IA (Van Gogh): rubrica R (procedimento) + M (marca) + T (técnica arte_final_ia).
    const context = await this.brain.context(procedimento, tipoTemplate, demanda.clinicaNome, meta.arteFinal ? { marcaId: meta.arteFinal.marca } : undefined);
    const photo = await this.storage.read(path);
    let itens: ReviewItem[];
    let resumoVisual = '';
    if (this.config.AI_MODE === 'openai') {
      if (!this.ai) throw new Error('VisionReviewer OpenAI não configurado');
      const agent = await this.brain.loadAgent('art_director');
      const imagens = [photo];
      const manifesto = ['Imagem 1: arte final a avaliar.'];
      if (meta.composicaoFotos === 'ia_integrada') {
        for (const anexo of meta.anexos ?? []) {
          imagens.push(await sharp(await this.storage.read(anexo.arquivo)).resize(1080, 1350, { fit: 'inside', withoutEnlargement: true }).png().toBuffer());
          manifesto.push(`Imagem ${imagens.length}: ${anexo.papel === 'referencia' ? 'referência de layout; comparar geometria e hierarquia' : `foto original de ${anexo.papel}; comparar anatomia e resultado, sem troca ou retoque`}.`);
        }
      }
      const validatedSchema = ReviewResultSchema.omit({ modo: true }).extend({ itens: z.array(ReviewItemSchema.omit({ criterio: true })).min(1) }).superRefine((result, ctx) => {
        if (result.itens.length !== context.rubrica.length || new Set(result.itens.map(item => item.id)).size !== context.rubrica.length || context.rubrica.some(item => !result.itens.some(value => value.id === item.id && value.severidade === item.severidade))) ctx.addIssue({ code: 'custom', message: 'Responder exatamente uma vez a cada item da rubrica' });
      });
      const result = await this.ai.json(this.ai.alvo('rubrica', this.config.REVIEW_MODEL), validatedSchema, agent.systemPrompt, JSON.stringify({ rubrica: context.rubrica, ...(meta.arteFinal ? { marca: context.marca?.conteudo ?? null, tecnica: context.tecnica?.conteudo, textosExatosDoBriefing: meta.arteFinal.textosExatos, disclaimer: meta.textos.disclaimer } : { composicao: context.composition.conteudo }), skill: context.skill.conteudo, template: tipoTemplate, imagens: manifesto, instrucoes: 'Avalie cada item com sim/nao e evidência visual específica em uma frase curta: diga qual elemento observou e onde está na arte. Não repita justificativas genéricas, não descreva ferramentas de produção (SVG, mock, Skill) e não invente verificações. Use português simples para o time de atendimento. Em feedback.resumo, sintetize o resultado em até duas frases, com os principais acertos e a prioridade de ajuste, se houver. Compare as fotos com as fontes quando fornecidas; não afirme fidelidade apenas porque há um par de fotos. Score é proporção de itens sim. Feedback cita IDs reprovados, até três correções executáveis.' }), imagens.length > 1 ? imagens : photo);
      itens = result.itens;
      resumoVisual = result.feedback.resumo;
    } else {
      const metadata = await sharp(photo).metadata();
      itens = context.rubrica.map(item => ({ id: item.id, severidade: item.severidade, resposta: 'sim', evidencia: 'Critério não verificado visualmente nesta simulação.' }));
      const fail = (id: string, evidencia: string) => { const item = itens.find(value => value.id === id); if (item) { item.resposta = 'nao'; item.evidencia = evidencia; } };
      if (meta.textos.disclaimer !== context.skill.disclaimer) fail('R01', 'Disclaimer obrigatório ausente ou alterado.');
      if (metadata.width !== 1080 || metadata.height !== (this.config.IMAGE_SIZE === '1080x1920' ? 1920 : 1350)) fail('R06', 'Dimensão da arte incompatível com o template.');
      const rng = this.options.rng ?? seededRng(`${this.options.seed ?? ''}:${demanda.id}:${versao}`);
      // Reprovação simulada nunca recai sobre imagem paga (evita regerar na OpenAI só para testar o loop).
      if (meta.engine !== 'openai' && rng() < this.config.MOCK_REJECT_RATE) {
        const candidates = context.rubrica.filter(item => item.id !== 'R01' && !item.id.startsWith('G'));
        const critical = candidates.filter(item => item.severidade === 'critico');
        const first = critical[Math.min(critical.length - 1, Math.floor(rng() * critical.length))] ?? candidates[0];
        if (first) fail(first.id, `Defeito simulado reproduzível (${demanda.id}, versão ${versao}): ${first.pergunta}`);
        if (rng() < 0.5) { const second = candidates.find(item => item.id !== first?.id); if (second) fail(second.id, `Defeito simulado adicional: ${second.pergunta}`); }
      }
    }
    itens = itens.map(item => ({ ...item, criterio: context.rubrica.find(value => value.id === item.id)!.pergunta }));
    const failed = itens.filter(item => item.resposta === 'nao').sort((a, b) => Number(b.severidade === 'critico') - Number(a.severidade === 'critico'));
    let feedback = { resumo: this.config.AI_MODE === 'openai' ? (resumoVisual || (failed.length ? `${failed.length} ponto(s) precisam de atenção.` : 'Nenhum ajuste apontado na análise visual.')) : 'Revisão simulada: apenas o texto obrigatório nos metadados e as dimensões do arquivo foram conferidos. Composição, legibilidade e fotos precisam de conferência humana.', correcoes: failed.slice(0, 3).map(item => ({ itemId: item.id, instrucao: instruction(context.rubrica.find(value => value.id === item.id)!) })) };
    if (failed.length && this.config.AI_MODE === 'openai' && this.ai) {
      const schema = FeedbackDiretorSchema.superRefine((result, ctx) => { if (result.correcoes.length === 0 || result.correcoes.some(item => !failed.some(value => value.id === item.itemId))) ctx.addIssue({ code: 'custom', message: 'Correções devem citar apenas IDs reprovados' }); });
      feedback = await this.ai.json(this.ai.alvo('feedback', this.config.FEEDBACK_MODEL), schema, 'Redija feedback em português simples para o time de atendimento: o quê, onde e como corrigir. Resumo em até duas frases. Não repita as evidências nem cite ferramentas internas. Máximo três correções, críticos primeiro. Cite somente IDs reprovados.', JSON.stringify({ resumoVisual, failed, template: context.skill.templates[tipoTemplate] }));
    }
    return ReviewResultSchema.parse({ modo: this.config.AI_MODE === 'openai' ? 'visual' : 'simulado', aprovada: rubricaAprovada(itens), score: itens.filter(item => item.resposta === 'sim').length / itens.length, itens, feedback });
  }
}
function instruction(item: RubricaItem): string {
  if (/selo|sobrep|geometria|template|margem/i.test(item.pergunta)) return 'Ajuste as posições e margens para evitar cortes e sobreposição entre os elementos.';
  if (/texto|portugu|disclaimer|leg[ií]ve/i.test(item.pergunta)) return 'Confira o texto obrigatório e ajuste tamanho e contraste para facilitar a leitura.';
  return 'Confira este critério na imagem e ajuste o elemento correspondente antes de reenviar.';
}
