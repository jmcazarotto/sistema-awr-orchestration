import { Creator } from './Creator';
import type { EventBus } from '../core/EventBus';
import type { BrainLoader } from '../brain/BrainLoader';
import type { ImageEngine } from '../services/ImageEngine';
export class VanGogh extends Creator {
  constructor(bus: EventBus, brain: BrainLoader, images: ImageEngine) { super('van_gogh', bus, brain, images); }
}
