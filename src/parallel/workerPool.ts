import { Worker } from 'node:worker_threads';
import { fileURLToPath } from 'node:url';
import semver from 'semver';
import type { WorkerResultMessage, WorkerTaskMessage } from '../types.js';

interface PendingTask {
  resolve: (candidates: string[]) => void;
  reject: (error: Error) => void;
}

const WORKER_VERSION_THRESHOLD = 80;

export class WorkerPool {
  private workers: Worker[] = [];
  private readonly pending = new Map<string, PendingTask>();
  private taskCounter = 0;
  private roundRobin = 0;

  constructor(private readonly size: number) {}

  async initialize(): Promise<void> {
    if (this.size <= 0) return;

    const workerPath = fileURLToPath(
      new URL('./worker.js', import.meta.url),
    );

    for (let i = 0; i < this.size; i++) {
      const worker = new Worker(workerPath, { name: `safenpm-worker-${i + 1}` });
      worker.on('message', (msg: WorkerResultMessage) => this.handleMessage(msg));
      worker.on('error', (err) => this.rejectAll(err));
      this.workers.push(worker);
    }
  }

  async filterVersions(versions: string[], range: string): Promise<string[]> {
    if (versions.length < WORKER_VERSION_THRESHOLD || this.workers.length === 0) {
      return filterVersionsSync(versions, range);
    }

    const id = `task-${++this.taskCounter}`;
    const message: WorkerTaskMessage = {
      type: 'filter-versions',
      id,
      versions,
      range,
    };

    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      const worker = this.workers[this.roundRobin % this.workers.length];
      this.roundRobin++;
      worker.postMessage(message);

      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          resolve(filterVersionsSync(versions, range));
        }
      }, 30_000);
    });
  }

  async destroy(): Promise<void> {
    await Promise.all(this.workers.map((w) => w.terminate()));
    this.workers = [];
    this.pending.clear();
  }

  get workerCount(): number {
    return this.workers.length;
  }

  private handleMessage(msg: WorkerResultMessage): void {
    const pending = this.pending.get(msg.id);
    if (!pending) return;
    this.pending.delete(msg.id);

    if (msg.error) {
      pending.reject(new Error(msg.error));
    } else {
      pending.resolve(msg.candidates);
    }
  }

  private rejectAll(error: Error): void {
    for (const [, pending] of this.pending) {
      pending.reject(error);
    }
    this.pending.clear();
  }
}

function filterVersionsSync(versions: string[], range: string): string[] {
  const valid = versions.filter((v) => semver.valid(v));
  const satisfying = valid.filter((v) =>
    semver.satisfies(v, range, { includePrerelease: true }),
  );
  return [...satisfying].sort((a, b) => semver.rcompare(a, b, true));
}
