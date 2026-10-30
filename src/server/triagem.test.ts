import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { TriagemResponseSchema } from '../shared/types';
import { OrchestratorError } from '../orchestrator/core/errors';
import { fixture } from './test-support';

describe('POST /api/triagem', () => {
  let f: Awaited<ReturnType<typeof fixture>>;
  beforeEach(async () => { f = await fixture(); });
  afterEach(async () => { await f.cleanup(); });
  const post = (body: unknown) => ({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  it('valida, apara texto e devolve somente a triagem', async () => {
    const response = await f.app.request('/api/triagem', post({ texto: '  Antes e depois de botox  ' }));
    expect(response.status).toBe(200);
    expect(TriagemResponseSchema.parse(await response.json()).triagem.procedimento).toBe('botox');
    expect(f.orchestrator.triar).toHaveBeenCalledWith('Antes e depois de botox', undefined);
    expect(f.orchestrator.submitDemand).not.toHaveBeenCalled();
  });
  it.each([{}, null, { texto: 'ab' }, { texto: ' ' }, { texto: 'x'.repeat(4001) }, { texto: 'botox', extra: 1 }])('rejeita body %j', async body => {
    expect((await f.app.request('/api/triagem', post(body))).status).toBe(400);
    expect(f.orchestrator.triar).not.toHaveBeenCalled();
  });
  it('rejeita JSON malformado', async () => {
    expect((await f.app.request('/api/triagem', { method: 'POST', body: '{' })).status).toBe(400);
  });
  it('retorna 502 UPSTREAM_ERROR sem expor mensagem interna', async () => {
    f.orchestrator.triar.mockRejectedValueOnce(new OrchestratorError('UPSTREAM_ERROR', 'private-key', 502));
    const response = await f.app.request('/api/triagem', post({ texto: 'antes e depois' }));
    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ error: { code: 'UPSTREAM_ERROR', message: 'Falha no classificador de IA.' } });
  });
});
