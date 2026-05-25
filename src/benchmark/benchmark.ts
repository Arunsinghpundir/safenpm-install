import { execa } from 'execa';
import chalk from 'chalk';
import type { Logger } from '../utils/logger.js';
import { resolveConcurrencyConfig } from '../parallel/cpuDetector.js';
import { buildResolutionPlan } from '../resolver/parallelResolver.js';
import type { BenchmarkResult, CliOptions } from '../types.js';

export interface BenchmarkOptions {
  cwd: string;
  verbose: boolean;
  registry?: string;
  skipNpmInstall?: boolean;
}

export async function runBenchmark(
  options: BenchmarkOptions,
  logger: Logger,
): Promise<BenchmarkResult> {
  const concurrency = resolveConcurrencyConfig({});
  const cliOptions: CliOptions = {
    cwd: options.cwd,
    dryRun: true,
    verbose: options.verbose,
    registry: options.registry,
    skipInstall: true,
    concurrency,
  };

  logger.info('Benchmark: safenpm parallel registry validation');
  const validationStart = performance.now();
  const plan = await buildResolutionPlan(cliOptions, logger);
  const registryValidationMs = performance.now() - validationStart;

  const fallbackRecoveryMs = plan.results
    .filter((r) => r.usedFallback)
    .reduce((sum, r) => sum + (r.durationMs ?? 0), 0);

  let npmInstallMs = 0;
  if (!options.skipNpmInstall) {
    logger.info('Benchmark: npm install (baseline)');
    const npmStart = performance.now();
    try {
      await execa('npm', ['install'], {
        cwd: options.cwd,
        stdio: options.verbose ? 'inherit' : 'pipe',
        env: process.env,
      });
    } catch {
      logger.warn('npm install benchmark failed — reporting partial metrics');
    }
    npmInstallMs = performance.now() - npmStart;
  }

  const safenpmTotalMs = registryValidationMs + npmInstallMs;

  const result: BenchmarkResult = {
    registryValidationMs,
    dependencyResolutionMs: plan.stats.durationMs,
    fallbackRecoveryMs,
    npmInstallMs,
    safenpmTotalMs,
    packagesChecked: plan.stats.totalPackages,
    fallbacksApplied: plan.stats.fallbacks,
    workersUsed: plan.stats.workersUsed,
    cacheHitRate: plan.stats.cacheHits / Math.max(1, plan.stats.cacheHits + plan.stats.cacheMisses),
  };

  printBenchmarkReport(result, logger);
  return result;
}

function printBenchmarkReport(result: BenchmarkResult, logger: Logger): void {
  logger.success('Benchmark complete');
  console.log('');
  console.log(chalk.bold('Performance metrics'));
  console.log(chalk.dim('─'.repeat(48)));
  console.log(`  Registry validation:   ${formatMs(result.registryValidationMs)}`);
  console.log(`  Dependency resolution: ${formatMs(result.dependencyResolutionMs)}`);
  console.log(`  Fallback recovery:     ${formatMs(result.fallbackRecoveryMs)}`);
  console.log(`  npm install duration:  ${formatMs(result.npmInstallMs)}`);
  console.log(`  safenpm total:         ${formatMs(result.safenpmTotalMs)}`);
  console.log(chalk.dim('─'.repeat(48)));
  console.log(`  Packages checked:      ${result.packagesChecked}`);
  console.log(`  Fallbacks applied:     ${result.fallbacksApplied}`);
  console.log(`  Workers used:          ${result.workersUsed}`);
  console.log(`  Cache hit rate:        ${(result.cacheHitRate * 100).toFixed(1)}%`);
  console.log('');
}

function formatMs(ms: number): string {
  if (ms >= 1000) return `${(ms / 1000).toFixed(1)}s`;
  return `${ms.toFixed(0)}ms`;
}
