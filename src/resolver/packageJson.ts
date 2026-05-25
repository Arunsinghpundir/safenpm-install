import fs from 'node:fs/promises';
import path from 'node:path';
import type { DependencySpec, PackageJson } from '../types.js';

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
      if (
        !range ||
        range.startsWith('file:') ||
        range.startsWith('link:') ||
        range.startsWith('workspace:')
      ) {
        continue;
      }
      specs.push({ name, range, section });
    }
  }

  return specs;
}
