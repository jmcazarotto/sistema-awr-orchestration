import 'dotenv/config';
import { serve } from '@hono/node-server';
import { loadConfig } from '../shared/config';
import { createOrchestrator } from '../orchestrator/index';
import { closeAppStreams, createApp } from './app';

const config = loadConfig(process.env);
const orchestrator = createOrchestrator(config);
const app = createApp({ orchestrator, config, brainDir: config.BRAIN_DIR, acervoDir: config.ACERVO_DIR });
let server: ReturnType<typeof serve> | undefined;
let encerrando: Promise<void> | undefined;
let inicializacao: Promise<void> | undefined;

function shutdown(exitCode = 0): Promise<void> {
  encerrando ??= (async () => {
    process.exitCode = exitCode;
    closeAppStreams(app);
    const fechado = server ? new Promise<void>(resolve => {
      server?.close(() => resolve());
      if (server && 'closeAllConnections' in server) server.closeAllConnections();
    }) : Promise.resolve();
    await inicializacao?.catch(() => undefined);
    try { await orchestrator.stop(); }
    catch { console.error('Falha ao encerrar o orquestrador.'); process.exitCode = 1; }
    await fechado;
  })();
  return encerrando;
}

process.once('SIGINT', () => { void shutdown(); });
process.once('SIGTERM', () => { void shutdown(); });
try {
  inicializacao = orchestrator.start();
  await inicializacao;
  if (!encerrando) {
    // No `tsx watch` o processo anterior pode ainda segurar a porta por alguns ms: tenta de novo (até ~5 s) antes de desistir.
    const listen = (tentativa: number) => {
      server = serve({ fetch: app.fetch, port: config.PORT }, () => {
        console.log(`AWR Design System API em http://localhost:${config.PORT} · image=${config.IMAGE_ENGINE_MODE} ai=${config.AI_MODE}`);
      });
      server.on('error', (error: NodeJS.ErrnoException) => {
        if (error.code === 'EADDRINUSE' && tentativa < 20 && !encerrando) { setTimeout(() => listen(tentativa + 1), 250); return; }
        console.error(error.code === 'EADDRINUSE' ? `Porta ${config.PORT} já está em uso. Encerre o outro processo ou configure PORT.` : 'Não foi possível iniciar o servidor HTTP.');
        void shutdown(1);
      });
    };
    listen(1);
  }
} catch {
  console.error('Não foi possível iniciar a API AWR. Verifique a configuração e os diretórios.');
  await shutdown(1);
}
