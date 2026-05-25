import chalk from 'chalk';
import ora, { type Ora } from 'ora';
import type { WorkerStats } from '../types.js';

export class Logger {
  private spinner: Ora | null = null;
  private stats: WorkerStats = {
    activeWorkers: 0,
    queueSize: 0,
    completedTasks: 0,
    failedTasks: 0,
    resolvedPackages: 0,
    concurrency: 0,
  };

  constructor(private readonly verbose = false) {}

  info(message: string): void {
    this.stopSpinner();
    console.log(chalk.blue('ℹ'), message);
  }

  success(message: string): void {
    this.stopSpinner();
    console.log(chalk.green('✔'), message);
  }

  warn(message: string): void {
    this.stopSpinner();
    console.log(chalk.yellow('⚠'), message);
  }

  error(message: string): void {
    this.stopSpinner();
    console.error(chalk.red('✖'), message);
  }

  debug(message: string): void {
    if (this.verbose) {
      console.log(chalk.gray('›'), chalk.dim(message));
    }
  }

  worker(message: string): void {
    if (this.verbose) {
      console.log(chalk.cyan('[Worker]'), message);
    }
  }

  workerEvent(workerId: number, message: string): void {
    console.log(chalk.magenta(`[Worker-${workerId}]`), message);
  }

  updateStats(partial: Partial<WorkerStats>): void {
    this.stats = { ...this.stats, ...partial };
  }

  printStats(): void {
    if (!this.verbose) return;
    const s = this.stats;
    this.debug(
      `Stats: workers=${s.activeWorkers} queue=${s.queueSize} done=${s.completedTasks} ` +
        `failed=${s.failedTasks} resolved=${s.resolvedPackages} concurrency=${s.concurrency}`,
    );
  }

  startSpinner(text: string): Ora {
    this.stopSpinner();
    this.spinner = ora({ text, color: 'cyan' }).start();
    return this.spinner;
  }

  succeedSpinner(text: string): void {
    if (this.spinner) {
      this.spinner.succeed(text);
      this.spinner = null;
    } else {
      this.success(text);
    }
  }

  failSpinner(text: string): void {
    if (this.spinner) {
      this.spinner.fail(text);
      this.spinner = null;
    } else {
      this.error(text);
    }
  }

  warnSpinner(text: string): void {
    if (this.spinner) {
      this.spinner.warn(text);
      this.spinner = null;
    } else {
      this.warn(text);
    }
  }

  private stopSpinner(): void {
    if (this.spinner?.isSpinning) {
      this.spinner.stop();
      this.spinner = null;
    }
  }
}
