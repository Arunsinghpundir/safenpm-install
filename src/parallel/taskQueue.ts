export type TaskPriority = 'high' | 'normal' | 'low';

export interface QueuedTask<T> {
  id: string;
  priority: TaskPriority;
  execute: () => Promise<T>;
}

const PRIORITY_WEIGHT: Record<TaskPriority, number> = {
  high: 0,
  normal: 1,
  low: 2,
};

export class TaskQueue<T> {
  private readonly pending: QueuedTask<T>[] = [];
  private active = 0;
  private completed = 0;
  private failed = 0;

  constructor(private readonly concurrency: number) {}

  get size(): number {
    return this.pending.length;
  }

  get activeCount(): number {
    return this.active;
  }

  get completedCount(): number {
    return this.completed;
  }

  get failedCount(): number {
    return this.failed;
  }

  enqueue(task: QueuedTask<T>): void {
    this.pending.push(task);
    this.pending.sort(
      (a, b) => PRIORITY_WEIGHT[a.priority] - PRIORITY_WEIGHT[b.priority],
    );
    this.pump();
  }

  async drain(): Promise<void> {
    while (this.pending.length > 0 || this.active > 0) {
      await new Promise((r) => setTimeout(r, 10));
    }
  }

  private pump(): void {
    while (this.active < this.concurrency && this.pending.length > 0) {
      const task = this.pending.shift();
      if (!task) break;
      this.active++;
      task
        .execute()
        .then(() => {
          this.completed++;
        })
        .catch(() => {
          this.failed++;
        })
        .finally(() => {
          this.active--;
          this.pump();
        });
    }
  }
}
