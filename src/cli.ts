#!/usr/bin/env node

import { Command } from 'commander';
import path from 'node:path';
import { Logger } from './utils/logger.js';
import { formatError } from './utils/errors.js';
import { applyOverrides, getOverrideSummary } from './resolver/overrides.js';
import { runNpmInstall } from './installer.js';
import { buildResolutionPlan } from './resolver/parallelResolver.js';
import { resolveConcurrencyConfig, type CoreOptionsInput } from './parallel/cpuDetector.js';
import { runBenchmark } from './benchmark/benchmark.js';
import type { CliOptions } from './types.js';

const SAFENPM_FLAGS = new Set([
  '--dry-run',
  '--skip-install',
  '-v',
  '--verbose',
  '-C',
  '--cwd',
  '--registry',
  '--32-core',
  '--64-core',
  '--all-core',
  '--max-core',
  '--no-parallel',
]);

function parseWorkersArg(arg: string): number | undefined {
  const match = /^--workers=(\d+)$/.exec(arg) ?? /^-w=(\d+)$/.exec(arg);
  return match ? Number.parseInt(match[1], 10) : undefined;
}

function parseCoreOptions(argv: string[]): CoreOptionsInput {
  const input: CoreOptionsInput = {};
  for (const arg of argv) {
    if (arg === '--32-core') input.preset32 = true;
    if (arg === '--64-core') input.preset64 = true;
    if (arg === '--all-core') input.allCore = true;
    if (arg === '--max-core') input.maxCore = true;
    const workers = parseWorkersArg(arg);
    if (workers !== undefined) input.workers = workers;
  }
  return input;
}

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
      SAFENPM_FLAGS.has(arg) ||
      arg.startsWith('--registry=') ||
      arg.startsWith('-C=') ||
      arg.startsWith('--cwd=') ||
      arg.startsWith('--workers=') ||
      arg === '--workers'
    ) {
      if (arg === '--workers') i += 2;
      else i += 1;
      continue;
    }

    if (
      arg === '--32-core' ||
      arg === '--64-core' ||
      arg === '--all-core' ||
      arg === '--max-core' ||
      arg === '--no-parallel'
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
  .name('safenpm')
  .description(
    'Enterprise-safe npm wrapper with parallel registry validation and auto-fallback',
  )
  .version('0.2.0');

program
  .command('install')
  .description('Parallel resolve, write overrides, and run npm install')
  .option('-C, --cwd <path>', 'Working directory', process.cwd())
  .option('--registry <url>', 'Override registry URL for all packages')
  .option('--dry-run', 'Resolve and report without writing overrides or running npm')
  .option('--skip-install', 'Apply overrides only; do not run npm install')
  .option('-v, --verbose', 'Enable debug logging and worker output')
  .option('--32-core', 'Use up to 32 worker threads')
  .option('--64-core', 'Use up to 64 worker threads')
  .option('--all-core', 'Use all logical CPU cores')
  .option('--max-core', 'Use maximum safe worker count (all cores, capped)')
  .option('--workers <n>', 'Explicit worker count', parseInt)
  .option('--no-parallel', 'Disable parallel engine (sequential fallback)')
  .allowUnknownOption(true)
  .action(async (opts) => {
    const logger = new Logger(Boolean(opts.verbose));
    const unknownArgs = getNpmPassthroughArgs(process.argv);
    const coreInput = parseCoreOptions(process.argv);
    if (opts.workers) coreInput.workers = Number(opts.workers);

    const concurrency = resolveConcurrencyConfig(coreInput);
    if (opts.noParallel) {
      concurrency.workerCount = 1;
      concurrency.ioConcurrency = 1;
      concurrency.adaptive = false;
    }

    const cliOptions: CliOptions = {
      cwd: path.resolve(opts.cwd),
      dryRun: Boolean(opts.dryRun),
      verbose: Boolean(opts.verbose),
      registry: opts.registry,
      skipInstall: Boolean(opts.skipInstall),
      concurrency,
      noParallel: Boolean(opts.noParallel),
    };

    const totalStart = performance.now();

    try {
      logger.success('Reading dependencies');

      const spinner = logger.startSpinner('Resolving versions in parallel');
      const plan = await buildResolutionPlan(cliOptions, logger);
      spinner.succeed(
        `Resolving versions (${plan.stats.durationMs.toFixed(0)}ms, ${plan.stats.concurrency} concurrent I/O)`,
      );

      for (const result of plan.results) {
        for (const attempt of result.attempts) {
          if (attempt.blocked) {
            logger.warn(`${result.name}@${attempt.version} blocked by registry`);
          }
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

      const totalSec = ((performance.now() - totalStart) / 1000).toFixed(1);
      logger.success(`Installation completed in ${totalSec}s`);
      logger.printStats();
    } catch (error) {
      logger.error(formatError(error));
      process.exitCode = 1;
    }
  });

program
  .command('benchmark')
  .description('Compare safenpm validation performance vs npm install baseline')
  .option('-C, --cwd <path>', 'Working directory', process.cwd())
  .option('--registry <url>', 'Override registry URL')
  .option('-v, --verbose', 'Verbose output')
  .option('--skip-npm-install', 'Only benchmark registry validation')
  .action(async (opts) => {
    const logger = new Logger(Boolean(opts.verbose));
    try {
      await runBenchmark(
        {
          cwd: path.resolve(opts.cwd),
          verbose: Boolean(opts.verbose),
          registry: opts.registry,
          skipNpmInstall: Boolean(opts.skipNpmInstall),
        },
        logger,
      );
    } catch (error) {
      logger.error(formatError(error));
      process.exitCode = 1;
    }
  });

program.parseAsync(process.argv).catch((error) => {
  console.error(formatError(error));
  process.exit(1);
});
