import { readFile, realpath, stat } from 'node:fs/promises';
import { isAbsolute, relative, resolve, sep } from 'node:path';
import { LearningSchema, PROCEDIMENTOS, RubricaItemSchema, SkillDetailSchema, skillPath } from '../shared/types';
import type { Procedimento, SkillDetail, SkillId } from '../shared/types';
import { ApiFailure } from './http';

function contido(raiz: string, destino: string): boolean {
  const caminho = relative(raiz, destino);
  return caminho !== '..' && !caminho.startsWith(`..${sep}`) && !isAbsolute(caminho);
}

export function decodePublicPath(raw: string): string {
  let caminho: string;
  try { caminho = decodeURIComponent(raw); }
  catch { throw new ApiFailure(400, 'VALIDATION_ERROR', 'Path com codificação inválida.'); }
  if (!caminho || /[\\\0:%]/.test(caminho) || caminho.startsWith('/')
    || caminho.split('/').some(segmento => segmento === '..' || segmento === '.' || segmento === '')) {
    throw new ApiFailure(400, 'VALIDATION_ERROR', 'Path inseguro.');
  }
  return caminho;
}

/** Resolve tanto a raiz quanto o arquivo para barrar symlinks/junctions externos. */
export async function readContainedFile(raiz: string, caminho: string): Promise<Buffer> {
  try {
    const raizReal = await realpath(raiz);
    const destino = resolve(raizReal, caminho);
    if (!contido(raizReal, destino)) throw new ApiFailure(400, 'VALIDATION_ERROR', 'Path fora da raiz.');
    const destinoReal = await realpath(destino);
    if (!contido(raizReal, destinoReal)) throw new ApiFailure(400, 'VALIDATION_ERROR', 'Path fora da raiz.');
    if (!(await stat(destinoReal)).isFile()) throw new ApiFailure(404, 'NOT_FOUND', 'Arquivo não encontrado.');
    return await readFile(destinoReal);
  } catch (error) {
    if (error instanceof Error && 'code' in error && ['ENOENT', 'ENOTDIR', 'ELOOP'].includes(String(error.code))) {
      throw new ApiFailure(404, 'NOT_FOUND', 'Arquivo não encontrado.');
    }
    throw error;
  }
}

export async function readSkill(brainDir: string, id: SkillId): Promise<SkillDetail> {
  const conteudo = (await readContainedFile(resolve(brainDir), skillPath(id))).toString('utf8');
  const texto = conteudo.replace(/\r\n/g, '\n');
  const frontMatter = /^---\n([\s\S]*?)\n---(?:\n|$)/.exec(texto)?.[1];
  if (!frontMatter) throw new Error('Front-matter de skill ausente');
  const campos = Object.fromEntries(frontMatter.split('\n').flatMap(linha => {
    const campo = /^([\w_]+):\s*(.*?)\s*$/.exec(linha);
    if (!campo) return [];
    return [[campo[1], campo[2]?.replace(/^(['"])(.*)\1$/, '$2')]];
  }));
  const rubricaTexto = /^## 5\.[^\n]*\n([\s\S]*?)(?=^## |$(?![\s\S]))/m.exec(texto)?.[1] ?? '';
  const rubrica = [...rubricaTexto.matchAll(/^- \[([RMT]\d{2,})\]\[(critico|normal)\] (.+)$/gm)]
    .map(item => RubricaItemSchema.parse({ id: item[1], severidade: item[2], pergunta: item[3] }));
  const log = /^## Self-Improvement Log\s*\n([\s\S]*)/m.exec(texto)?.[1] ?? '';
  const aprendizados = [...log.matchAll(/^### ([LGC]\d{2,}) · ([^\n]+)\n([\s\S]*?)(?=^### |$(?![\s\S]))/gm)].map(entrada => {
    const partes = entrada[2]?.split(' · ').map(parte => parte.trim()) ?? [];
    const [data, alvo, fonte, demanda] = partes;
    const corpo = entrada[3] ?? '';
    const campo = (nome: string) => new RegExp(`^- \\*\\*${nome}:\\*\\* (.+)$`, 'm').exec(corpo)?.[1]?.trim();
    const motivo = campo('Motivo original');
    return LearningSchema.parse({
      id: entrada[1], createdAt: new Date(data ?? '').toISOString(),
      ...((PROCEDIMENTOS as readonly string[]).includes(id) ? { procedimento: id as Procedimento } : {}),
      ...(alvo?.startsWith('escopo:') ? { escopo: alvo.slice(7).trim() } : { template: alvo }),
      fonte: fonte?.replace(/^fonte:\s*/, ''),
      ...(demanda && demanda !== '—' ? { demandaId: demanda } : {}),
      regra: campo('Regra'), motivoOriginal: motivo?.replace(/^"([\s\S]*)"$/, '$1'), status: campo('Status'),
      ...(campo('Severidade') ? { severidade: campo('Severidade') } : {}),
    });
  });
  return SkillDetailSchema.parse({
    id, label: campos.label, skillFile: skillPath(id),
    ...((PROCEDIMENTOS as readonly string[]).includes(id) ? { procedimento: id as Procedimento } : {}),
    versao: Number(campos.versao), atualizadoEm: campos.atualizado_em, conteudo, rubrica, aprendizados,
  });
}
