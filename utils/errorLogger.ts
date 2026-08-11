import { Platform } from 'react-native';
import * as Application from 'expo-application';
import { supabase } from '@/lib/supabase';
import Constants from 'expo-constants';

// ─── F7 Incident / Lifecycle Logging ────────────────────────────────────────

export type IncidentSeverity = 'critical' | 'error' | 'warning' | 'info';

export interface IncidentPayload {
  severity: IncidentSeverity;
  event_type: string;
  action?: string;
  failure_stage?: string;
  active_role?: 'doctor' | 'requester';
  screen?: string;
  route?: string;
  request_id?: string;
  session_id?: string;
  payment_intent_id?: string;
  edge_function?: string;
  provider?: string;
  provider_status?: string;
  recovered?: boolean;
  recovery_action?: string;
  user_action_completed?: boolean;
  message?: string;
  stack?: string;
  metadata?: Record<string, unknown>;
}

const SUPABASE_URL = 'https://juilousufwlsiqdcgllu.supabase.co';

function generateActionId(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

export async function logIncident(payload: IncidentPayload): Promise<void> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) return;

    const body: Record<string, unknown> = {
      ...payload,
      app_version: Application.nativeApplicationVersion ?? undefined,
      build_number: Application.nativeBuildVersion ?? undefined,
      platform: Platform.OS,
      os_version:
        Platform.OS === 'web'
          ? 'web'
          : `${Platform.OS === 'ios' ? 'iOS' : 'Android'} ${Platform.Version}`,
    };

    fetch(`${SUPABASE_URL}/functions/v1/log-incident`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify(body),
    }).catch(() => {});
  } catch {
    // Never crash the app
  }
}

export function logLifecycleStarted(
  event_type: string,
  context: Omit<IncidentPayload, 'severity' | 'event_type' | 'action'>
): string {
  const actionId = generateActionId();
  logIncident({
    severity: 'info',
    event_type,
    action: 'started',
    ...context,
    metadata: { ...context.metadata, action_id: actionId },
  });
  return actionId;
}

export function logLifecycleCompleted(
  event_type: string,
  actionId: string,
  context: Omit<IncidentPayload, 'severity' | 'event_type' | 'action'>
): void {
  logIncident({
    severity: 'info',
    event_type,
    action: 'completed',
    user_action_completed: true,
    ...context,
    metadata: { ...context.metadata, action_id: actionId },
  });
}

export function logLifecycleFailed(
  event_type: string,
  actionId: string | null,
  context: Omit<IncidentPayload, 'event_type' | 'action'>
): void {
  logIncident({
    event_type,
    action: actionId ? 'failed' : undefined,
    user_action_completed: false,
    ...context,
    metadata: actionId
      ? { ...context.metadata, action_id: actionId }
      : context.metadata,
  });
}

// ─── Console capture / setupErrorLogging ────────────────────────────────────
// Kept from the current file so existing call sites are not broken.

declare const __DEV__: boolean;

const MUTED_MESSAGES = [
  'each child in a list should have a unique "key" prop',
  'Each child in a list should have a unique "key" prop',
];

const shouldMuteMessage = (message: string): boolean =>
  MUTED_MESSAGES.some(muted => message.includes(muted));

const recentLogs: { [key: string]: boolean } = {};
const clearLogAfterDelay = (logKey: string) => {
  setTimeout(() => delete recentLogs[logKey], 100);
};

let logQueue: { level: string; message: string; source: string; timestamp: string; platform: string }[] = [];
let flushTimeout: ReturnType<typeof setTimeout> | null = null;
const FLUSH_INTERVAL = 500;

const getPlatformName = (): string => {
  switch (Platform.OS) {
    case 'ios': return 'iOS';
    case 'android': return 'Android';
    default: return Platform.OS;
  }
};

const getAppVersion = (): string => {
  try {
    return Constants.expoConfig?.version ?? 'unknown';
  } catch {
    return 'unknown';
  }
};

const flushLogs = async () => {
  if (logQueue.length === 0) return;
  const logsToSend = [...logQueue];
  logQueue = [];
  flushTimeout = null;
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) return;
    fetch(`${SUPABASE_URL}/functions/v1/log-incident`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ logs: logsToSend }),
    }).catch(() => {});
  } catch {
    // Never crash the app
  }
};

const queueLog = (level: string, message: string, source: string) => {
  if (shouldMuteMessage(message)) return;
  const logKey = `${level}:${message}`;
  if (recentLogs[logKey]) return;
  recentLogs[logKey] = true;
  clearLogAfterDelay(logKey);
  logQueue.push({
    level,
    message,
    source,
    timestamp: new Date().toISOString(),
    platform: getPlatformName(),
  });
  if (flushTimeout) clearTimeout(flushTimeout);
  flushTimeout = setTimeout(flushLogs, FLUSH_INTERVAL);
};

export const setupErrorLogging = () => {
  if (__DEV__) return; // Only capture in production
  const originalConsole = {
    log: console.log.bind(console),
    warn: console.warn.bind(console),
    error: console.error.bind(console),
  };
  console.log = (...args: unknown[]) => {
    originalConsole.log(...args);
    queueLog('log', args.map(String).join(' '), 'console.log');
  };
  console.warn = (...args: unknown[]) => {
    originalConsole.warn(...args);
    queueLog('warn', args.map(String).join(' '), 'console.warn');
  };
  console.error = (...args: unknown[]) => {
    originalConsole.error(...args);
    queueLog('error', args.map(String).join(' '), 'console.error');
  };
};
