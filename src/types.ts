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
  durationMs?: number;
}

export interface ResolutionPlan {
  results: FallbackResult[];
  overrides: Record<string, string>;
  stats: ResolutionStats;
}

export interface ResolutionStats {
  totalPackages: number;
  resolved: number;
  failed: number;
  fallbacks: number;
  durationMs: number;
  workersUsed: number;
  concurrency: number;
  cacheHits: number;
  cacheMisses: number;
}

export interface InstallOptions {
  cwd: string;
  npmArgs: string[];
  dryRun?: boolean;
  verbose?: boolean;
}

export type CorePreset = '32' | '64' | 'all' | 'max' | 'default';

export interface ConcurrencyConfig {
  logicalCores: number;
  workerCount: number;
  ioConcurrency: number;
  adaptive: boolean;
  preset?: CorePreset;
}

export interface CliOptions {
  cwd: string;
  dryRun: boolean;
  verbose: boolean;
  registry?: string;
  skipInstall: boolean;
  concurrency: ConcurrencyConfig;
  noParallel?: boolean;
}

export interface SafeNpmError extends Error {
  code?: string;
  statusCode?: number;
  packageName?: string;
}

export interface WorkerStats {
  activeWorkers: number;
  queueSize: number;
  completedTasks: number;
  failedTasks: number;
  resolvedPackages: number;
  concurrency: number;
}

export interface BenchmarkResult {
  registryValidationMs: number;
  dependencyResolutionMs: number;
  fallbackRecoveryMs: number;
  npmInstallMs: number;
  safenpmTotalMs: number;
  packagesChecked: number;
  fallbacksApplied: number;
  workersUsed: number;
  cacheHitRate: number;
}

export interface ValidateVersionTask {
  packageName: string;
  version: string;
  pacoteOpts: PacoteOptions;
}

export interface WorkerTaskMessage {
  type: 'filter-versions';
  id: string;
  versions: string[];
  range: string;
}

export interface WorkerResultMessage {
  type: 'filter-versions-result';
  id: string;
  candidates: string[];
  error?: string;
}
