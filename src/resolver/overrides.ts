import fs from 'node:fs/promises';
import path from 'node:path';
import type { Logger } from '../utils/logger.js';
import { readPackageJson } from './packageJson.js';

export async function applyOverrides(
  cwd: string,
  overrides: Record<string, string>,
  logger: Logger,
  dryRun = false,
): Promise<void> {
  if (Object.keys(overrides).length === 0) {
    logger.debug('No overrides required');
    return;
  }

  const packagePath = path.join(cwd, 'package.json');
  const pkg = await readPackageJson(cwd);

  const merged = mergeOverrides(pkg.overrides ?? {}, overrides);
  pkg.overrides = merged;

  if (dryRun) {
    logger.info(`[dry-run] Would write overrides: ${JSON.stringify(merged, null, 2)}`);
    return;
  }

  const content = `${JSON.stringify(pkg, null, 2)}\n`;
  await fs.writeFile(packagePath, content, 'utf8');
  logger.success('Writing overrides');
}

function mergeOverrides(
  existing: Record<string, string | Record<string, string>>,
  incoming: Record<string, string>,
): Record<string, string> {
  const merged: Record<string, string> = {};

  for (const [key, value] of Object.entries(existing)) {
    if (typeof value === 'string') {
      merged[key] = value;
    }
  }

  for (const [key, value] of Object.entries(incoming)) {
    merged[key] = value;
  }

  return merged;
}

export function getOverrideSummary(overrides: Record<string, string>): string {
  const entries = Object.entries(overrides);
  if (entries.length === 0) return 'none';
  return entries.map(([name, version]) => `${name}@${version}`).join(', ');
}
