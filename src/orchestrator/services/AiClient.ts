import OpenAI, { toFile } from 'openai';
import { z } from 'zod';
import { zodTextFormat } from 'openai/helpers/zod';
import sharp from 'sharp';
import { iaModelo } from '../../shared/types';
import type { IaSituacao, OrchestratorConfig } from '../../shared/types';
import type { IaRegistry } from './IaRegistry';
import type { EventBus } from '../core/EventBus';

/** Erro HTTP da OpenAI (status numérico). Outros erros não expõem a mensagem (podem trazer payload do fornecedor). */
const erroHttp = (error: unknown): { status: number; message: string } | null =>
  typeof error === 'object' && error !== null && typeof (error as { status?: unknown }).status === 'number' ? { status: (error as { status: number }).status, message: String((error as { message?: unknown }).message ?? '') } : null;
/** Motivo legível do erro da OpenAI, sem segredos (chaves mascaradas são removidas). */
function motivoErro(error: unknown): string {
  const http = erroHttp(error);
  if (!http) return '';
  const texto = http.message.startsWith(String(http.status)) ? http.message : `${http.status} ${http.message}`;
  // Nunca repassa fragmentos de chave (mesmo mascarados pela OpenAI).
  return texto.replace(/(provided:\s*)\S+/gi, '$1[oculta]').replace(/(sk|key)[-_][\w*-]+/g, '[chave]').trim().slice(0, 240);
}

/** Cliente só é construído nos modos explicitamente habilitados. Sem segredos no config. */
export class AiClient {
  private readonly client: OpenAI;
  private readonly hasKey: boolean;
  constructor(readonly config: OrchestratorConfig, private readonly bus: EventBus, apiKey?: string, private readonly ia?: IaRegistry) {
    this.hasKey = Boolean(apiKey?.trim());
    this.client = new OpenAI({ apiKey: apiKey || 'missing-key', maxRetries: 0, timeout: 120000 });
  }
  async retry<T>(operation: () => Promise<T>, role: string): Promise<T> {
    if (!this.hasKey) { this.bus.log('error', 'Modo OpenAI exige OPENAI_API_KEY; nenhuma chamada foi feita'); throw new Error('OPENAI_API_KEY não configurada'); }
    let motivo = '';
    for (let attempt = 0; attempt < 2; attempt++) {
      try { return await operation(); }
      catch (error) {
        motivo = motivoErro(error);
        this.bus.log(attempt === 0 ? 'warn' : 'error', `Falha de IA em ${role}${motivo ? ` (${motivo})` : ''}${attempt === 0 ? '; repetindo uma vez' : '; verifique credenciais, modelo e conectividade'}`);
        // Erros 4xx (modelo/tamanho inválido, moderação, cota) não melhoram com repetição.
        const status = erroHttp(error)?.status;
        if (status && status >= 400 && status < 500 && status !== 429) break;
      }
    }
    throw new Error(`Falha de IA em ${role}${motivo ? `: ${motivo}` : ' após duas tentativas'}`);
  }
  /** Modelo/esforço da situação conforme Configurações › Modelos de IA (default: env). */
  alvo(situacao: IaSituacao, fallback: string): { modelo: string; effort?: string } { return this.ia?.para(situacao) ?? { modelo: fallback }; }
  async json<T extends z.ZodType>(target: string | { modelo: string; effort?: string }, schema: T, system: string, prompt: string, image?: Buffer): Promise<z.infer<T>> {
    const { modelo: model, effort } = typeof target === 'string' ? { modelo: target, effort: undefined } : target;
    return this.retry(async () => {
      const response = await this.client.responses.parse({ model, instructions: system, ...(effort ? { reasoning: { effort: effort as 'high' } } : {}),
        input: [{ role: 'user', content: image ? [{ type: 'input_text', text: prompt }, { type: 'input_image', image_url: `data:image/png;base64,${image.toString('base64')}`, detail: 'high' }] : [{ type: 'input_text', text: prompt }] }],
        text: { format: zodTextFormat(schema, 'resultado') },
      });
      const parsed = schema.parse(response.output_parsed);
      await this.ia?.registrar({ modelo: model, tokensEntrada: response.usage?.input_tokens ?? 0, tokensSaida: response.usage?.output_tokens ?? 0 });
      return parsed;
    }, model);
  }
  /** Camada fotográfica. Custo = tokens de texto/imagem de entrada e de imagem gerada × tabela do catálogo. */
  async photo(prompt: string, reference?: Buffer | Buffer[], situacao: IaSituacao = 'imagem_van_gogh'): Promise<{ buffer: Buffer; modelo: string; qualidade: string | null; custo: { usd: number; tokensEntrada: number; tokensSaida: number } }> {
    const { modelo, effort } = this.alvo(situacao, this.config.IMAGE_MODEL);
    // Em imagem, o esforço escolhido vira a qualidade.
    const qualidades = ['low', 'medium', 'high', 'xhigh', 'max'] as const;
    const quality = qualidades.find(value => value === effort);
    return this.retry(async () => {
      // gpt-image-2 recebe dimensões múltiplas de 16; o compositor fixa o canvas final.
      const request = { model: modelo, prompt, ...(quality ? { quality } : {}), size: this.config.IMAGE_SIZE === '1080x1920' ? '1088x1920' : '1088x1360', output_format: 'png' as const, n: 1 };
      // Várias imagens de apoio (referências da marca) vão juntas no endpoint de edição.
      const apoio = reference === undefined ? [] : Array.isArray(reference) ? reference : [reference];
      const response = apoio.length
        ? await this.client.images.edit({ ...request, image: await Promise.all(apoio.map(async (buffer, i) => toFile(await sharp(buffer).png().toBuffer(), `referencia-${i + 1}.png`, { type: 'image/png' }))) })
        : await this.client.images.generate(request);
      const result = z.object({ data: z.array(z.object({ b64_json: z.string().min(16).regex(/^[A-Za-z0-9+/=\r\n]+$/) })).min(1) }).parse(response);
      const buffer = Buffer.from(result.data[0]!.b64_json, 'base64');
      const metadata = await sharp(buffer).metadata();
      if (!metadata.width || !metadata.height) throw new Error('Camada fotográfica inválida');
      const usage = response.usage; const preco = iaModelo(modelo);
      const texto = usage?.input_tokens_details?.text_tokens ?? usage?.input_tokens ?? 0; const imagemEntrada = usage?.input_tokens_details?.image_tokens ?? 0; const saida = usage?.output_tokens ?? 0;
      const usd = (texto * (preco?.precoEntrada ?? 0) + imagemEntrada * (preco?.precoImagemEntrada ?? 0) + saida * (preco?.precoSaida ?? 0)) / 1_000_000;
      const custo = { usd, tokensEntrada: usage?.input_tokens ?? 0, tokensSaida: saida };
      await this.ia?.registrar({ modelo, tokensEntrada: custo.tokensEntrada, tokensSaida: saida, usd });
      return { buffer, modelo, qualidade: quality ?? null, custo };
    }, 'imagem');
  }
}
