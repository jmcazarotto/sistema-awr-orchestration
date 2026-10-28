import { z } from 'zod';
import { DemandaSchema, InboxMessageSchema, LearningSchema, ReviewResultSchema, SubmitDemandInputSchema } from '../../shared/types';
import type { Demanda, InboxMessage } from '../../shared/types';

export const EngineStateSchema = z.object({
  sequence: z.number().int().nonnegative().default(0),
  demandas: z.record(z.string(), DemandaSchema).default({}),
  messages: z.array(InboxMessageSchema).default([]),
  processed: z.array(z.string()).default([]),
  pending: z.array(z.string()).default([]),
  inputs: z.record(z.string(), SubmitDemandInputSchema).default({}),
  best: z.record(z.string(), z.object({ path: z.string(), versao: z.number(), review: ReviewResultSchema })).default({}),
  reminders: z.record(z.string(), z.number()).default({}),
  reviews: z.record(z.string(), z.object({ review: ReviewResultSchema, tentativa: z.number().int().positive() })).default({}),
  learningByMessage: z.record(z.string(), LearningSchema).default({}),
});
export type EngineState = z.infer<typeof EngineStateSchema>;
export const emptyState = (): EngineState => EngineStateSchema.parse({});

export interface StateStore {
  load(): Promise<EngineState>;
  save(state: EngineState): Promise<void>;
}
export interface AcervoStorage {
  initialize(): Promise<void>;
  list(prefix?: string): Promise<string[]>;
  read(path: string): Promise<Buffer>;
  write(path: string, data: Buffer): Promise<void>;
  move(from: string, to: string): Promise<void>;
  watch?(onChange: () => void, onError: (error: unknown) => void): Promise<() => Promise<void>>;
}
export interface Clock {
  now(): Date;
  setInterval(callback: () => void | Promise<void>, ms: number): () => void;
}
export interface IdGenerator { next(): string }
export type DemandMutation = (demanda: Demanda, state: EngineState) => void;
export type MessageHandler = (message: InboxMessage) => Promise<void>;
