import { useState, useEffect, useCallback, useRef } from 'react';
import { getCached, setCached, isStale, getPrefetchPromise } from '@/utils/tabCache';

interface UseTabDataOptions<T> {
  cacheKey: string;
  fetcher: () => Promise<T>;
  /** If true, always refetch in background even if cache is fresh. Default false. */
  alwaysRefresh?: boolean;
}

interface UseTabDataResult<T> {
  data: T | null;
  loading: boolean;      // true ONLY on first load (no cached data)
  refreshing: boolean;   // true during background refresh (cached data visible)
  error: string | null;
  refresh: () => void;
}

export function useTabData<T>({
  cacheKey,
  fetcher,
  alwaysRefresh = false,
}: UseTabDataOptions<T>): UseTabDataResult<T> {
  const cached = getCached<T>(cacheKey);
  const [data, setData] = useState<T | null>(cached);
  const [loading, setLoading] = useState(cached === null);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);
  // Always holds the latest data value so doFetch can compare without stale closure
  const dataRef = useRef<T | null>(cached);

  useEffect(() => {
    dataRef.current = data;
  }, [data]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const doFetch = useCallback(
    async (isBackground: boolean) => {
      if (isBackground) setRefreshing(true);
      else setLoading(true);
      setError(null);
      try {
        const result = await fetcher();
        if (!mountedRef.current) return;

        const currentData = dataRef.current;

        if (Array.isArray(result) && Array.isArray(currentData)) {
          // Surgical merge using 'id' field as key
          const prev = currentData as unknown as { id: unknown }[];
          const next = result as unknown as { id: unknown }[];

          const merged = [...prev];
          let changed = false;

          // Update existing rows and insert new ones at the front
          for (const row of next) {
            const idx = merged.findIndex((s) => s.id === row.id);
            if (idx !== -1) {
              if (JSON.stringify(merged[idx]) !== JSON.stringify(row)) {
                merged[idx] = { ...merged[idx], ...row };
                changed = true;
              }
            } else {
              merged.unshift(row);
              changed = true;
            }
          }

          // Remove rows whose IDs are no longer present
          const newIds = new Set(next.map((r) => r.id));
          const filtered = merged.filter((r) => newIds.has(r.id));
          if (filtered.length !== merged.length) changed = true;

          if (changed) {
            const typedFiltered = filtered as unknown as T;
            setCached(cacheKey, typedFiltered);
            setData(typedFiltered);
          }
        } else {
          // Non-array (plain object): compare by serialisation
          if (JSON.stringify(result) !== JSON.stringify(currentData)) {
            setCached(cacheKey, result);
            setData(result);
          }
        }
      } catch (e: unknown) {
        if (!mountedRef.current) return;
        const msg = e instanceof Error ? e.message : 'Failed to load';
        setError(msg);
      } finally {
        if (mountedRef.current) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [cacheKey, fetcher],
  );

  useEffect(() => {
    const hasCache = getCached(cacheKey) !== null;
    const stale = isStale(cacheKey);
    if (!hasCache) {
      // Check for an in-flight prefetch — await it silently instead of showing a spinner
      const inflight = getPrefetchPromise(cacheKey);
      if (inflight) {
        inflight.then(() => {
          if (!mountedRef.current) return;
          const prefetched = getCached<T>(cacheKey);
          if (prefetched !== null) {
            setData(prefetched);
            dataRef.current = prefetched;
            setLoading(false);
          } else {
            // Prefetch failed or returned nothing — fall back to own fetch
            doFetch(false);
          }
        });
      } else {
        doFetch(false); // first load — show spinner
      }
    } else if (stale || alwaysRefresh) {
      doFetch(true);  // background refresh — keep showing cached data
    }
    // If cache is fresh and alwaysRefresh=false, do nothing
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cacheKey]);

  const refresh = useCallback(() => {
    const hasCache = getCached(cacheKey) !== null;
    doFetch(!hasCache);
  }, [cacheKey, doFetch]);

  return { data, loading, refreshing, error, refresh };
}
