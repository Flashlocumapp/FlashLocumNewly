/**
 * PollingManager
 *
 * Centralized manager for named, temporary polling sessions.
 * Each session polls every 5 seconds and stops immediately when
 * either the Realtime broadcast or the poll itself confirms the
 * expected database state.
 *
 * Rules:
 * - Only one session per named key at a time.
 * - Calling start() while a session is already running for that key
 *   stops the old one first.
 * - stop() is idempotent.
 * - stopAll() cleans up everything (call on logout / app close).
 */

type PollFn = () => Promise<boolean>; // return true = confirmed, stop polling

interface Session {
  timer: ReturnType<typeof setTimeout> | null;
  active: boolean;
}

const sessions = new Map<string, Session>();

function _schedule(key: string, fn: PollFn, intervalMs: number): void {
  const session = sessions.get(key);
  if (!session || !session.active) return;

  session.timer = setTimeout(async () => {
    const s = sessions.get(key);
    if (!s || !s.active) return;

    let confirmed = false;
    try {
      confirmed = await fn();
    } catch {
      // swallow — reschedule
    }

    if (confirmed) {
      stop(key);
    } else {
      _schedule(key, fn, intervalMs);
    }
  }, intervalMs);
}

export function start(key: string, fn: PollFn, intervalMs = 5000): void {
  console.log('[PollingManager] start:', key);
  // Stop any existing session for this key first
  stop(key);

  const session: Session = { timer: null, active: true };
  sessions.set(key, session);

  // Run first tick immediately, then schedule subsequent ticks
  (async () => {
    const s = sessions.get(key);
    if (!s || !s.active) return;
    let confirmed = false;
    try {
      confirmed = await fn();
    } catch {}
    if (confirmed) {
      console.log('[PollingManager] confirmed on first tick:', key);
      stop(key);
    } else {
      _schedule(key, fn, intervalMs);
    }
  })();
}

export function stop(key: string): void {
  const session = sessions.get(key);
  if (!session) return;
  console.log('[PollingManager] stop:', key);
  session.active = false;
  if (session.timer !== null) {
    clearTimeout(session.timer);
    session.timer = null;
  }
  sessions.delete(key);
}

export function stopAll(): void {
  console.log('[PollingManager] stopAll — clearing', sessions.size, 'sessions');
  for (const key of sessions.keys()) {
    stop(key);
  }
}

export function isRunning(key: string): boolean {
  return sessions.has(key) && (sessions.get(key)?.active ?? false);
}

const PollingManager = { start, stop, stopAll, isRunning };
export default PollingManager;
