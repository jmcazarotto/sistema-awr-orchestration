import { expect, it } from 'vitest';
import sharp from 'sharp';
import { fixture } from './test-support';

it('API: upload multipart, criação por IDs e validação de anexos', async () => {
  const f = await fixture();
  try {
    const png = await sharp({ create: { width: 40, height: 30, channels: 3, background: '#aaa' } }).png().toBuffer();
    const upload = async (papel: string, dados = png) => {
      const form = new FormData(); form.set('arquivo', new File([new Uint8Array(dados)], 'foto.png', { type: 'image/png' })); form.set('papel', papel);
      return f.app.request('/api/demandas/anexos', { method: 'POST', body: form });
    };
    const antesResponse = await upload('antes'); expect(antesResponse.status).toBe(201);
    const antes = (await antesResponse.json()).anexo;
    const depois = (await (await upload('depois')).json()).anexo;
    const create = (anexos: unknown[]) => f.app.request('/api/demandas', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ briefing: 'Royal Face antes e depois', anexos }) });
    expect((await create([antes.id])).status).toBe(400);
    expect((await create([antes.id, antes.id])).status).toBe(400);
    expect((await create(['../segredo'])).status).toBe(400);
    expect((await create(['anx_000000000000000000000'])).status).toBe(400);
    const response = await create([antes.id, depois.id]); expect(response.status).toBe(201);
    expect((await response.json()).demanda.anexos).toEqual([antes, depois]);
    expect((await upload('qualquer')).status).toBe(400);
    expect((await upload('referencia', Buffer.from('not an image'))).status).toBe(400);
    expect((await f.app.request(`/acervo/${antes.arquivo}`)).status).toBe(200);
  } finally { await f.cleanup(); }
});
