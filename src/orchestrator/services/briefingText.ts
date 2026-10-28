import type { SubmitDemandInput } from '../../shared/types';

/** Campos estruturados têm precedência sobre sugestões rotuladas no briefing. */
export function extractBriefingText(input: SubmitDemandInput): SubmitDemandInput {
  const field = (names: string): string | undefined => {
    const match = new RegExp(`(?:^|[\\n;])\\s*(?:${names})\\s*:\\s*([^\\n;]+)`, 'i').exec(input.briefing)?.[1]?.trim().replace(/^["“]|["”]$/g, '');
    return match || undefined;
  };
  return { ...input, headline: input.headline ?? field('headline|título|titulo'), cta: input.cta ?? field('cta|chamada para ação'), clinicaNome: input.clinicaNome ?? field('clínica|clinica|clinica_nome|unidade') };
}
