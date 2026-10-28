import type { EngineState, StateStore } from './interfaces';
import { emptyState, EngineStateSchema } from './interfaces';

export class MemoryStateStore implements StateStore {
  private state: EngineState;
  constructor(initial: EngineState = emptyState()) { this.state = structuredClone(initial); }
  async load(): Promise<EngineState> { return structuredClone(this.state); }
  async save(state: EngineState): Promise<void> { this.state = EngineStateSchema.parse(structuredClone(state)); }
}
