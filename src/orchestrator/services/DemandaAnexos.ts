import sharp from 'sharp';
import type { OutputInfo } from 'sharp';
import { nanoid } from 'nanoid';
import { AnexoDemandaSchema, AnexoIdSchema, PapelAnexoSchema } from '../../shared/types';
import type { AnexoDemanda, PapelAnexo } from '../../shared/types';
import type { AcervoStorage } from '../core/interfaces';
import { OrchestratorError } from '../core/errors';

export class DemandaAnexos {
  constructor(private readonly storage: AcervoStorage) {}
  async upload(arquivo: { nome: string; dados: Buffer }, papel: PapelAnexo): Promise<AnexoDemanda> {
    PapelAnexoSchema.parse(papel);
    if (!arquivo.dados.length || arquivo.dados.length > 10 * 1024 * 1024) throw new OrchestratorError('VALIDATION_ERROR', 'Cada imagem deve ter até 10 MB.', 400);
    let imagem: { data: Buffer; info: OutputInfo };
    try {
      const source = sharp(arquivo.dados, { limitInputPixels: 40_000_000 });
      const meta = await source.metadata();
      if (!['png', 'jpeg', 'webp'].includes(meta.format ?? '') || (meta.pages ?? 1) > 1) throw new Error('Formato inválido');
      // Orientação EXIF normalizada, sem filtros, sem redimensionar e sem metadados pessoais.
      imagem = await source.rotate().png().toBuffer({ resolveWithObject: true });
    } catch { throw new OrchestratorError('VALIDATION_ERROR', 'Envie uma imagem PNG, JPG ou WebP válida, não animada, de até 40 megapixels.', 400); }
    const id = `anx_${nanoid()}`;
    const anexo = AnexoDemandaSchema.parse({ id, papel, nome: arquivo.nome.split(/[\\/]/).pop()?.slice(0, 255) || 'imagem.png', arquivo: `_demandas/${id}/imagem.png`, largura: imagem.info.width, altura: imagem.info.height });
    await this.storage.write(anexo.arquivo, imagem.data);
    await this.storage.write(`_demandas/${id}/anexo.json`, Buffer.from(JSON.stringify(anexo)));
    return anexo;
  }
  async resolve(ids: string[] = []): Promise<AnexoDemanda[]> {
    const anexos = await Promise.all(ids.map(async id => {
      AnexoIdSchema.parse(id);
      try {
        const anexo = AnexoDemandaSchema.parse(JSON.parse((await this.storage.read(`_demandas/${id}/anexo.json`)).toString('utf8')));
        if (anexo.id !== id || anexo.arquivo !== `_demandas/${id}/imagem.png`) throw new Error('ID incompatível');
        await this.storage.read(anexo.arquivo);
        return anexo;
      } catch { throw new OrchestratorError('VALIDATION_ERROR', `Anexo ${id} não encontrado. Envie o arquivo antes de criar a demanda.`, 400); }
    }));
    const count = (papel: PapelAnexo) => anexos.filter(a => a.papel === papel).length;
    if (count('antes') > 1 || count('depois') > 1 || count('referencia') > 8) throw new OrchestratorError('VALIDATION_ERROR', 'Use uma foto de antes, uma de depois e até 8 referências.', 400);
    if (count('antes') !== count('depois')) throw new OrchestratorError('VALIDATION_ERROR', 'Envie as duas fotos: antes e depois.', 400);
    return anexos;
  }
}
