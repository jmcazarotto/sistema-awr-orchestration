import { nanoid } from 'nanoid';
import type { Clock, IdGenerator } from './interfaces';

export class SystemClock implements Clock {
  now(): Date { return new Date(); }
  setInterval(callback: () => void | Promise<void>, ms: number): () => void {
    const timer = setInterval(() => { void callback(); }, ms);
    timer.unref(); return () => clearInterval(timer);
  }
}
export class NanoIdGenerator implements IdGenerator { next(): string { return nanoid(); } }
export class FakeClock implements Clock {
  private milliseconds: number;
  private sequence = 0;
  private readonly timers = new Map<number, { at: number; ms: number; callback: () => void | Promise<void> }>();
  constructor(date = '2026-10-28T12:00:00.000Z') { this.milliseconds = Date.parse(date); }
  now(): Date { return new Date(this.milliseconds); }
  setInterval(callback: () => void | Promise<void>, ms: number): () => void {
    const id = ++this.sequence; this.timers.set(id, { at: this.milliseconds + ms, ms, callback });
    return () => { this.timers.delete(id); };
  }
  async advance(ms: number): Promise<void> {
    const until = this.milliseconds + ms;
    while (true) {
      const next = [...this.timers.entries()].filter(([, timer]) => timer.at <= until).sort((a, b) => a[1].at - b[1].at)[0];
      if (!next) break;
      this.milliseconds = next[1].at; next[1].at += next[1].ms; await next[1].callback();
    }
    this.milliseconds = until;
  }
  get timerCount(): number { return this.timers.size; }
}
