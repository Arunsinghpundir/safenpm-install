export type DependencySection = 'dependencies' | 'devDependencies';

export interface PackageJson {
  name?: string;
  version?: string;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  overrides?: Record<string, string | Record<string, string>>;
  [key: string]: unknown;
}

export interface DependencySpec {
  name: string;
  range: string;
  section: DependencySection;
}

export interface RegistryConfig {
  defaultRegistry: string;
  scopedRegistries: Map<string, string>;
  authTokens: Map<string, string>;
}

export interface PacoteOptions {
  registry?: string;
  token?: string;
  cache?: string;
  preferOnline?: boolean;
  fullMetadata?: boolean;
}

export interface VersionAttempt {
  version: string;
  accessible: boolean;
  blocked: boolean;
  error?: string;
}

export interface FallbackResult {
  name: string;
  range: string;
  requestedVersion: string | null;
  resolvedVersion: string;
  attempts: VersionAttempt[];
  usedFallback: boolean;
}

export interface ResolutionPlan {
  results: FallbackResult[];
  overrides: Record<string, string>;
}

export interface InstallOptions {
  cwd: string;
  npmArgs: string[];
  dryRun?: boolean;
  verbose?: boolean;
}

export interface CliOptions {
  cwd: string;
  dryRun: boolean;
  verbose: boolean;
  registry?: string;
  skipInstall: boolean;
}

export type BlockedErrorCode =
  | 'E403'
  | 'E404'
  | 'FORBIDDEN'
  | 'UNAVAILABLE'
  | 'BLOCKED';

export interface SafeNpmError extends Error {
  code?: string;
  statusCode?: number;
  packageName?: string;
}
