import vanGogh from '../assets/agentes/van_gogh.webp';
import monalisa from '../assets/agentes/monalisa.webp';
import artDirector from '../assets/agentes/art_director.webp';
import classifier from '../assets/agentes/classifier.webp';
import acervoWatcher from '../assets/agentes/acervo_watcher.webp';
import awrHuman from '../assets/agentes/awr_human.webp';
import { actorLabels } from './ui';

/** Foto de perfil dos agentes (círculo, estilo avatar de rede social). */
export const AGENTE_AVATAR: Record<string, string> = { art_director: artDirector, van_gogh: vanGogh, monalisa, classifier, acervo_watcher: acervoWatcher, awr_human: awrHuman };

export function AgentAvatar({ id, size = 40, active = false, className = '' }: { id: string; size?: number; active?: boolean; className?: string }) {
  const src = AGENTE_AVATAR[id];
  if (!src) return null;
  return <img src={src} alt={`Foto de perfil: ${actorLabels[id] ?? id}`} width={size} height={size} className={`agent-avatar${active ? ' active' : ''}${className ? ` ${className}` : ''}`} style={{ width: size, height: size }} loading="lazy" decoding="async" />;
}
