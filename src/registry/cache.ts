export type AccessibilityStatus = 'accessible' | 'blocked' | 'error';

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

const DEFAULT_TTL_MS = 10 * 60 * 1000;
const MAX_PACKUMENT_ENTRIES = 2_000;
const MAX_ACCESSIBILITY_ENTRIES = 10_000;

export class RegistryCache {
  private packuments = new Map<string, CacheEntry<Promise<{ versions: Record<string, unknown> }>>>();
  private accessibility = new Map<string, CacheEntry<AccessibilityStatus>>();
  hits = 0;
  misses = 0;

  constructor(private readonly ttlMs = DEFAULT_TTL_MS) {}

  getPackument(key: string): Promise<{ versions: Record<string, unknown> }> | undefined {
    const entry = this.packuments.get(key);
    if (!entry || entry.expiresAt < Date.now()) {
      if (entry) this.packuments.delete(key);
      return undefined;
    }
    this.hits++;
    return entry.value;
  }

  setPackument(
    key: string,
    value: Promise<{ versions: Record<string, unknown> }>,
  ): void {
    if (!this.packuments.has(key)) {
      this.misses++;
    }
    this.evictIfNeeded(this.packuments, MAX_PACKUMENT_ENTRIES);
    this.packuments.set(key, { value, expiresAt: Date.now() + this.ttlMs });
  }

  getAccessibility(key: string): AccessibilityStatus | undefined {
    const entry = this.accessibility.get(key);
    if (!entry || entry.expiresAt < Date.now()) {
      if (entry) this.accessibility.delete(key);
      return undefined;
    }
    this.hits++;
    return entry.value;
  }

  setAccessibility(key: string, status: AccessibilityStatus): void {
    this.evictIfNeeded(this.accessibility, MAX_ACCESSIBILITY_ENTRIES);
    this.accessibility.set(key, { value: status, expiresAt: Date.now() + this.ttlMs });
  }

  get hitRate(): number {
    const total = this.hits + this.misses;
    return total === 0 ? 0 : this.hits / total;
  }

  private evictIfNeeded<T>(map: Map<string, T>, max: number): void {
    if (map.size < max) return;
    const firstKey = map.keys().next().value;
    if (firstKey) map.delete(firstKey);
  }
}
