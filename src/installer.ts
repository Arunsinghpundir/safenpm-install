import { execa } from 'execa';
import type { Logger } from './utils/logger.js';
import type { InstallOptions } from './types.js';

export async function runNpmInstall(
  options: InstallOptions,
  logger: Logger,
): Promise<number> {
  if (options.dryRun) {
    logger.info(`[dry-run] Would run: npm install ${options.npmArgs.join(' ')}`.trim());
    return 0;
  }

  const spinner = logger.startSpinner('Running npm install');
  const start = performance.now();

  try {
    await execa('npm', ['install', ...options.npmArgs], {
      cwd: options.cwd,
      stdio: options.verbose ? 'inherit' : 'pipe',
      env: process.env,
    });
    const elapsed = ((performance.now() - start) / 1000).toFixed(1);
    spinner.succeed(`Running npm install (${elapsed}s)`);
    return performance.now() - start;
  } catch (error) {
    spinner.fail('npm install failed');

    if (error && typeof error === 'object' && 'stderr' in error) {
      const stderr = (error as { stderr?: string }).stderr;
      if (stderr) logger.debug(stderr);
    }

    throw new Error('npm install failed after safenpm resolution', { cause: error });
  }
}
