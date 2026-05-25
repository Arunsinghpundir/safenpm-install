#!/usr/bin/env node

import { Command } from 'commander';
import path from 'node:path';
import { Logger } from './logger.js';
import { applyOverrides, getOverrideSummary } from './overrides.js';
import { runNpmInstall } from './installer.js';
import { buildResolutionPlan } from './resolver.js';
import type { CliOptions } from './types.js';
import { formatError } from './errors.js';

const SAFE_NPM_FLAGS = new Set([
  '--dry-run',
  '--skip-install',
  '-v',
  '--verbose',
  '-C',
  '--cwd',
  '--registry',
]);

function getNpmPassthroughArgs(argv: string[]): string[] {
  const installIdx = argv.findIndex((a) => a === 'install');
  if (installIdx === -1) return [];

  const result: string[] = [];
  let i = installIdx + 1;

  while (i < argv.length) {
    const arg = argv[i];

    if (arg === '-C' || arg === '--cwd' || arg === '--registry') {
      i += 2;
      continue;
    }

    if (
      SAFE_NPM_FLAGS.has(arg) ||
      arg.startsWith('--registry=') ||
      arg.startsWith('-C=') ||
      arg.startsWith('--cwd=')
    ) {
      i += 1;
      continue;
    }

    result.push(arg);
    i += 1;
  }

  return result;
}

const program = new Command();

program
  .name('safe-npm')
  .description(
    'Enterprise-safe npm wrapper that auto-fallbacks when registry blocks package versions',
  )
  .version('0.1.0');

program
  .command('install')
  .description('Resolve blocked versions, write overrides, and run npm install')
  .option('-C, --cwd <path>', 'Working directory', process.cwd())
  .option('--registry <url>', 'Override registry URL for all packages')
  .option('--dry-run', 'Resolve and report without writing overrides or running npm')
  .option('--skip-install', 'Apply overrides only; do not run npm install')
  .option('-v, --verbose', 'Enable debug logging')
  .allowUnknownOption(true)
  .action(async (opts) => {
    const logger = new Logger(Boolean(opts.verbose));
    const unknownArgs = getNpmPassthroughArgs(process.argv);

    const cliOptions: CliOptions = {
      cwd: path.resolve(opts.cwd),
      dryRun: Boolean(opts.dryRun),
      verbose: Boolean(opts.verbose),
      registry: opts.registry,
      skipInstall: Boolean(opts.skipInstall),
    };

    try {
      logger.success('Reading dependencies');

      const spinner = logger.startSpinner('Resolving versions');
      const plan = await buildResolutionPlan(cliOptions, logger);
      spinner.succeed('Resolving versions');

      for (const result of plan.results) {
        if (result.usedFallback) {
          logger.success(
            `Falling back to ${result.name}@${result.resolvedVersion}`,
          );
        }
      }

      if (Object.keys(plan.overrides).length > 0) {
        logger.debug(`Overrides: ${getOverrideSummary(plan.overrides)}`);
        await applyOverrides(
          cliOptions.cwd,
          plan.overrides,
          logger,
          cliOptions.dryRun,
        );
      } else {
        logger.debug('All dependencies accessible at latest resolved versions');
      }

      if (!cliOptions.skipInstall) {
        await runNpmInstall(
          {
            cwd: cliOptions.cwd,
            npmArgs: unknownArgs,
            dryRun: cliOptions.dryRun,
            verbose: cliOptions.verbose,
          },
          logger,
        );
      } else {
        logger.info('Skipped npm install (--skip-install)');
      }
    } catch (error) {
      logger.error(formatError(error));
      process.exitCode = 1;
    }
  });

program.parseAsync(process.argv).catch((error) => {
  console.error(formatError(error));
  process.exit(1);
});
