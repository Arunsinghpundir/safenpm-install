import os from 'node:os';
import type { ConcurrencyConfig, CorePreset } from '../types.js';

export const MAX_SAFE_WORKERS = 64;
export const MIN_WORKERS = 1;
export const MEMORY_PER_WORKER_MB = 48;

export interface CoreOptionsInput {
  preset32?: boolean;
  preset64?: boolean;
  allCore?: boolean;
  maxCore?: boolean;
  workers?: number;
}

export function detectLogicalCores(): number {
  return os.cpus().length || 4;
}

export function resolveConcurrencyConfig(input: CoreOptionsInput): ConcurrencyConfig {
  const logicalCores = detectLogicalCores();
  let preset: CorePreset = 'default';
  let requestedWorkers: number | undefined;

  if (input.workers !== undefined && input.workers > 0) {
    requestedWorkers = input.workers;
    preset = 'default';
  } else if (input.preset32) {
    requestedWorkers = 32;
    preset = '32';
  } else if (input.preset64) {
    requestedWorkers = 64;
    preset = '64';
  } else if (input.allCore || input.maxCore) {
    requestedWorkers = logicalCores;
    preset = input.maxCore ? 'max' : 'all';
  }

  const workerCount = computeSafeWorkerCount(logicalCores, requestedWorkers);
  const ioConcurrency = computeIoConcurrency(workerCount, logicalCores);

  return {
    logicalCores,
    workerCount,
    ioConcurrency,
    adaptive: true,
    preset,
  };
}

export function computeSafeWorkerCount(
  logicalCores: number,
  requested?: number,
): number {
  const memoryLimited = estimateWorkersFromMemory();
  const defaultWorkers = Math.max(MIN_WORKERS, Math.min(logicalCores - 1, 8));
  const target = requested ?? defaultWorkers;

  return Math.max(
    MIN_WORKERS,
    Math.min(target, logicalCores, MAX_SAFE_WORKERS, memoryLimited),
  );
}

function estimateWorkersFromMemory(): number {
  const freeMb = os.freemem() / (1024 * 1024);
  const safe = Math.floor(freeMb / MEMORY_PER_WORKER_MB);
  return Math.max(MIN_WORKERS, Math.min(safe, MAX_SAFE_WORKERS));
}

export function computeIoConcurrency(workerCount: number, logicalCores: number): number {
  return Math.min(workerCount * 4, logicalCores * 8, 128);
}
