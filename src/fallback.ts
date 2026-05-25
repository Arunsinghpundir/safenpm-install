import semver from 'semver';
import type { Logger } from './logger.js';
import {
  buildPacoteOptions,
  fetchPackument,
  isVersionAccessible,
} from './registry.js';
import type {
  DependencySpec,
  FallbackResult,
  PacoteOptions,
  RegistryConfig,
  VersionAttempt,
} from './types.js';

export { isBlockedError, isNetworkError } from './errors.js';

export function getCandidateVersions(
  packumentVersions: Record<string, unknown>,
  range: string,
): string[] {
  const versions = Object.keys(packumentVersions).filter((v) => semver.valid(v));
  const satisfying = semver.maxSatisfying(versions, range, {
    includePrerelease: false,
  });

  if (!satisfying) {
    const prereleaseSatisfying = semver.maxSatisfying(versions, range, {
      includePrerelease: true,
    });
    if (!prereleaseSatisfying) return [];
    return sortVersionsDescending(
      versions.filter((v) => semver.satisfies(v, range, { includePrerelease: true })),
    );
  }

  return sortVersionsDescending(
    versions.filter((v) => semver.satisfies(v, range, { includePrerelease: false })),
  );
}

function sortVersionsDescending(versions: string[]): string[] {
  return [...versions].sort((a, b) => semver.rcompare(a, b, true));
}

export async function resolveWithFallback(
  dep: DependencySpec,
  registryConfig: RegistryConfig,
  logger: Logger,
  overrideRegistry?: string,
): Promise<FallbackResult> {
  const pacoteOpts = buildPacoteOptions(dep.name, registryConfig, overrideRegistry);
  const packument = await fetchPackument(dep.name, pacoteOpts);
  const candidates = getCandidateVersions(packument.versions ?? {}, dep.range);

  if (candidates.length === 0) {
    throw new Error(
      `No versions of ${dep.name} satisfy range "${dep.range}" on registry ${pacoteOpts.registry}`,
    );
  }

  const latestCandidate = candidates[0];
  const attempts: VersionAttempt[] = [];
  let resolvedVersion: string | null = null;

  for (const version of candidates) {
    const result = await tryVersion(dep.name, version, pacoteOpts);
    attempts.push(result);

    if (result.accessible) {
      resolvedVersion = version;
      break;
    }

    if (result.blocked) {
      logger.warn(`${dep.name}@${version} blocked by registry`);
    } else if (result.error) {
      logger.debug(`${dep.name}@${version} failed: ${result.error}`);
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

async function tryVersion(
  packageName: string,
  version: string,
  opts: PacoteOptions,
): Promise<VersionAttempt> {
  const result = await isVersionAccessible(packageName, version, opts);
  return {
    version,
    accessible: result.accessible,
    blocked: result.blocked,
    error: result.error,
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
