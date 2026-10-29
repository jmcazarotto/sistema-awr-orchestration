// Limpa _staging e as pastas finais dos procedimentos (mantém _references, _marcas e .gitkeep).
import { readdir, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import 'dotenv/config';

const ACERVO = resolve(process.env.ACERVO_DIR ?? './acervo');
const DIRS = ['_staging', 'preenchimento_labial', 'botox', 'fios_sustentacao'];

for (const dir of DIRS) {
  const full = join(ACERVO, dir);
  const files = await readdir(full).catch(() => [] as string[]);
  const targets = files.filter((f) => f !== '.gitkeep');
  await Promise.all(targets.map((f) => rm(join(full, f), { force: true, recursive: true })));
  console.log(`${dir}: ${targets.length} arquivo(s) removido(s)`);
}
