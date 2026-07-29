// Simple module-level in-memory cache for tab data
// Persists across component unmounts (unlike useState)

type CacheEntry<T> = { data: T; fetchedAt: number };
const cache = new Map<string, CacheEntry<unknown>>();

export const STALE_MS = 30_000; // 30 seconds

export function getCached<T>(key: string): T | null {
  const entry = cache.get(key) as CacheEntry<T> | undefined;
  if (!entry) return null;
  return entry.data;
}

export function setCached<T>(key: string, data: T): void {
  cache.set(key, { data, fetchedAt: Date.now() });
}

export function isStale(key: string): boolean {
  const entry = cache.get(key);
  if (!entry) return true;
  return Date.now() - entry.fetchedAt > STALE_MS;
}

export function invalidate(key: string): void {
  cache.delete(key);
}

export function clearAll(): void {
  console.log('[tabCache] clearAll — wiping all cached tab data');
  cache.clear();
}

// In-flight prefetch promise registry — lets screens await an in-progress prefetch
// instead of firing a duplicate request or showing a loading state.
const prefetchPromises = new Map<string, Promise<void>>();

export function setPrefetchPromise(key: string, promise: Promise<void>): void {
  prefetchPromises.set(key, promise);
}

export function clearPrefetchPromise(key: string): void {
  prefetchPromises.delete(key);
}

export function getPrefetchPromise(key: string): Promise<void> | null {
  return prefetchPromises.get(key) ?? null;
}
