import pacote from 'pacote';
import type { PacoteOptions } from '../types.js';
import { isBlockedError } from '../utils/errors.js';
import { withRetry } from '../utils/retry.js';
import type { RegistryCache } from './cache.js';
import {
  accessibilityCacheKey,
  packumentCacheKey,
} from './config.js';

export async function fetchPackument(
  packageName: string,
  opts: PacoteOptions,
): Promise<{ versions: Record<string, unknown> }> {
  return withRetry(
    () =>
      pacote.packument(packageName, opts) as Promise<{
        versions: Record<string, unknown>;
      }>,
    { maxAttempts: 4 },
  );
}

export async function fetchPackumentCached(
  packageName: string,
  opts: PacoteOptions,
  cache: RegistryCache,
): Promise<{ versions: Record<string, unknown> }> {
  const key = packumentCacheKey(packageName, opts.registry ?? '');
  const existing = cache.getPackument(key);
  if (existing) return existing;

  const promise = fetchPackument(packageName, opts);
  cache.setPackument(key, promise);
  return promise;
}

export async function validateManifest(
  packageName: string,
  version: string,
  opts: PacoteOptions,
): Promise<unknown> {
  const spec = `${packageName}@${version}`;
  return withRetry(() => pacote.manifest(spec, opts), { maxAttempts: 3 });
}

export async function checkVersionAccessibility(
  packageName: string,
  version: string,
  opts: PacoteOptions,
  cache: RegistryCache,
): Promise<{ accessible: boolean; blocked: boolean; error?: string }> {
  const key = accessibilityCacheKey(packageName, version, opts.registry ?? '');
  const cached = cache.getAccessibility(key);

  if (cached === 'accessible') {
    return { accessible: true, blocked: false };
  }
  if (cached === 'blocked') {
    return { accessible: false, blocked: true };
  }

  try {
    await validateManifest(packageName, version, opts);
    cache.setAccessibility(key, 'accessible');
    return { accessible: true, blocked: false };
  } catch (error) {
    if (isBlockedError(error)) {
      cache.setAccessibility(key, 'blocked');
      return {
        accessible: false,
        blocked: true,
        error: error instanceof Error ? error.message : String(error),
      };
    }

    cache.setAccessibility(key, 'error');
    return {
      accessible: false,
      blocked: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
