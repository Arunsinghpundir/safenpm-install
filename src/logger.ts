import chalk from 'chalk';
import ora, { type Ora } from 'ora';

export type LogLevel = 'info' | 'success' | 'warn' | 'error' | 'debug';

export class Logger {
  private spinner: Ora | null = null;

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
