import { logosElegiveis } from '../../shared/logos';
import type { Empresa } from '../../shared/types';
import sharp from 'sharp';
import type { OverlayOptions } from 'sharp';
import { ArteMetaSchema } from '../../shared/types';
import { IA_EFFORT_API, iaModeloLabel } from '../../shared/types';
import type { ArteMeta, Demanda, EtapaProducao, FeedbackDiretor, OrchestratorConfig } from '../../shared/types';
import { OrchestratorError } from '../core/errors';
import type { IaRegistry } from './IaRegistry';
import { composicaoPara, montarPrompt, selecionarReferencias, textosExatos } from './arteFinal';
import { prepararLogo } from './logoCompositor';
import type { LogosMarca } from './logoCompositor';
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
export type OnEtapa = (etapa: EtapaProducao, detalhe?: string) => Promise<void>;
export interface ImagemGerada { modelo: string; qualidade: string | null; custo?: { usd: number; tokensEntrada: number; tokensSaida: number } }

export class ImageEngine {
  constructor(private readonly config: OrchestratorConfig, private readonly storage: AcervoStorage, private readonly brain: BrainLoader, private readonly clock: Clock, private readonly ai?: AiClient, private readonly ia?: Pick<IaRegistry, 'modelos'>) {}
  get usdBrl(): number { return this.config.USD_BRL; }
  /** Modelo de imagem da situação (Configurações › Modelos de IA). Sem registro: segue IMAGE_ENGINE_MODE. */
  modeloImagem(criador: 'van_gogh' | 'monalisa'): { modelo: string; qualidade: string | null } {
    const escolha = this.ia?.modelos()[criador === 'monalisa' ? 'imagem_monalisa' : 'imagem_van_gogh'];
    if (!escolha) return { modelo: this.config.IMAGE_ENGINE_MODE === 'openai' ? this.config.IMAGE_MODEL : 'simulado', qualidade: null };
    return { modelo: escolha.modelo, qualidade: escolha.effort ? IA_EFFORT_API[escolha.effort] : null };
  }
  async generate(demanda: Demanda, versao: number, feedback?: FeedbackDiretor, onEtapa: OnEtapa = async () => {}): Promise<{ path: string; meta: ArteMeta; imagem: ImagemGerada }> {
    const classification = demanda.classificacao;
    if (!classification || !demanda.criadorAtual) throw new Error('Demanda sem classificação/criador');
    const escolhido = this.modeloImagem(demanda.criadorAtual);
    const real = escolhido.modelo !== 'simulado';
    if (real && !this.ai) throw new OrchestratorError('VALIDATION_ERROR', 'Geração real exige OPENAI_API_KEY no .env (ou escolha "Simulado" nas Configurações).', 400);
    // Van Gogh com modelo real: arte final completa por IA (técnica arte_final_ia), sem camada SVG.
    if (real && this.ai && demanda.criadorAtual === 'van_gogh') return this.gerarArteFinal(demanda, versao, feedback, onEtapa, this.ai);
    await onEtapa('planejando', `Montando o prompt com a skill, o template e ${feedback ? 'o feedback do Diretor' : 'o briefing'}`);
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
    let imagem: ImagemGerada = { modelo: 'simulado', qualidade: null };
    const references = (await this.storage.list('_references/')).filter(path => new RegExp(`^_references/${procedimento}__${tipoTemplate}\\.(png|jpg)$`).test(path));
    if (real && this.ai) {
      const reference = feedback && demanda.stagingPath ? await this.storage.read(demanda.stagingPath) : references[0] ? await this.storage.read(references[0]) : undefined;
      await onEtapa('gerando', `${iaModeloLabel(escolhido.modelo)}${escolhido.qualidade ? ` · qualidade ${escolhido.qualidade}` : ''}${reference ? ' · com imagem de referência' : ''}`);
      const result = await this.ai.photo(promptUsado, reference, demanda.criadorAtual === 'monalisa' ? 'imagem_monalisa' : 'imagem_van_gogh');
      photo = result.buffer; imagem = { modelo: result.modelo, qualidade: result.qualidade, custo: result.custo };
    } else await onEtapa('gerando', 'Simulado · camada ilustrativa local, sem custo');
    await onEtapa('compondo', 'Aplicando textos, logo, selo, CTA e disclaimer sobre a imagem');
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
      engine: photo ? 'openai' : 'mock', modeloImagem: imagem.modelo, promptUsado, textos: { headline, cta, disclaimer: context.skill.disclaimer },
      aprendizadosAplicados: context.aprendizados.map(learning => learning.id), ajustesCompliance, ilustrativo: true, geradoEm: this.clock.now().toISOString(),
      ...(demanda.criadorAtual === 'monalisa' ? { coerenciaColecao: { referenciasConsideradas: [...collectionMetas.map(meta => `${procedimento}/${procedimento}__${meta.tipoTemplate}__${meta.demandaId}.png`), ...references], headlinesEvitadas: avoidedHeadlines } } : {}),
    });
    await this.storage.write(path, png); await this.storage.write(metaPath(path), Buffer.from(JSON.stringify(meta, null, 2)));
    return { path, meta, imagem };
  }

  /** Arte final por IA: marca + procedimento + técnica + referências → imagem completa → logo oficial aplicado. */
  private async gerarArteFinal(demanda: Demanda, versao: number, feedback: FeedbackDiretor | undefined, onEtapa: OnEtapa, ai: AiClient): Promise<{ path: string; meta: ArteMeta; imagem: ImagemGerada }> {
    const { procedimento, tipoTemplate } = demanda.classificacao!;
    const composicao = composicaoPara(procedimento, tipoTemplate);
    if (!composicao) throw new OrchestratorError('VALIDATION_ERROR', 'Antes e depois exige fotos reais do cliente: a arte final por IA não gera pacientes (CFM/Meta). Use banco de imagem ou envie as fotos.', 400);
    const { empresa, marca: marcaDetectada } = await this.brain.marcaDaDemanda(`${demanda.clinicaNome ?? ''} ${demanda.briefing}`);
    const context = await this.brain.context(procedimento, tipoTemplate, demanda.clinicaNome, { marcaId: marcaDetectada?.id ?? null });
    const { skill, marca, tecnica } = context;
    if (!tecnica) throw new Error('Skill de técnica arte_final_ia ausente');
    const referencias = marca ? selecionarReferencias(marca.referencias, procedimento, composicao) : [];
    await onEtapa('planejando', `${marca ? `Marca ${marca.label}` : 'Sem skill de marca'} · composição ${composicao} · ${referencias.length} referência(s)${feedback ? ' · ajuste do Diretor' : ''}`);
    const ctaPadrao = /\*\*CTA\*\*[^\n]*?:\s*"([^"]+)"/.exec(skill.templates[tipoTemplate] ?? '')?.[1] ?? 'Agende sua avaliação';
    const textos = textosExatos(demanda, skill.label, ctaPadrao);
    const agente = await this.brain.loadAgent('van_gogh');
    const promptUsado = montarPrompt({ agente: agente.systemPrompt, tecnica, marca, skill, composicao, textos, referencias, briefing: demanda.briefing, feedback, aprendizados: context.aprendizados,
      ocultar: empresa ? [empresa.nome, ...empresa.aliases, ...empresa.unidades.flatMap(u => [u.nome, ...u.aliases]), ...(demanda.clinicaNome ? [demanda.clinicaNome] : [])] : demanda.clinicaNome ? [demanda.clinicaNome] : [] });
    // Referências reduzidas (menos tokens de imagem); em ajuste, a versão anterior vai primeiro para ser editada.
    const reduzir = async (buffer: Buffer) => sharp(buffer).resize(640, 800, { fit: 'inside' }).jpeg({ quality: 82 }).toBuffer();
    // Referência ausente no acervo não bloqueia a geração (o índice pode estar à frente dos arquivos).
    const lidas = await Promise.all([...(feedback && demanda.stagingPath ? [demanda.stagingPath] : []), ...referencias.map(ref => ref.arquivo)].map(async path => { try { return await reduzir(await this.storage.read(path)); } catch { return null; } }));
    const apoio = lidas.flatMap(buffer => (buffer ? [buffer] : []));
    await onEtapa('gerando', `${iaModeloLabel(this.modeloImagem('van_gogh').modelo)} · arte completa${apoio.length ? ` · ${apoio.length} imagem(ns) de apoio` : ''}`);
    const result = await ai.photo(promptUsado, apoio.length ? apoio : undefined, 'imagem_van_gogh');
    await onEtapa('compondo', 'Ajustando para 1080×1350 e aplicando o logo oficial da marca');
    const height = this.config.IMAGE_SIZE === '1080x1920' ? 1920 : 1350;
    let png: Buffer = await sharp(result.buffer).resize(1080, height, { fit: 'cover' }).png().toBuffer();
    const ajustesCompliance: string[] = [];
    const logos = await this.logosDa(empresa);
    const preparado = await prepararLogo(png, logos);
    png = preparado.buffer; const logo = preparado.logo;
    if (!preparado.marcador) ajustesCompliance.push('A IA não desenhou o marcador do logo; posição escolhida pela zona mais limpa da arte.');
    if (!logo) ajustesCompliance.push(`Logo oficial não cadastrado para ${empresa?.nome ?? 'a empresa'}: cadastre os PNGs em Empresas (fundo claro/escuro).`);
    const arquivoLogo = logo ? (logo.variante === 'principal' ? empresa?.logo : empresa?.logos[logo.variante]) ?? '' : '';
    const path = `_staging/${demanda.id}__v${versao}.png`;
    const meta = ArteMetaSchema.parse({ demandaId: demanda.id, versao, procedimento, tipoTemplate, ator: 'van_gogh', origem: demanda.origem,
      engine: 'openai', modeloImagem: result.modelo, promptUsado, textos: { headline: textos.titulo, cta: textos.cta, disclaimer: skill.disclaimer },
      aprendizadosAplicados: context.aprendizados.map(learning => learning.id), ajustesCompliance, ilustrativo: true, geradoEm: this.clock.now().toISOString(),
      arteFinal: { marca: marca?.id ?? null, composicao, referencias: referencias.map(ref => ref.arquivo), textosExatos: [textos.titulo, ...textos.literais, ...textos.oferta, textos.cta], logo: logo ? { posicao: logo.posicao, variante: logo.variante, arquivo: arquivoLogo } : null },
    });
    await this.storage.write(path, png); await this.storage.write(metaPath(path), Buffer.from(JSON.stringify(meta, null, 2)));
    return { path, meta, imagem: { modelo: result.modelo, qualidade: result.qualidade, custo: result.custo } };
  }
  /** PNGs oficiais da empresa (variantes claro/escuro; logo principal como reserva). */
  private async logosDa(empresa: Empresa | null): Promise<LogosMarca> {
    if (!empresa) return {};
    const ler = async (path: string | null) => { if (!path) return undefined; try { return await this.storage.read(path); } catch { return undefined; } };
    const escolher = async (fundo: 'claro' | 'escuro') => {
      const paths = logosElegiveis(empresa, fundo);
      const inicio = Math.floor(Math.random() * paths.length);
      for (let i = 0; i < paths.length; i++) {
        const logo = await ler(paths[(inicio + i) % paths.length]!);
        if (logo) return logo;
      }
      return undefined;
    };
    const [claro, escuro, principal] = await Promise.all([escolher('claro'), escolher('escuro'), ler(empresa.logo)]);
    return { ...(claro ? { claro } : {}), ...(escuro ? { escuro } : {}), ...(principal ? { principal } : {}) };
  }
}
