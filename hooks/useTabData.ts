import { useState, useEffect, useCallback, useRef } from 'react';
import { getCached, setCached, isStale } from '@/utils/tabCache';

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

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const doFetch = useCallback(
    async (isBackground: boolean) => {
      console.log('[useTabData] Fetching', cacheKey, isBackground ? '(background)' : '(first load)');
      if (isBackground) setRefreshing(true);
      else setLoading(true);
      setError(null);
      try {
        const result = await fetcher();
        if (!mountedRef.current) return;
        setCached(cacheKey, result);
        setData(result);
        console.log('[useTabData] Fetch complete', cacheKey);
      } catch (e: unknown) {
        if (!mountedRef.current) return;
        const msg = e instanceof Error ? e.message : 'Failed to load';
        console.log('[useTabData] Fetch error', cacheKey, msg);
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
      doFetch(false); // first load — show spinner
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
