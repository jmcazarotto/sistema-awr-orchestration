import { readFile, writeFile, rename } from 'node:fs/promises';
import { join } from 'node:path';
import { nanoid } from 'nanoid';
import { z } from 'zod';
import { ActorIdSchema, DemandaIdSchema, LearningSchema, PROCEDIMENTOS, ProcedimentoSchema, SkillDetailSchema, SkillIdSchema, TipoTemplateSchema, TIPOS_TEMPLATE } from '../../shared/types';
import type { ActorId, Learning, Procedimento, RubricaItem, SkillDetail, SkillId, TipoTemplate } from '../../shared/types';
import type { Clock } from '../core/interfaces';
import type { EventBus } from '../core/EventBus';
import type { AiClient } from '../services/AiClient';

type YamlValue = string | number | boolean | null | YamlValue[] | { [key: string]: YamlValue };
function splitInline(text: string): string[] {
  const result: string[] = []; let start = 0; let depth = 0; let quote = '';
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if ((char === '"' || char === "'") && text[i - 1] !== '\\') quote = quote === char ? '' : quote || char;
    if (quote) continue;
    if (char === '{' || char === '[') depth++;
    if (char === '}' || char === ']') depth--;
    if (char === ',' && depth === 0) { result.push(text.slice(start, i)); start = i + 1; }
  }
  result.push(text.slice(start)); return result;
}
function yamlValue(raw: string): YamlValue {
  const value = raw.trim();
  if (value.startsWith('{') && value.endsWith('}')) return Object.fromEntries(splitInline(value.slice(1, -1)).filter(Boolean).map(pair => { const colon = pair.indexOf(':'); return [pair.slice(0, colon).trim(), yamlValue(pair.slice(colon + 1))]; }));
  if (value.startsWith('[') && value.endsWith(']')) return splitInline(value.slice(1, -1)).filter(part => part.trim()).map(yamlValue);
  if (/^(["']).*\1$/.test(value)) return value.slice(1, -1);
  if (/^-?\d+(\.\d+)?$/.test(value)) return Number(value);
  if (value === 'true' || value === 'false') return value === 'true';
  if (value === 'null') return null;
  return value;
}
function stripComment(line: string): string {
  let quote = '';
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if ((char === '"' || char === "'") && line[i - 1] !== '\\') quote = quote === char ? '' : quote || char;
    if (char === '#' && !quote && (i === 0 || /\s/.test(line[i - 1] ?? ''))) return line.slice(0, i);
  }
  return line;
}
export function parseFrontMatter(text: string): Record<string, YamlValue> {
  const body = /^\uFEFF?---\r?\n([\s\S]*?)\r?\n---/.exec(text)?.[1];
  if (!body) return {};
  const result: Record<string, YamlValue> = {}; let parent = '';
  for (const line of body.split(/\r?\n/)) {
    const clean = stripComment(line); const match = /^(\s*)([\w-]+):\s*(.*)$/.exec(clean);
    if (!match) continue;
    const key = match[2]!; const raw = match[3]!;
    if (!match[1]) { parent = key; result[key] = raw ? yamlValue(raw) : {}; }
    else { const object = result[parent]; if (object && !Array.isArray(object) && typeof object === 'object') object[key] = yamlValue(raw); }
  }
  return result;
}
export function sections(text: string): Map<string, string> {
  const result = new Map<string, string>();
  const headings = [...text.matchAll(/^## (.+)\r?$/gm)];
  headings.forEach((heading, index) => result.set(heading[1]!.trim(), text.slice(heading.index! + heading[0].length, headings[index + 1]?.index ?? text.length).trim()));
  return result;
}
export function numberedSection(text: string, number: number): string {
  return [...sections(text)].find(([name]) => name.startsWith(`${number}.`))?.[1] ?? '';
}
export function parseLearnings(text: string, procedimento?: Procedimento): Learning[] {
  const withoutExamples = text.replace(/^```[^\n]*\n[\s\S]*?^```\s*$/gm, '');
  const entries = [...withoutExamples.matchAll(/^### ([LGC]\d{2,}) · (.+?) · (.+?) · fonte: (\w+) · (.+)\r?$/gm)];
  return entries.flatMap((entry, index) => {
    const body = withoutExamples.slice(entry.index! + entry[0].length, entries[index + 1]?.index ?? withoutExamples.length);
    const field = (label: string) => new RegExp(`^- \\*\\*${label}:\\*\\* (.+)\\r?$`, 'm').exec(body)?.[1]?.trim();
    const scope = entry[3]!.trim(); const demand = entry[5]!.trim();
    const date = new Date(entry[2]!);
    if (!Number.isFinite(date.getTime())) return [];
    const result = LearningSchema.safeParse({ id: entry[1], createdAt: date.toISOString(), procedimento,
      ...(scope.startsWith('escopo:') ? { escopo: scope.slice(7).trim() } : { template: scope.replace(/^template:\s*/, '') }),
      fonte: entry[4], demandaId: demand.startsWith('DEM-') ? demand : undefined,
      regra: field('Regra'), motivoOriginal: field('Motivo original')?.replace(/^"|"$/g, ''), status: field('Status'),
    });
    return result.success ? [result.data] : [];
  });
}
export function clientSlug(name: string): string { return name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, ''); }
export interface LoadedSkill extends SkillDetail { templates: Partial<Record<TipoTemplate, string>>; promptBase: string; disclaimer: string; palette: string[] }
export interface AppendLearningInput {
  procedimento?: Procedimento; template?: TipoTemplate; escopo?: Learning['escopo']; regra: string;
  motivoOriginal: string; demandaId: string; fonte?: Learning['fonte'];
}
export class BrainLoader {
  private appendQueue: Promise<unknown> = Promise.resolve();
  constructor(readonly directory: string, private readonly clock: Clock, private readonly bus?: EventBus, private readonly ai?: AiClient) {}
  async loadAgent(actor: ActorId): Promise<{ systemPrompt: string; conteudo: string; metadata: Record<string, YamlValue> }> {
    ActorIdSchema.parse(actor);
    const conteudo = await readFile(join(this.directory, 'agents', `${actor}.agent.md`), 'utf8');
    const parts = sections(conteudo);
    return { conteudo, metadata: parseFrontMatter(conteudo), systemPrompt: `${parts.get('SOUL') ?? ''}\n\n${parts.get('Regras Invioláveis') ?? ''}` };
  }
  async loadSkill(id: SkillId): Promise<LoadedSkill> {
    SkillIdSchema.parse(id);
    const skillFile = `skills/${id}.skill.md`;
    const conteudo = await readFile(join(this.directory, skillFile), 'utf8');
    const metadata = parseFrontMatter(conteudo); const templateSection = numberedSection(conteudo, 3);
    const headings = [...templateSection.matchAll(/^### (\w+)\r?$/gm)]; const templates: LoadedSkill['templates'] = {};
    headings.forEach((heading, index) => { const key = TIPOS_TEMPLATE.find(type => type === heading[1]); if (key) templates[key] = templateSection.slice(heading.index! + heading[0].length, headings[index + 1]?.index ?? templateSection.length).trim(); });
    const rubrica: RubricaItem[] = [...numberedSection(conteudo, 5).matchAll(/^- \[(R\d+)\]\[(critico|normal)\] (.+\?)\s*$/gm)].map(match => ({ id: match[1]!, severidade: match[2] === 'critico' ? 'critico' : 'normal', pergunta: match[3]! }));
    const procedimento = PROCEDIMENTOS.find(proc => proc === id);
    const detail = SkillDetailSchema.parse({ id, skillFile, label: metadata.label, versao: metadata.versao, atualizadoEm: String(metadata.atualizado_em), procedimento, conteudo, rubrica, aprendizados: parseLearnings(conteudo, procedimento) });
    const disclaimer = /`(Imagem ilustrativa\.[^`]+)`/.exec(numberedSection(conteudo, 1))?.[1] ?? 'Imagem ilustrativa. Resultados podem variar de pessoa para pessoa. Procedimento realizado por profissional habilitado.';
    return { ...detail, templates, disclaimer, palette: [...numberedSection(conteudo, 2).matchAll(/#[0-9a-fA-F]{6}/g)].map(match => match[0]), promptBase: /```prompt\r?\n([\s\S]*?)```/.exec(numberedSection(conteudo, 4))?.[1]?.trim() ?? '' };
  }
  async loadMemories(): Promise<Learning[]> {
    const texts = await Promise.all(['global_learnings', 'client_preferences'].map(name => readFile(join(this.directory, 'memory', `${name}.md`), 'utf8')));
    return texts.flatMap(text => parseLearnings(text));
  }
  async context(procedimento: Procedimento, template: TipoTemplate, clinicaNome?: string): Promise<{ skill: LoadedSkill; composition: LoadedSkill; aprendizados: Learning[]; rubrica: RubricaItem[] }> {
    const [skill, composition, memories] = await Promise.all([this.loadSkill(procedimento), this.loadSkill('template_composition'), this.loadMemories()]);
    const aprendizados = [...skill.aprendizados, ...memories].filter(learning => learning.status === 'ativo' &&
      (learning.template === template || learning.escopo === 'global' || learning.escopo === `procedimento:${procedimento}` || learning.escopo === `template:${template}` || (clinicaNome && learning.escopo === `cliente:${clientSlug(clinicaNome)}`)));
    // Os Rnn da composição colidem com os do procedimento no contrato. A composição é
    // fornecida integralmente ao revisor, mantendo os IDs públicos do procedimento.
    return { skill, composition, aprendizados, rubrica: [...skill.rubrica, ...aprendizados.map(learning => ({ id: learning.id, severidade: learning.severidade ?? 'critico' as const, pergunta: `${learning.regra.replace(/[.?]$/, '')}?` }))] };
  }
  async distillLearning(motivo: string, template: TipoTemplate): Promise<string> {
    if (this.ai) return (await this.ai.json(this.ai.alvo('aprendizado', this.ai.config.FEEDBACK_MODEL), z.object({ regra: z.string().min(12) }), 'Transforme o motivo humano em uma regra imperativa, generalizável e acionável em PT-BR. Nunca inclua informações específicas da demanda.', JSON.stringify({ motivo, template }))).regra;
    const text = motivo.toLowerCase();
    if (/selo|sobrep|cobr|tamp/.test(text)) return 'Posicione selo e textos somente nas áreas reservadas do template, sem encobrir a região tratada.';
    if (/cor|contraste|escuro|leg[ií]vel/.test(text)) return 'Use a paleta do procedimento e contraste legível entre texto e fundo em todas as caixas do template.';
    if (/texto|grafia|portugu|headline/.test(text)) return 'Revise a grafia em português e mantenha headline e CTA completos dentro das caixas reservadas do template.';
    if (/foto|luz|[aâ]ngulo/.test(text)) return 'Mantenha o mesmo ângulo, enquadramento e iluminação nas fotos comparativas, com aspecto natural.';
    return `Antes de entregar este template, aplique a orientação visual: ${motivo.replace(/[\r\n]+/g, ' ').replace(/[.!?]+$/, '')}.`;
  }
  async appendLearning(input: AppendLearningInput): Promise<Learning> {
    // Validar os enums antes de interpolar qualquer caminho em disco.
    if (input.procedimento) ProcedimentoSchema.parse(input.procedimento);
    if (input.template) TipoTemplateSchema.parse(input.template);
    DemandaIdSchema.parse(input.demandaId);
    const work = this.appendQueue.then(async () => {
      const prefix = input.template ? 'L' : input.escopo?.startsWith('cliente:') ? 'C' : 'G';
      if (input.template && !input.procedimento) throw new Error('Aprendizado de template exige procedimento');
      const skillFile = input.template ? `skills/${input.procedimento}.skill.md` : `memory/${prefix === 'C' ? 'client_preferences' : 'global_learnings'}.md`;
      const path = join(this.directory, skillFile); const original = await readFile(path, 'utf8');
      if (!/^<!-- APPEND-ONLY:.*-->\r?$/m.test(original)) throw new Error('Marcador APPEND-ONLY ausente');
      const numbers = [...original.matchAll(new RegExp(`^### ${prefix}(\\d+) ·`, 'gm'))].map(match => Number(match[1]));
      const learning = LearningSchema.parse({ ...input, id: `${prefix}${String(Math.max(0, ...numbers) + 1).padStart(2, '0')}`, createdAt: this.clock.now().toISOString(), status: 'ativo', fonte: input.fonte ?? 'awr_humano' });
      const singleLine = (value: string) => value.replace(/[\r\n]+/g, ' ');
      const entry = `\n### ${learning.id} · ${learning.createdAt} · ${learning.template ?? `escopo: ${learning.escopo}`} · fonte: ${learning.fonte} · ${learning.demandaId}\n- **Regra:** ${singleLine(learning.regra)}\n- **Motivo original:** "${singleLine(learning.motivoOriginal)}"\n- **Status:** ativo\n`;
      const tmp = `${path}.${nanoid()}.tmp`; await writeFile(tmp, original + entry, 'utf8'); await rename(tmp, path);
      this.bus?.emit({ type: 'brain.learning', payload: { skillFile, learning } }); return learning;
    });
    this.appendQueue = work.catch(() => undefined); return work;
  }
}
