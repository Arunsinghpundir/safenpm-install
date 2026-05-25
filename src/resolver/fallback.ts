import semver from 'semver';
import type { RegistryCache } from '../registry/cache.js';
import { checkVersionAccessibility } from '../registry/client.js';
import type {
  DependencySpec,
  FallbackResult,
  PacoteOptions,
  VersionAttempt,
} from '../types.js';

export type VersionCheckStatus = 'accessible' | 'blocked' | 'error';

export interface ResolvePackageOptions {
  dep: DependencySpec;
  candidates: string[];
  pacoteOpts: PacoteOptions;
  cache: RegistryCache;
  runCheck: <T>(fn: () => Promise<T>) => Promise<T>;
  onVersionChecked?: (
    packageName: string,
    version: string,
    status: VersionCheckStatus,
  ) => void;
  batchSize?: number;
}

export async function resolvePackageWithFallback(
  options: ResolvePackageOptions,
): Promise<FallbackResult> {
  const {
    dep,
    candidates,
    pacoteOpts,
    cache,
    runCheck,
    onVersionChecked,
    batchSize = 8,
  } = options;

  const latestCandidate = candidates[0];
  const attempts: VersionAttempt[] = [];
  let resolvedVersion: string | null = null;

  for (let i = 0; i < candidates.length && !resolvedVersion; i += batchSize) {
    const batch = candidates.slice(i, i + batchSize);
    const batchResults = await Promise.all(
      batch.map((version) =>
        runCheck(async () => {
          const result = await checkVersionAccessibility(
            dep.name,
            version,
            pacoteOpts,
            cache,
          );
          return { version, ...result };
        }),
      ),
    );

    for (const result of batchResults) {
      const attempt: VersionAttempt = {
        version: result.version,
        accessible: result.accessible,
        blocked: result.blocked,
        error: result.error,
      };
      attempts.push(attempt);

      if (result.blocked) {
        onVersionChecked?.(dep.name, result.version, 'blocked');
      } else if (!result.accessible) {
        onVersionChecked?.(dep.name, result.version, 'error');
      }
    }

    const accessibleInBatch = batchResults
      .filter((r) => r.accessible)
      .map((r) => r.version)
      .sort((a, b) => semver.rcompare(a, b, true));

    if (accessibleInBatch.length > 0) {
      resolvedVersion = accessibleInBatch[0];
      break;
    }
  }

  if (!resolvedVersion) {
    const blockedCount = attempts.filter((a) => a.blocked).length;
    if (blockedCount === attempts.length) {
      throw new Error(
        `All ${attempts.length} candidate versions of ${dep.name} are blocked or unavailable`,
      );
    }
    throw new Error(
      `Could not resolve an accessible version of ${dep.name} for range "${dep.range}"`,
    );
  }

  return {
    name: dep.name,
    range: dep.range,
    requestedVersion: latestCandidate,
    resolvedVersion,
    attempts,
    usedFallback: resolvedVersion !== latestCandidate,
  };
}

export function buildOverridesFromResults(
  results: FallbackResult[],
): Record<string, string> {
  const overrides: Record<string, string> = {};
  for (const result of results) {
    if (result.usedFallback) {
      overrides[result.name] = result.resolvedVersion;
    }
  }
  return overrides;
}
