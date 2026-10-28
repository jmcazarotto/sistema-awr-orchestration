// Verificação manual isolada: npx tsx src/server/smoke.ts
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { cp, mkdtemp, rm } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join, relative, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { pathToFileURL } from 'node:url';
import { CreateDemandaResponseSchema, ListSkillsResponseSchema, SseEnvelopeSchema } from '../shared/types';

const raiz = await mkdtemp(join(tmpdir(), 'awr-api-smoke-'));
const brainDir = join(raiz, 'brain');
await cp(resolve('brain'), brainDir, { recursive: true });
const reserva = createServer();
reserva.listen(0, '127.0.0.1');
await once(reserva, 'listening');
const endereco = reserva.address();
if (!endereco || typeof endereco === 'string') throw new Error('Não foi possível reservar porta livre');
const porta = endereco.port;
await new Promise<void>(resolveClose => reserva.close(() => resolveClose()));
const bootstrap = `process.on('message', () => { process.emit('SIGTERM'); process.disconnect(); }); await import(${JSON.stringify(pathToFileURL(resolve('src/server/index.ts')).href)});`;
const processo = spawn(process.execPath, ['--import', 'tsx', '--input-type=module', '--eval', bootstrap], {
  env: { ...process.env, PORT: String(porta), IMAGE_ENGINE_MODE: 'mock', AI_MODE: 'mock', CLASSIFIER_PROVIDER: 'openai', MOCK_REJECT_RATE: '0', ACERVO_AUTOFILL: 'false', BRAIN_DIR: brainDir, ACERVO_DIR: join(raiz, 'acervo'), DATA_DIR: join(raiz, 'data') },
  stdio: ['ignore', 'pipe', 'pipe', 'ipc'], windowsHide: true,
});
let saida = '';
processo.stdout?.on('data', (chunk: Buffer) => { saida += chunk.toString(); });
processo.stderr?.on('data', (chunk: Buffer) => { saida += chunk.toString(); });
const finalizado = new Promise<void>((resolveExit, rejectExit) => {
  processo.once('exit', () => resolveExit());
  processo.once('error', rejectExit);
});
const abortar = new AbortController();
let leitor: ReadableStreamDefaultReader<Uint8Array> | undefined;
try {
  const url = `http://127.0.0.1:${porta}`;
  let disponivel = false;
  for (let tentativa = 0; tentativa < 100; tentativa++) {
    if (processo.exitCode !== null) throw new Error(`Servidor encerrou antes do boot: ${saida}`);
    try { disponivel = (await fetch(`${url}/api/health`)).ok; } catch { /* Aguardando bind local. */ }
    if (disponivel) break;
    await delay(100);
  }
  if (!disponivel) throw new Error(`Timeout no boot: ${saida}`);
  const skillsResponse = await fetch(`${url}/api/brain/skills`);
  if (!skillsResponse.ok || ListSkillsResponseSchema.parse(await skillsResponse.json()).skills.length !== 4) throw new Error('Falha ao ler skills reais');
  const sse = await fetch(`${url}/api/events`, { signal: abortar.signal });
  if (!sse.ok || !sse.body) throw new Error('Falha ao conectar SSE');
  leitor = sse.body.getReader();
  const response = await fetch(`${url}/api/demandas`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ procedimento: 'botox', tipoTemplate: 'banco_imagem_1', briefing: 'Arte educativa sobre toxina botulínica.' }),
  });
  if (response.status !== 201) throw new Error(`POST retornou ${response.status}: ${await response.text()}`);
  const { demanda } = CreateDemandaResponseSchema.parse(await response.json());
  let texto = '';
  const eventos: string[] = [];
  const decoder = new TextDecoder();
  const timeout = setTimeout(() => abortar.abort(), 10000);
  try {
    while (eventos.length < 3) {
      const chunk = await leitor.read();
      if (chunk.done) throw new Error('SSE encerrou antes dos eventos');
      texto += decoder.decode(chunk.value, { stream: true });
      let separador: number;
      while ((separador = texto.indexOf('\n\n')) >= 0) {
        const frame = texto.slice(0, separador);
        texto = texto.slice(separador + 2);
        const data = /^data: (.*)$/m.exec(frame)?.[1];
        if (data) eventos.push(SseEnvelopeSchema.parse(JSON.parse(data) as unknown).type);
      }
    }
  } finally { clearTimeout(timeout); }
  console.log(`Smoke OK: POST 201 ${demanda.id}; SSE: ${eventos.join(', ')}; porta efêmera ${porta}.`);
  const conflito = spawn(process.execPath, ['--import', 'tsx', resolve('src/server/index.ts')], {
    env: { ...process.env, PORT: String(porta), IMAGE_ENGINE_MODE: 'mock', AI_MODE: 'mock', ACERVO_AUTOFILL: 'false', BRAIN_DIR: brainDir, ACERVO_DIR: join(raiz, 'acervo-conflito'), DATA_DIR: join(raiz, 'data-conflito') },
    stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true,
  });
  let erroConflito = '';
  conflito.stdout?.on('data', (chunk: Buffer) => { erroConflito += chunk.toString(); });
  conflito.stderr?.on('data', (chunk: Buffer) => { erroConflito += chunk.toString(); });
  const limiteConflito = setTimeout(() => { conflito.kill(); }, 10000);
  try { await once(conflito, 'exit'); } finally { clearTimeout(limiteConflito); }
  if (conflito.exitCode !== 1 || !erroConflito.includes(`Porta ${porta} já está em uso`)) throw new Error(`EADDRINUSE não foi tratado: ${erroConflito}`);
  console.log('EADDRINUSE OK: mensagem clara e exit=1.');
} finally {
  abortar.abort();
  await leitor?.cancel().catch(() => undefined);
  if (processo.connected) processo.send('shutdown');
  const timeout = setTimeout(() => { processo.kill(); }, 10000);
  try { await finalizado; } finally { clearTimeout(timeout); }
  // Somente o diretório único criado acima pode ser removido por este smoke.
  const caminho = relative(tmpdir(), raiz);
  if (caminho.startsWith('awr-api-smoke-') && !caminho.includes('/') && !caminho.includes('\\')) await rm(raiz, { recursive: true, force: true });
  console.log(`Processo ${processo.pid} encerrado; exit=${processo.exitCode}, signal=${processo.signalCode}.`);
}
