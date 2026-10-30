import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { apagarRegioesFotograficas, RegioesFotograficasSchema } from './referenciaLayout';

describe('referência de layout sem pacientes', () => {
  it('remove apenas as áreas indicadas antes de enviar à IA e preserva o restante do layout', async () => {
    const original = await sharp({ create: { width: 1000, height: 1000, channels: 3, background: '#aa3322' } }).png().toBuffer();
    const clean = await apagarRegioesFotograficas(original, [{ x: 0, y: 0, largura: 500, altura: 600 }]);
    const pixel = async (x: number, y: number) => [...await sharp(clean).extract({ left: x, top: y, width: 1, height: 1 }).removeAlpha().raw().toBuffer()];
    expect(await pixel(200, 300)).toEqual([216, 216, 216]);
    expect(await pixel(501, 601)).toEqual([216, 216, 216]);
    expect(await pixel(800, 800)).toEqual([170, 51, 34]);
    expect(await apagarRegioesFotograficas(original, [])).toEqual(original);
    expect(RegioesFotograficasSchema.safeParse({ regioes: [{ x: 900, y: 0, largura: 200, altura: 600 }] }).success).toBe(false);
  });
});
