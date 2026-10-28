import { defineConfig } from 'vitest/config';

// Vite usa src/web como root; os testes do motor e dos contratos partem do repositório.
export default defineConfig({ root: '.', test: { environment: 'node' } });
