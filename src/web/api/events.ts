// Keep the public API boundary while avoiding the /api source/proxy collision.
export { connectEvents, parseEvent } from '../transport/events';
export type { Connection, EventHandlers } from '../transport/events';
