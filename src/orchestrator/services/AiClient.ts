import OpenAI, { toFile } from 'openai';
import { z } from 'zod';
import { zodTextFormat } from 'openai/helpers/zod';
import sharp from 'sharp';
import type { OrchestratorConfig } from '../../shared/types';
import type { EventBus } from '../core/EventBus';

/** Cliente só é construído nos modos explicitamente habilitados. Sem segredos no config. */
export class AiClient {
  private readonly client: OpenAI;
  private readonly hasKey: boolean;
  constructor(readonly config: OrchestratorConfig, private readonly bus: EventBus, apiKey?: string) {
    this.hasKey = Boolean(apiKey?.trim());
    this.client = new OpenAI({ apiKey: apiKey || 'missing-key', maxRetries: 0, timeout: 120000 });
  }
  async retry<T>(operation: () => Promise<T>, role: string): Promise<T> {
    if (!this.hasKey) { this.bus.log('error', 'Modo OpenAI exige OPENAI_API_KEY; nenhuma chamada foi feita'); throw new Error('OPENAI_API_KEY não configurada'); }
    for (let attempt = 0; attempt < 2; attempt++) {
      try { return await operation(); }
      catch { this.bus.log(attempt === 0 ? 'warn' : 'error', `Falha de IA em ${role}${attempt === 0 ? '; repetindo uma vez' : '; verifique credenciais, modelo e conectividade'}`); }
    }
    throw new Error(`Falha de IA em ${role} após duas tentativas`);
  }
  async json<T extends z.ZodType>(model: string, schema: T, system: string, prompt: string, image?: Buffer): Promise<z.infer<T>> {
    return this.retry(async () => {
      const response = await this.client.responses.parse({ model, instructions: system,
        input: [{ role: 'user', content: image ? [{ type: 'input_text', text: prompt }, { type: 'input_image', image_url: `data:image/png;base64,${image.toString('base64')}`, detail: 'high' }] : [{ type: 'input_text', text: prompt }] }],
        text: { format: zodTextFormat(schema, 'resultado') },
      });
      return schema.parse(response.output_parsed);
    }, model);
  }
  async photo(prompt: string, reference?: Buffer): Promise<Buffer> {
    return this.retry(async () => {
      // gpt-image-2 recebe dimensões múltiplas de 16; o compositor fixa o canvas final.
      const request = { model: this.config.IMAGE_MODEL, prompt, size: this.config.IMAGE_SIZE === '1080x1920' ? '1088x1920' : '1088x1360', output_format: 'png' as const, n: 1 };
      const response = reference
        ? await this.client.images.edit({ ...request, image: await toFile(await sharp(reference).png().toBuffer(), 'referencia.png', { type: 'image/png' }) })
        : await this.client.images.generate(request);
      const result = z.object({ data: z.array(z.object({ b64_json: z.string().min(16).regex(/^[A-Za-z0-9+/=\r\n]+$/) })).min(1) }).parse(response);
      const buffer = Buffer.from(result.data[0]!.b64_json, 'base64');
      const metadata = await sharp(buffer).metadata();
      if (!metadata.width || !metadata.height) throw new Error('Camada fotográfica inválida');
      return buffer;
    }, 'imagem');
  }
}
