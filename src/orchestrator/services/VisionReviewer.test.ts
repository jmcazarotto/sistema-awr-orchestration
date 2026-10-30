import { describe, expect, it, vi } from 'vitest';
import { fixture } from '../test-support';
import { VisionReviewer } from './VisionReviewer';
import { BrainLoader } from '../brain/BrainLoader';
import { AiClient } from './AiClient';

describe('anotações do Diretor', () => {
  it('registra critério e origem simulada; mantém o resumo específico da revisão visual', async () => {
    const f = await fixture();
    try {
      const demand = await f.app.submitDemand({briefing:'Botox',tipoTemplate:'banco_imagem_1'});
      await f.bus.whenIdle();
      const current = f.app.getDemanda(demand.id)!;
      expect(current.ultimoReview?.modo).toBe('simulado');
      expect(current.ultimoReview?.itens.every(i=>i.criterio?.endsWith('?'))).toBe(true);
      expect(current.ultimoReview?.feedback.resumo).toContain('conferência humana');
      expect(JSON.stringify(current.ultimoReview)).not.toContain('Composição mock');
      const brain = new BrainLoader(f.config.BRAIN_DIR, f.clock);
      const ai = new AiClient(f.config, f.bus, 'test-key');
      vi.spyOn(ai,'json').mockResolvedValue({...current.ultimoReview!,feedback:{resumo:'Título legível no topo e logo com margem livre.',correcoes:[]}});
      const review = await new VisionReviewer({...f.config,AI_MODE:'openai'}, f.storage, brain, ai).review(current,current.stagingPath!,1);
      expect(review.modo).toBe('visual');
      expect(review.feedback.resumo).toBe('Título legível no topo e logo com margem livre.');
      expect(review.itens[0]?.criterio).toBe(current.ultimoReview?.itens[0]?.criterio);
    } finally { vi.restoreAllMocks(); await f.close(); }
  });
});
