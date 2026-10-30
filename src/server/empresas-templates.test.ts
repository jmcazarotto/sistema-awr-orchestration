import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { createApp } from './app';
import { fixture } from '../orchestrator/test-support';
import { EmpresaResponseSchema, ListEmpresasResponseSchema, ListTemplatesResponseSchema, TemplateResponseSchema } from '../shared/types';

async function setup() {
  const f = await fixture();
  return { ...f, api: createApp({ orchestrator: f.app, config: f.config, brainDir: f.config.BRAIN_DIR, acervoDir: f.config.ACERVO_DIR }) };
}
const json = (body: unknown) => ({ headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

describe('API empresas/templates', () => {
  it('preserva referências legadas e sincroniza uploads e categorias com a skill de marca', async () => {
    const f = await setup();
    try {
      const endpoint = '/api/empresas/royal_face/referencias';
      const list = async () => (await (await f.api.request(endpoint)).json()) as { referencias: import('../shared/types').ReferenciaMarca[] };
      const legadas = (await list()).referencias;
      expect(legadas.length).toBeGreaterThan(0);
      const antiga = legadas.find(ref => ref.procedimento === 'botox')!;
      const recategorizar = await f.api.request(`${endpoint}/${antiga.id}`, { method: 'PUT', ...json({ procedimento: 'preenchimento_labial', composicao: antiga.composicao }) });
      expect(recategorizar.status).toBe(200);
      const imagem = await sharp({ create: { width: 2, height: 2, channels: 3, background: '#ffffff' } }).jpeg().toBuffer();
      const form = new FormData(); form.append('arquivo', new File([new Uint8Array(imagem)], 'exemplo.jpg', { type: 'image/jpeg' })); form.append('procedimento', 'botox'); form.append('composicao', 'informativa_clean');
      expect((await f.api.request(endpoint, { method: 'POST', body: form })).status).toBe(200);
      const atuais = (await list()).referencias;
      expect(atuais).toHaveLength(legadas.length + 1);
      expect(atuais.find(ref => ref.id === antiga.id)).toEqual({ ...antiga, procedimento: 'preenchimento_labial' });
      const nova = atuais.at(-1)!;
      expect(nova).toMatchObject({ procedimento: 'botox', composicao: 'informativa_clean', usarCopy: false });
      expect(await f.storage.read(nova.arquivo)).toEqual(imagem);
      expect((await f.app.marcas.get('royal_face'))?.referencias).toEqual(atuais);
      const empresa = (await f.app.empresas.get('royal_face'))!;
      await f.app.empresas.upsert({ ...empresa, nome: 'Nome alterado' });
      expect((await list()).referencias).toEqual(atuais);
      expect((await f.api.request(`${endpoint}/${antiga.id}`, { method: 'PUT', ...json({ procedimento: 'invalido', composicao: antiga.composicao }) })).status).toBe(400);
      expect((await f.api.request('/api/empresas/inexistente/referencias')).status).toBe(404);
    } finally { await f.close(); }
  });
  it('persiste logo escolhida, borda e propriedades da sombra no template', async () => {
    const f = await setup();
    try {
      const template = (await f.app.templates.list())[0]!;
      const elementos = template.elementos.map(e => ({ ...e, ...(e.tipo === 'logo' ? { logoArquivo: '_marcas/royal_face/escolhida.png' } : {}), estilo: { ...e.estilo, borda: { cor: '#112233', largura: 12 }, sombra: true, sombraConfig: { cor: '#445566', opacidade: .6, x: -4, y: 20, desfoque: 18, expansao: 3 } } }));
      const response = await f.api.request(`/api/templates/${template.id}`, { method: 'PUT', ...json({ nome: template.nome, fundo: template.fundo, elementos }) });
      expect(response.status).toBe(200);
      const saved = TemplateResponseSchema.parse(await (await f.api.request(`/api/templates/${template.id}`)).json()).template;
      expect(saved.elementos).toEqual(elementos);
      const invalid = elementos.map(e => ({ ...e, estilo: { ...e.estilo, sombraConfig: { ...e.estilo.sombraConfig, desfoque: -1 } } }));
      expect((await f.api.request(`/api/templates/${template.id}`, { method: 'PUT', ...json({ nome: template.nome, fundo: template.fundo, elementos: invalid }) })).status).toBe(400);
    } finally { await f.close(); }
  });
  it('acumula logos por fundo, preserva ao editar e salva principais', async () => {
    const f = await setup();
    try {
      const original = (await f.app.empresas.get('royal_face'))!;
      await f.app.empresas.upsert({ ...original, galeriaLogos: [] });
      const upload = async (fundo: string, principal: boolean) => {
        const form = new FormData();
        form.append('arquivo', new File(['<svg/>'], 'mesmo-nome.svg', { type: 'image/svg+xml' }));
        form.append('variante', fundo); form.append('principal', String(principal));
        const response = await f.api.request('/api/empresas/royal_face/logo', { method: 'POST', body: form });
        expect(response.status).toBe(200);
        return EmpresaResponseSchema.parse(await response.json()).empresa;
      };
      const first = await upload('claro', false);
      const second = await upload('claro', true);
      const third = await upload('escuro', true);
      expect(third.galeriaLogos).toHaveLength(3);
      expect(new Set(third.galeriaLogos!.map(l => l.arquivo)).size).toBe(3);
      expect(second.logos.claro).not.toBe(first.logos.claro);
      for (const logo of third.galeriaLogos!) expect((await f.storage.read(logo.arquivo)).toString()).toBe('<svg/>');
      const edited = await f.api.request('/api/empresas', { method: 'POST', ...json({ id: 'royal_face', nome: 'Nome atualizado' }) });
      expect(EmpresaResponseSchema.parse(await edited.json()).empresa.galeriaLogos).toEqual(third.galeriaLogos);
      const toggled = third.galeriaLogos!.map(l => ({ ...l, principal: l.arquivo === first.logos.claro }));
      const saved = await f.api.request('/api/empresas', { method: 'POST', ...json({ ...third, galeriaLogos: toggled }) });
      expect(EmpresaResponseSchema.parse(await saved.json()).empresa.logos.claro).toBe(first.logos.claro);
      const removed = await f.api.request('/api/empresas', { method: 'POST', ...json({ ...third, galeriaLogos: [] }) });
      expect(EmpresaResponseSchema.parse(await removed.json()).empresa.logos).toEqual({ claro: null, escuro: null });
    } finally { await f.close(); }
  });
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

describe('API ia (Configurações)', () => {
  it('lê e salva modelos, lê e zera uso', async () => {
    const f = await setup();
    try {
      const modelos = (await (await f.api.request('/api/ia/modelos')).json()) as { modelos: Record<string, unknown> };
      expect(modelos.modelos.imagem_monalisa).toEqual({ modelo: 'simulado', effort: null });
      const salvar = await f.api.request('/api/ia/modelos', { method: 'PUT', ...json({ ...modelos.modelos, aprendizado: { modelo: 'gpt-6.1-sol', effort: 'ultra' } }) });
      expect(salvar.status).toBe(200);
      expect((await f.api.request('/api/ia/modelos', { method: 'PUT', ...json({ ...modelos.modelos, triagem: { modelo: 'x', effort: null } }) })).status).toBe(400);
      const uso = (await (await f.api.request('/api/ia/uso')).json()) as { itens: unknown[]; total: { chamadas: number } };
      expect(uso.itens).toHaveLength(5);
      expect((await f.api.request('/api/ia/uso/zerar', { method: 'POST', ...json({}) })).status).toBe(200);
    } finally { await f.close(); }
  });
});
