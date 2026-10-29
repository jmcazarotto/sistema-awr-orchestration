import sharp from 'sharp';
import type { OverlayOptions } from 'sharp';
import { ArteMetaSchema } from '../../shared/types';
import type { ArteMeta, Demanda, FeedbackDiretor, OrchestratorConfig } from '../../shared/types';
import type { AcervoStorage, Clock } from '../core/interfaces';
import type { BrainLoader } from '../brain/BrainLoader';
import type { AiClient } from './AiClient';
import { geometry } from './templateGeometry';
import type { Box } from './templateGeometry';

export const metaPath = (path: string): string => path.replace(/\.png$/, '.meta.json');
export function escapeXml(text: string): string { return text.replace(/[<>&"']/g, char => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' })[char]!); }
function widthUnits(text: string): number { return [...text].reduce((sum, char) => sum + (/[MW@%]/.test(char) ? 0.95 : /[ilI.,:! ']/.test(char) ? 0.32 : /[A-ZÁÉÍÓÚ]/.test(char) ? 0.73 : 0.61), 0); }
export function wrapText(text: string, maxWidth: number, size: number, maxLines: number): string[] {
  const words = text.replace(/\s+/g, ' ').trim().split(' '); const lines: string[] = []; let line = '';
  for (const word of words) {
    if (widthUnits(`${line} ${word}`.trim()) * size > maxWidth && line) { lines.push(line); line = ''; }
    if (widthUnits(word) * size > maxWidth) {
      for (const char of word) { if (widthUnits(line + char) * size > maxWidth) { lines.push(line); line = ''; } line += char; }
    } else line = line ? `${line} ${word}` : word;
  }
  if (line) lines.push(line);
  if (lines.length > maxLines) { lines.length = maxLines; let last = lines[maxLines - 1] ?? ''; while (widthUnits(last + '…') * size > maxWidth) last = last.slice(0, -1); lines[maxLines - 1] = `${last}…`; }
  return lines;
}
function textSvg(text: string, box: Box, size: number, color: string, maxLines: number, centered = false, weight = 500): string {
  const lines = wrapText(text, box.w - (centered ? 24 : 0), size, maxLines);
  const x = centered ? box.x + box.w / 2 : box.x;
  const y = centered ? box.y + (box.h - lines.length * size * 1.15) / 2 + size * 0.85 : box.y + size;
  return `<text x="${x}" y="${y}" font-family="${weight >= 700 ? 'Manrope' : 'Inter'}, Arial, sans-serif" font-size="${size}" font-weight="${weight}" fill="${color}"${centered ? ' text-anchor="middle"' : ''}>${lines.map((line, i) => `<tspan x="${x}" dy="${i ? size * 1.15 : 0}">${escapeXml(line)}</tspan>`).join('')}</text>`;
}
function rect(box: Box, fill: string, radius = 0): string { return `<rect x="${box.x}" y="${box.y}" width="${box.w}" height="${box.h}" rx="${radius}" fill="${fill}"/>`; }
function placeholder(box: Box, color: string, name: string, feedback: boolean): string {
  const faceHeight = Math.min(box.h * 0.55, 370); const faceY = Math.min(box.h * 0.4, 390);
  return `<svg x="${box.x}" y="${box.y}" width="${box.w}" height="${box.h}" viewBox="0 0 ${box.w} ${box.h}"><defs><linearGradient id="${name}" x2="1" y2="1"><stop stop-color="${color}"/><stop offset="1" stop-color="#fbf5f2"/></linearGradient></defs><rect width="100%" height="100%" fill="url(#${name})"/><ellipse cx="${box.w / 2}" cy="${faceY + faceHeight * 1.1}" rx="${Math.min(box.w * 0.38, 220)}" ry="${faceHeight * 0.75}" fill="#101a32" opacity=".16"/><ellipse cx="${box.w / 2}" cy="${faceY}" rx="${faceHeight * 0.34}" ry="${faceHeight * 0.5}" fill="#d9b4a1"/><path d="M ${box.w / 2 - 34} ${faceY + 36} Q ${box.w / 2} ${faceY + 54} ${box.w / 2 + 34} ${faceY + 36}" stroke="#8c3b4a" stroke-width="5" fill="none"/><circle cx="${box.w / 2 - 35}" cy="${faceY - 22}" r="4" fill="#2f4858"/><circle cx="${box.w / 2 + 35}" cy="${faceY - 22}" r="4" fill="#2f4858"/>${feedback ? '<circle cx="28" cy="28" r="12" fill="#b6e77a"/>' : ''}</svg>`;
}
export class ImageEngine {
  constructor(private readonly config: OrchestratorConfig, private readonly storage: AcervoStorage, private readonly brain: BrainLoader, private readonly clock: Clock, private readonly ai?: AiClient) {}
  async generate(demanda: Demanda, versao: number, feedback?: FeedbackDiretor): Promise<{ path: string; meta: ArteMeta }> {
    const classification = demanda.classificacao;
    if (!classification || !demanda.criadorAtual) throw new Error('Demanda sem classificação/criador');
    const { procedimento, tipoTemplate } = classification;
    const context = await this.brain.context(procedimento, tipoTemplate, demanda.clinicaNome);
    const agent = await this.brain.loadAgent(demanda.criadorAtual);
    const height = this.config.IMAGE_SIZE === '1080x1920' ? 1920 : 1350;
    const boxes = geometry(tipoTemplate, height === 1920);
    const template = context.skill.templates[tipoTemplate] ?? '';
    const defaultHeadline = /Exemplo:\s*"([^"]+)"/.exec(template)?.[1] ?? 'Cuidado com avaliação individual';
    const defaultCta = /\*\*CTA\*\*[^\n]*?:\s*"([^"]+)"/.exec(template)?.[1] ?? 'Agende sua avaliação';
    const collection = demanda.criadorAtual === 'monalisa' ? (await this.storage.list(`${procedimento}/`)).filter(path => path.endsWith('.meta.json')) : [];
    const collectionMetas = await Promise.all(collection.map(async path => ArteMetaSchema.parse(JSON.parse((await this.storage.read(path)).toString('utf8')))));
    const avoidedHeadlines = collectionMetas.map(meta => meta.textos.headline); const avoidedCtas = collectionMetas.map(meta => meta.textos.cta);
    const ajustesCompliance: string[] = [];
    const bannedTerms = [...(/\*\*Termos e afirmações PROIBIDOS[^\n]*\*\*([^\n]+)/.exec(context.skill.conteudo)?.[1] ?? '').matchAll(/"([^"]+)"/g)].map(match => match[1]!.toLowerCase());
    const safe = (value: string, fallback: string): string => {
      if (bannedTerms.some(term => value.toLowerCase().includes(term)) || /R\$|\d+\s*(ml|unidades)|garant|100%|lifting|\b(before|after|book now)\b/i.test(value)) { ajustesCompliance.push(`Texto substituído por alternativa da Skill: ${value}`); return fallback; }
      return value;
    };
    if (bannedTerms.some(term => demanda.briefing.toLowerCase().includes(term))) ajustesCompliance.push('O briefing contém termos proibidos pela Skill; a cópia foi limitada às alternativas permitidas.');
    let headline = safe(demanda.headline ?? defaultHeadline, defaultHeadline);
    let cta = safe(demanda.cta ?? defaultCta, defaultCta);
    if (demanda.criadorAtual === 'monalisa') {
      const options = [defaultHeadline, 'Cuidado e naturalidade com avaliação individual', 'Informação e segurança para a sua escolha', 'Conheça o procedimento e suas indicações', 'Avaliação profissional para cuidar de você'];
      headline = options.find(value => !avoidedHeadlines.includes(value)) ?? `Cuidado individual: ${demanda.id}`;
      cta = [defaultCta, 'Conheça o procedimento', 'Saiba mais sobre o cuidado', 'Converse com a equipe'].find(value => !avoidedCtas.includes(value)) ?? defaultCta;
    }
    // Em ajustes, a cópia aprovada é preservada até que o feedback solicite alteração textual.
    if (feedback && demanda.stagingPath && !/texto|headline|cta|grafia|portugu/i.test(feedback.resumo + feedback.correcoes.map(item => item.instrucao).join(' '))) {
      const previous = ArteMetaSchema.parse(JSON.parse((await this.storage.read(metaPath(demanda.stagingPath))).toString('utf8')));
      headline = previous.textos.headline; cta = previous.textos.cta;
    }
    const headlineLimit = tipoTemplate.startsWith('antes') ? 52 : tipoTemplate === 'banco_imagem_1' ? 56 : 64;
    const limit = (text: string, max: number): string => text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`;
    headline = limit(headline, headlineLimit); cta = limit(cta, tipoTemplate.startsWith('antes') ? 28 : 26);
    headline = wrapText(headline, boxes.headline!.w, tipoTemplate === 'banco_imagem_1' ? 72 : 56, tipoTemplate.startsWith('antes') ? 2 : 3).join(' ');
    cta = wrapText(cta, boxes.cta!.w - 24, 30, 1).join(' ');
    const clinica = demanda.origem === 'acervo' ? '' : demanda.clinicaNome ?? '';
    const values: Record<string, string> = {
      procedimento_label: context.skill.label, template_id: tipoTemplate, template_descricao: template,
      headline, cta, clinica_nome: clinica, briefing_cliente: demanda.briefing,
      feedback_ajuste: feedback ? `${feedback.resumo}\n${feedback.correcoes.map((item, i) => `${i + 1}. [${item.itemId}] ${item.instrucao}`).join('\n')}` : '',
      aprendizados: context.aprendizados.map(learning => `[${learning.id}] ${learning.regra}`).join('\n'),
    };
    const promptUsado = agent.systemPrompt + '\n\n' + context.skill.promptBase.replace(/\{\{(\w+)\}\}/g, (_, key: string) => values[key] ?? '') + `\nMANDATORY: ONLY photographic layer. NO text, logo, seal or UI. Canvas geometry: ${JSON.stringify(geometry(tipoTemplate, this.config.IMAGE_SIZE === '1080x1920'))}`;
    let photo: Buffer | undefined;
    const references = (await this.storage.list('_references/')).filter(path => new RegExp(`^_references/${procedimento}__${tipoTemplate}\\.(png|jpg)$`).test(path));
    if (this.config.IMAGE_ENGINE_MODE === 'openai') {
      if (!this.ai) throw new Error('ImageEngine OpenAI não configurado');
      const reference = feedback && demanda.stagingPath ? await this.storage.read(demanda.stagingPath) : references[0] ? await this.storage.read(references[0]) : undefined;
      photo = await this.ai.photo(promptUsado, reference, demanda.criadorAtual === 'monalisa' ? 'imagem_monalisa' : 'imagem_van_gogh');
    }
    const palette = context.skill.palette; const background = procedimento === 'preenchimento_labial' ? '#FBF5F2' : procedimento === 'botox' ? '#EAF0F2' : '#E9DCC9';
    const svg: string[] = [rect({ x: 0, y: 0, w: 1080, h: height }, background)];
    const composites: OverlayOptions[] = [];
    if (photo) {
      const full = await sharp(photo).resize(1080, height, { fit: 'fill' }).png().toBuffer();
      for (const [name, box] of Object.entries(boxes)) if (name.startsWith('photo_')) composites.push({ input: await sharp(full).extract({ left: box.x, top: box.y, width: box.w, height: box.h }).toBuffer(), left: box.x, top: box.y });
    } else {
      for (const [name, box] of Object.entries(boxes)) if (name.startsWith('photo_')) svg.push(placeholder(box, palette[0] ?? background, name, Boolean(feedback)));
    }
    const overlay: string[] = [];
    if (boxes.panel_texto) overlay.push(rect(boxes.panel_texto, background));
    if (boxes.overlay_gradient) overlay.push('<defs><linearGradient id="overlay" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#101a32" stop-opacity="0"/><stop offset=".15" stop-color="#101a32" stop-opacity=".85"/><stop offset="1" stop-color="#101a32" stop-opacity=".85"/></linearGradient></defs>', rect(boxes.overlay_gradient, 'url(#overlay)'));
    const lightText = tipoTemplate === 'banco_imagem_1' ? '#FFFFFF' : '#101a32';
    for (const name of ['label_antes', 'label_depois']) if (boxes[name]) overlay.push(rect(boxes[name], '#101a32', 12), textSvg(name.endsWith('antes') ? 'ANTES' : 'DEPOIS', boxes[name], 24, '#FFFFFF', 1, true, 800));
    overlay.push(rect(boxes.logo!, '#FFFFFF', 10), textSvg('AWR', boxes.logo!, 32, '#101a32', 1, true, 800));
    overlay.push(rect(boxes.selo!, '#FFFFFF', 10), textSvg('Profissional habilitado', boxes.selo!, 18, '#101a32', 1, true, 700));
    overlay.push(textSvg(headline, boxes.headline!, tipoTemplate === 'banco_imagem_1' ? 72 : 56, lightText, tipoTemplate.startsWith('antes') ? 2 : 3, false, 800));
    overlay.push(rect(boxes.cta!, '#b6e77a', 12), textSvg(cta, boxes.cta!, 30, '#101a32', 1, true, 700));
    // 24 px satisfaz o mínimo de 22 e a rubrica transversal (não menor que o rodapé).
    overlay.push(textSvg(context.skill.disclaimer, boxes.disclaimer!, 24, lightText, 2));
    overlay.push(textSvg(clinica || 'AWR • Cuidado com avaliação individual', boxes.rodape!, 24, lightText, 1));
    const document = (body: string) => Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="${height}">${body}</svg>`);
    const base = await sharp(document(svg.join(''))).png().toBuffer();
    const png = await sharp(base).composite([...composites, { input: document(overlay.join('')), left: 0, top: 0 }]).png().toBuffer();
    const path = `_staging/${demanda.id}__v${versao}.png`;
    const meta = ArteMetaSchema.parse({ demandaId: demanda.id, versao, procedimento, tipoTemplate, ator: demanda.criadorAtual, origem: demanda.origem,
      engine: this.config.IMAGE_ENGINE_MODE, promptUsado, textos: { headline, cta, disclaimer: context.skill.disclaimer },
      aprendizadosAplicados: context.aprendizados.map(learning => learning.id), ajustesCompliance, ilustrativo: true, geradoEm: this.clock.now().toISOString(),
      ...(demanda.criadorAtual === 'monalisa' ? { coerenciaColecao: { referenciasConsideradas: [...collectionMetas.map(meta => `${procedimento}/${procedimento}__${meta.tipoTemplate}__${meta.demandaId}.png`), ...references], headlinesEvitadas: avoidedHeadlines } } : {}),
    });
    await this.storage.write(path, png); await this.storage.write(metaPath(path), Buffer.from(JSON.stringify(meta, null, 2)));
    return { path, meta };
  }
}
