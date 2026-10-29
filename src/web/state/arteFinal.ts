import type { Empresa, SkillId, SkillSummary } from '../../shared/types';

/** `_staging/DEM-0001__v1.png` -> `_staging/DEM-0001__v1.meta.json` (null se não for PNG). */
export const metaPathDe = (stagingPath: string | undefined) => stagingPath && /\.png$/i.test(stagingPath) ? stagingPath.replace(/\.png$/i, '.meta.json') : null;

/** Variantes de logo já cadastradas, para os selos do card da empresa. */
export const logosCadastrados = (e: Pick<Empresa, 'logo' | 'logos'>) => [
  { id: 'principal', label: 'Principal', ok: !!e.logo }, { id: 'claro', label: 'Fundo claro', ok: !!e.logos?.claro }, { id: 'escuro', label: 'Fundo escuro', ok: !!e.logos?.escuro },
] as const;

const TECNICAS: Partial<Record<SkillId, string>> = { template_composition: 'Monalisa · templates', arte_final_ia: 'Van Gogh · arte final por IA' };
export const isTecnica = (id: SkillId) => id in TECNICAS;
export const tecnicaLabel = (s: Pick<SkillSummary, 'id' | 'label'>) => TECNICAS[s.id] ?? s.label;
