import type { TipoTemplate } from '../../shared/types';
export interface Box { x: number; y: number; w: number; h: number }
const b = (x: number, y: number, w: number, h: number): Box => ({ x, y, w, h });
export const TEMPLATE_GEOMETRY: Record<TipoTemplate, Record<string, Box>> = {
  antes_depois_1: {
    logo: b(64,64,200,56), selo: b(756,64,260,56), headline: b(64,144,952,150),
    photo_antes: b(64,320,468,700), photo_depois: b(548,320,468,700),
    label_antes: b(80,964,140,40), label_depois: b(564,964,140,40),
    cta: b(64,1048,560,72), disclaimer: b(64,1144,952,64), rodape: b(64,1226,952,60),
  },
  antes_depois_2: {
    logo: b(64,64,200,56), selo: b(756,64,260,56), headline: b(64,144,952,130),
    photo_antes: b(64,290,952,380), photo_depois: b(64,686,952,380),
    label_antes: b(84,310,140,40), label_depois: b(84,706,140,40),
    cta: b(64,1082,952,64), disclaimer: b(64,1160,952,56), rodape: b(64,1232,952,54),
  },
  banco_imagem_1: {
    photo_fundo: b(0,0,1080,1350), overlay_gradient: b(0,640,1080,710),
    logo: b(64,64,200,56), selo: b(756,64,260,56), headline: b(64,760,952,260),
    cta: b(64,1050,520,72), disclaimer: b(64,1146,952,64), rodape: b(64,1226,952,60),
  },
  banco_imagem_2: {
    photo_principal: b(0,0,1080,760), panel_texto: b(0,760,1080,590),
    logo: b(64,792,200,48), selo: b(756,792,260,48), headline: b(64,864,952,200),
    cta: b(64,1088,520,72), disclaimer: b(64,1176,952,56), rodape: b(64,1244,952,42),
  },
};
export function geometry(template: TipoTemplate, stories = false): Record<string, Box> {
  const result = structuredClone(TEMPLATE_GEOMETRY[template]);
  if (!stories) return result;
  for (const [name, box] of Object.entries(result)) {
    if (['cta', 'disclaimer', 'rodape'].includes(name)) box.y += 294;
    else if (['logo', 'selo'].includes(name)) box.y += template === 'banco_imagem_2' ? 294 : 186;
    else if (name === 'headline') box.y += template.startsWith('banco') ? 294 : 186;
  }
  if (template === 'antes_depois_1') {
    result.photo_antes = b(64,506,468,808); result.photo_depois = b(548,506,468,808);
    result.label_antes = b(80,1258,140,40); result.label_depois = b(564,1258,140,40);
  } else if (template === 'antes_depois_2') {
    result.photo_antes = b(64,476,952,434); result.photo_depois = b(64,926,952,434);
    result.label_antes = b(84,496,140,40); result.label_depois = b(84,946,140,40);
  } else if (template === 'banco_imagem_1') {
    result.photo_fundo = b(0,0,1080,1920); result.overlay_gradient = b(0,934,1080,986);
  } else { result.photo_principal = b(0,0,1080,1054); result.panel_texto = b(0,1054,1080,866); }
  return result;
}
