import os from 'node:os';
import pLimit from 'p-limit';
import type { Logger } from '../utils/logger.js';

export interface AdaptiveConcurrencyOptions {
  initial: number;
  min?: number;
  max?: number;
  slowThresholdMs?: number;
  fastThresholdMs?: number;
}

export class AdaptiveConcurrency {
  private current: number;
  private readonly min: number;
  private readonly max: number;
  private readonly slowThresholdMs: number;
  private readonly fastThresholdMs: number;
  private limit: ReturnType<typeof pLimit>;
  private recentLatencies: number[] = [];
  private readonly sampleSize = 20;

  constructor(
    options: AdaptiveConcurrencyOptions,
    private readonly logger?: Logger,
  ) {
    this.current = options.initial;
    this.min = options.min ?? 2;
    this.max = options.max ?? options.initial;
    this.slowThresholdMs = options.slowThresholdMs ?? 2_500;
    this.fastThresholdMs = options.fastThresholdMs ?? 400;
    this.limit = pLimit(this.current);
  }

  get concurrency(): number {
    return this.current;
  }

  async run<T>(fn: () => Promise<T>): Promise<T> {
    const start = performance.now();
    try {
      return await this.limit(fn);
    } finally {
      this.recordLatency(performance.now() - start);
    }
  }

  private recordLatency(ms: number): void {
    this.recentLatencies.push(ms);
    if (this.recentLatencies.length > this.sampleSize) {
      this.recentLatencies.shift();
    }
    this.maybeAdjust();
  }

  private maybeAdjust(): void {
    if (this.recentLatencies.length < 5) return;

    const avg =
      this.recentLatencies.reduce((a, b) => a + b, 0) / this.recentLatencies.length;
    const heapRatio = process.memoryUsage().heapUsed / os.totalmem();

    if (avg > this.slowThresholdMs || heapRatio > 0.45) {
      this.throttle();
    } else if (avg < this.fastThresholdMs && heapRatio < 0.25) {
      this.increase();
    }
  }

  private throttle(): void {
    if (this.current <= this.min) return;
    this.current = Math.max(this.min, Math.floor(this.current * 0.75));
    this.limit = pLimit(this.current);
    this.logger?.debug(`Adaptive throttle → concurrency ${this.current}`);
  }

  private increase(): void {
    if (this.current >= this.max) return;
    this.current = Math.min(this.max, this.current + 1);
    this.limit = pLimit(this.current);
    this.logger?.debug(`Adaptive boost → concurrency ${this.current}`);
  }
}

export function createLimit(concurrency: number): ReturnType<typeof pLimit> {
  return pLimit(Math.max(1, concurrency));
}
