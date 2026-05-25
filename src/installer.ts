import { execa } from 'execa';
import type { Logger } from './logger.js';
import type { InstallOptions } from './types.js';

export async function runNpmInstall(
  options: InstallOptions,
  logger: Logger,
): Promise<void> {
  if (options.dryRun) {
    logger.info(`[dry-run] Would run: npm install ${options.npmArgs.join(' ')}`.trim());
    return;
  }

  const spinner = logger.startSpinner('Running npm install');

  try {
    await execa('npm', ['install', ...options.npmArgs], {
      cwd: options.cwd,
      stdio: options.verbose ? 'inherit' : 'pipe',
      env: process.env,
    });
    spinner.succeed('Running npm install');
  } catch (error) {
    spinner.fail('npm install failed');

    if (error && typeof error === 'object' && 'stderr' in error) {
      const stderr = (error as { stderr?: string }).stderr;
      if (stderr) logger.debug(stderr);
    }

    throw new Error('npm install failed after applying safe-npm overrides', {
      cause: error,
    });
  }
}
