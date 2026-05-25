import type { Logger } from '../utils/logger.js';
import { isNetworkError } from '../utils/errors.js';
import { RegistryCache } from '../registry/cache.js';
import { loadRegistryConfig } from '../registry/config.js';
import { ParallelScheduler } from '../parallel/scheduler.js';
import type { CliOptions, ResolutionPlan } from '../types.js';
import { buildOverridesFromResults } from './fallback.js';
import { extractDependencies, readPackageJson } from './packageJson.js';

export async function buildResolutionPlan(
  options: CliOptions,
  logger: Logger,
): Promise<ResolutionPlan> {
  const start = performance.now();
  const pkg = await readPackageJson(options.cwd);
  const dependencies = extractDependencies(pkg);
  const cache = new RegistryCache();

  if (dependencies.length === 0) {
    logger.warn('No dependencies or devDependencies found in package.json');
    return emptyPlan(start, options.concurrency);
  }

  logger.debug(`Found ${dependencies.length} dependencies to validate`);

  const registryConfig = await loadRegistryConfig(options.cwd);

  logger.success(`Detected ${options.concurrency.logicalCores} logical cores`);
  logger.success(`Starting ${options.concurrency.workerCount} workers`);
  logger.success('Parallel registry validation enabled');
  if (options.concurrency.adaptive) {
    logger.success('Adaptive concurrency enabled');
  }

  const scheduler = new ParallelScheduler();

  try {
    const { results } = await scheduler.run({
      dependencies,
      registryConfig,
      concurrency: options.concurrency,
      registryOverride: options.registry,
      logger,
      cache,
    });

    const overrides = buildOverridesFromResults(results);
    const fallbacks = results.filter((r) => r.usedFallback).length;
    const durationMs = performance.now() - start;

    return {
      results,
      overrides,
      stats: {
        totalPackages: dependencies.length,
        resolved: results.length,
        failed: dependencies.length - results.length,
        fallbacks,
        durationMs,
        workersUsed: options.concurrency.workerCount,
        concurrency: options.concurrency.ioConcurrency,
        cacheHits: cache.hits,
        cacheMisses: cache.misses,
      },
    };
  } catch (error) {
    if (isNetworkError(error)) {
      throw new Error(
        'Network failure during parallel resolution. Check connectivity and registry config.',
        { cause: error },
      );
    }
    throw error;
  }
}

function emptyPlan(start: number, concurrency: CliOptions['concurrency']): ResolutionPlan {
  return {
    results: [],
    overrides: {},
    stats: {
      totalPackages: 0,
      resolved: 0,
      failed: 0,
      fallbacks: 0,
      durationMs: performance.now() - start,
      workersUsed: concurrency.workerCount,
      concurrency: concurrency.ioConcurrency,
      cacheHits: 0,
      cacheMisses: 0,
    },
  };
}
