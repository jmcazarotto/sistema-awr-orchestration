import { Creator } from './Creator';
import type { EventBus } from '../core/EventBus';
import type { BrainLoader } from '../brain/BrainLoader';
import type { ImageEngine } from '../services/ImageEngine';
export class Monalisa extends Creator {
  constructor(bus: EventBus, brain: BrainLoader, images: ImageEngine) { super('monalisa', bus, brain, images); }
}
