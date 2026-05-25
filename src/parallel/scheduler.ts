import pLimit from 'p-limit';
import type { Logger } from '../utils/logger.js';
import type {
  ConcurrencyConfig,
  DependencySpec,
  FallbackResult,
  RegistryConfig,
} from '../types.js';
import { AdaptiveConcurrency } from './concurrency.js';
import { WorkerPool } from './workerPool.js';
import { RegistryCache } from '../registry/cache.js';
import { resolvePackageWithFallback } from '../resolver/fallback.js';
import { fetchPackumentCached } from '../registry/client.js';
import { buildPacoteOptions } from '../registry/config.js';

export interface ScheduleOptions {
  dependencies: DependencySpec[];
  registryConfig: RegistryConfig;
  concurrency: ConcurrencyConfig;
  registryOverride?: string;
  logger: Logger;
  cache: RegistryCache;
}

export interface ScheduleResult {
  results: FallbackResult[];
  failed: string[];
}

export class ParallelScheduler {
  private workerPool: WorkerPool | null = null;
  private adaptive: AdaptiveConcurrency | null = null;

  async run(options: ScheduleOptions): Promise<ScheduleResult> {
    const { dependencies, registryConfig, concurrency, logger, cache } = options;
    const start = performance.now();

    this.workerPool = new WorkerPool(Math.min(concurrency.workerCount, 4));
    await this.workerPool.initialize();

    this.adaptive = concurrency.adaptive
      ? new AdaptiveConcurrency(
          {
            initial: concurrency.ioConcurrency,
            min: 2,
            max: concurrency.ioConcurrency,
          },
          logger,
        )
      : null;

    logger.updateStats({
      activeWorkers: this.workerPool.workerCount,
      concurrency: concurrency.ioConcurrency,
      queueSize: dependencies.length,
    });

    const results: FallbackResult[] = [];
    const failed: string[] = [];
    let workerId = 0;

    const tasks = dependencies.map((dep) => async () => {
      const id = (++workerId % concurrency.workerCount) + 1;
      const depStart = performance.now();

      try {
        const pacoteOpts = buildPacoteOptions(
          dep.name,
          registryConfig,
          options.registryOverride,
        );

        const packument = await fetchPackumentCached(dep.name, pacoteOpts, cache);
        const versionKeys = Object.keys(packument.versions ?? {});

        const candidates = await this.workerPool!.filterVersions(
          versionKeys,
          dep.range,
        );

        if (candidates.length === 0) {
          throw new Error(
            `No versions of ${dep.name} satisfy range "${dep.range}"`,
          );
        }

        const runCheck = <T>(fn: () => Promise<T>): Promise<T> =>
          this.adaptive ? this.adaptive.run(fn) : fn();

        const result = await resolvePackageWithFallback({
          dep,
          candidates,
          pacoteOpts,
          cache,
          runCheck,
          onVersionChecked: (pkg, version, status) => {
            if (status === 'blocked') {
              logger.workerEvent(id, `${pkg}@${version} blocked`);
            } else if (status === 'accessible') {
              logger.workerEvent(id, `${pkg}@${version} accessible`);
            }
          },
        });

        result.durationMs = performance.now() - depStart;
        results.push(result);

        logger.workerEvent(
          id,
          `${result.name}@${result.resolvedVersion} accessible`,
        );

        if (result.usedFallback) {
          logger.success(
            `Fallback resolved for ${result.name} → ${result.resolvedVersion}`,
          );
        }

        logger.updateStats({
          resolvedPackages: results.length,
          completedTasks: results.length,
          queueSize: Math.max(0, dependencies.length - results.length - failed.length),
        });
      } catch (error) {
        failed.push(dep.name);
        logger.updateStats({ failedTasks: failed.length });
        throw error;
      }
    });

    await runParallel(tasks, concurrency.ioConcurrency);

    await this.workerPool.destroy();
    this.workerPool = null;

    logger.debug(`Parallel resolution completed in ${(performance.now() - start).toFixed(0)}ms`);

    return { results, failed };
  }
}

async function runParallel(
  tasks: Array<() => Promise<void>>,
  concurrency: number,
): Promise<void> {
  const limit = pLimit(concurrency);
  const errors: unknown[] = [];

  await Promise.all(
    tasks.map((task) =>
      limit(async () => {
        try {
          await task();
        } catch (error) {
          errors.push(error);
        }
      }),
    ),
  );

  if (errors.length > 0) {
    throw errors[0];
  }
}
