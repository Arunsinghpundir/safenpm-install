import fs from 'node:fs/promises';
import path from 'node:path';
import pacote from 'pacote';
import type { PacoteOptions, RegistryConfig } from './types.js';
import { isBlockedError } from './errors.js';

const DEFAULT_REGISTRY = 'https://registry.npmjs.org/';

export async function loadRegistryConfig(cwd: string): Promise<RegistryConfig> {
  const config: RegistryConfig = {
    defaultRegistry: DEFAULT_REGISTRY,
    scopedRegistries: new Map(),
    authTokens: new Map(),
  };

  const npmrcPaths = [
    path.join(cwd, '.npmrc'),
    path.join(process.env.HOME ?? process.env.USERPROFILE ?? '', '.npmrc'),
  ];

  for (const npmrcPath of npmrcPaths) {
    try {
      const content = await fs.readFile(npmrcPath, 'utf8');
      parseNpmrc(content, config);
    } catch {
      // .npmrc is optional
    }
  }

  if (process.env.npm_config_registry) {
    config.defaultRegistry = normalizeRegistryUrl(process.env.npm_config_registry);
  }

  return config;
}

function parseNpmrc(content: string, config: RegistryConfig): void {
  for (const rawLine of content.split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#') || line.startsWith(';')) continue;

    const eqIndex = line.indexOf('=');
    if (eqIndex === -1) continue;

    const key = line.slice(0, eqIndex).trim();
    const value = line.slice(eqIndex + 1).trim().replace(/^['"]|['"]$/g, '');

    if (key === 'registry') {
      config.defaultRegistry = normalizeRegistryUrl(value);
      continue;
    }

    const scopedRegistryMatch = /^@([^:]+):registry$/.exec(key);
    if (scopedRegistryMatch) {
      config.scopedRegistries.set(
        `@${scopedRegistryMatch[1]}`,
        normalizeRegistryUrl(value),
      );
      continue;
    }

    const authTokenMatch = /^\/\/([^:]+):_authToken$/.exec(key);
    if (authTokenMatch) {
      config.authTokens.set(normalizeRegistryUrl(authTokenMatch[1]), value);
    }
  }
}

export function getRegistryForPackage(
  packageName: string,
  config: RegistryConfig,
  overrideRegistry?: string,
): string {
  if (overrideRegistry) {
    return normalizeRegistryUrl(overrideRegistry);
  }

  if (packageName.startsWith('@')) {
    const scope = packageName.split('/')[0];
    const scoped = config.scopedRegistries.get(scope);
    if (scoped) return scoped;
  }

  return config.defaultRegistry;
}

export function buildPacoteOptions(
  packageName: string,
  config: RegistryConfig,
  overrideRegistry?: string,
): PacoteOptions {
  const registry = getRegistryForPackage(packageName, config, overrideRegistry);
  const token = config.authTokens.get(registry.replace(/\/$/, '')) ??
    config.authTokens.get(registry);

  return {
    registry,
    ...(token ? { token } : {}),
    preferOnline: true,
    fullMetadata: true,
  };
}

export function normalizeRegistryUrl(url: string): string {
  const trimmed = url.trim();
  return trimmed.endsWith('/') ? trimmed : `${trimmed}/`;
}

export async function fetchPackument(
  packageName: string,
  opts: PacoteOptions,
): Promise<{ versions: Record<string, unknown> }> {
  return pacote.packument(packageName, opts) as Promise<{
    versions: Record<string, unknown>;
  }>;
}

export async function validateManifest(
  packageName: string,
  version: string,
  opts: PacoteOptions,
): Promise<unknown> {
  const spec = `${packageName}@${version}`;
  return pacote.manifest(spec, opts);
}

export async function isVersionAccessible(
  packageName: string,
  version: string,
  opts: PacoteOptions,
): Promise<{ accessible: boolean; blocked: boolean; error?: string }> {
  try {
    await validateManifest(packageName, version, opts);
    return { accessible: true, blocked: false };
  } catch (error) {
    if (isBlockedError(error)) {
      return {
        accessible: false,
        blocked: true,
        error: error instanceof Error ? error.message : String(error),
      };
    }

    return {
      accessible: false,
      blocked: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
