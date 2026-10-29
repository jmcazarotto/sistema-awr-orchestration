import { describe, expect, it } from 'vitest';
import { createApp } from './app';
import { fixture } from '../orchestrator/test-support';
import { EmpresaResponseSchema, ListEmpresasResponseSchema, ListTemplatesResponseSchema, TemplateResponseSchema } from '../shared/types';

async function setup() {
  const f = await fixture();
  return { ...f, api: createApp({ orchestrator: f.app, config: f.config, brainDir: f.config.BRAIN_DIR, acervoDir: f.config.ACERVO_DIR }) };
}
const json = (body: unknown) => ({ headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

describe('API empresas/templates', () => {
  it('lista, consulta, cria empresa e filtra templates', async () => {
    const f = await setup();
    try {
      const empresas = ListEmpresasResponseSchema.parse(await (await f.api.request('/api/empresas')).json());
      expect(empresas.empresas[0]?.id).toBe('royal_face');
      expect((await f.api.request('/api/empresas/royal_face')).status).toBe(200);
      const response = await f.api.request('/api/empresas', { method: 'POST', ...json({ id: 'nova', nome: 'Clínica Nova', procedimentos: ['botox'] }) });
      expect(response.status).toBe(200);
      expect(EmpresaResponseSchema.parse(await response.json()).empresa.logo).toBeNull();
      const all = ListTemplatesResponseSchema.parse(await (await f.api.request('/api/templates?empresaId=nova')).json());
      expect(all.templates).toHaveLength(4);
      const filtered = ListTemplatesResponseSchema.parse(await (await f.api.request('/api/templates?empresaId=royal_face&procedimento=botox&familia=banco_imagem')).json());
      expect(filtered.templates).toHaveLength(2);
      expect((await f.api.request('/api/templates?procedimento=invalido')).status).toBe(400);
    } finally { await f.close(); }
  });
  it('salva template, rejeita elementos inválidos e responde 404', async () => {
    const f = await setup();
    try {
      const t = (await f.app.templates.list())[0]!;
      const input = { nome: 'Edição', fundo: '#abc', elementos: t.elementos };
      const response = await f.api.request(`/api/templates/${t.id}`, { method: 'PUT', ...json(input) });
      expect(response.status).toBe(200);
      expect(TemplateResponseSchema.parse(await response.json()).template.nome).toBe('Edição');
      const fetched = await f.api.request(`/api/templates/${t.id}`);
      expect(TemplateResponseSchema.parse(await fetched.json()).template.fundo).toBe('#abc');
      expect((await f.api.request(`/api/templates/${t.id}`, { method: 'PUT', ...json({ ...input, elementos: [t.elementos[0], t.elementos[0]] }) })).status).toBe(400);
      for (const path of ['/api/empresas/missing', '/api/templates/missing']) {
        const missing = await f.api.request(path); expect(missing.status).toBe(404);
        expect(await missing.json()).toMatchObject({ error: { code: 'NOT_FOUND' } });
      }
      expect((await f.api.request('/api/templates/missing', { method: 'PUT', ...json(input) })).status).toBe(404);
      const cors = await f.api.request('/api/templates/x', { method: 'OPTIONS', headers: { Origin: 'http://localhost:5173', 'Access-Control-Request-Method': 'PUT' } });
      expect(cors.headers.get('Access-Control-Allow-Methods')).toContain('PUT');
    } finally { await f.close(); }
  });
  it('valida upload multipart e salva logo no acervo', async () => {
    const f = await setup();
    try {
      const upload = (name: string, type: string, data = '<svg/>', id = 'royal_face') => {
        const form = new FormData(); form.append('arquivo', new File([data], name, { type }));
        return f.api.request(`/api/empresas/${id}/logo`, { method: 'POST', body: form });
      };
      const response = await upload('logo.svg', 'image/svg+xml');
      expect(response.status).toBe(200);
      const empresa = EmpresaResponseSchema.parse(await response.json()).empresa;
      expect(empresa.logo).toBe('_marcas/royal_face/logo.svg');
      expect((await f.storage.read(empresa.logo!)).toString()).toBe('<svg/>');
      expect((await upload('logo.exe', 'application/octet-stream')).status).toBe(400);
      expect((await upload('logo.png', 'image/png', 'x'.repeat(2 * 1024 * 1024 + 1))).status).toBe(400);
      expect((await upload('logo.png', 'text/plain')).status).toBe(400);
      expect((await upload('logo.svg', 'image/svg+xml', '<svg/>', 'missing')).status).toBe(404);
      expect((await f.api.request('/api/empresas/royal_face/logo', { method: 'POST', body: new FormData() })).status).toBe(400);
    } finally { await f.close(); }
  });
});
