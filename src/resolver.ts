import fs from 'node:fs/promises';
import path from 'node:path';
import type { Logger } from './logger.js';
import { isNetworkError } from './errors.js';
import {
  buildOverridesFromResults,
  resolveWithFallback,
} from './fallback.js';
import { loadRegistryConfig } from './registry.js';
import type {
  CliOptions,
  DependencySpec,
  PackageJson,
  ResolutionPlan,
} from './types.js';

const DEPENDENCY_SECTIONS = ['dependencies', 'devDependencies'] as const;

export async function readPackageJson(cwd: string): Promise<PackageJson> {
  const packagePath = path.join(cwd, 'package.json');

  let raw: string;
  try {
    raw = await fs.readFile(packagePath, 'utf8');
  } catch (error) {
    throw new Error(
      `Failed to read package.json at ${packagePath}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  try {
    return JSON.parse(raw) as PackageJson;
  } catch {
    throw new Error(`Invalid JSON in ${packagePath}`);
  }
}

export function extractDependencies(pkg: PackageJson): DependencySpec[] {
  const specs: DependencySpec[] = [];

  for (const section of DEPENDENCY_SECTIONS) {
    const deps = pkg[section];
    if (!deps) continue;

    for (const [name, range] of Object.entries(deps)) {
      if (!range || range.startsWith('file:') || range.startsWith('link:') || range.startsWith('workspace:')) {
        continue;
      }
      specs.push({ name, range, section });
    }
  }

  return specs;
}

export async function buildResolutionPlan(
  options: CliOptions,
  logger: Logger,
): Promise<ResolutionPlan> {
  const pkg = await readPackageJson(options.cwd);
  const dependencies = extractDependencies(pkg);

  if (dependencies.length === 0) {
    logger.warn('No dependencies or devDependencies found in package.json');
    return { results: [], overrides: {} };
  }

  logger.debug(`Found ${dependencies.length} dependencies to validate`);

  const registryConfig = await loadRegistryConfig(options.cwd);
  const results = [];

  for (const dep of dependencies) {
    const spinner = logger.startSpinner(`Checking ${dep.name}…`);

    try {
      const result = await resolveWithFallback(
        dep,
        registryConfig,
        logger,
        options.registry,
      );
      results.push(result);

      if (result.usedFallback) {
        spinner.warn(
          `Falling back to ${dep.name}@${result.resolvedVersion}`,
        );
      } else {
        spinner.succeed(`${dep.name}@${result.resolvedVersion} accessible`);
      }
    } catch (error) {
      if (isNetworkError(error)) {
        spinner.fail(`Network error resolving ${dep.name}`);
        throw new Error(
          `Network failure while resolving ${dep.name}. Check connectivity and registry config.`,
          { cause: error },
        );
      }
      spinner.fail(`Failed to resolve ${dep.name}`);
      throw error;
    }
  }

  const overrides = buildOverridesFromResults(results);

  return { results, overrides };
}
