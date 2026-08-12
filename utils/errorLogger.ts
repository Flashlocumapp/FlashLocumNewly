// Global error logging for runtime errors
// Captures console.log/warn/error and sends to Newly server for AI debugging

import { Platform } from "react-native";
import Constants from "expo-constants";

// Declare __DEV__ global (React Native global for development mode detection)
declare const __DEV__: boolean;

// Simple debouncing to prevent duplicate logs
const recentLogs: { [key: string]: boolean } = {};
const clearLogAfterDelay = (logKey: string) => {
  setTimeout(() => delete recentLogs[logKey], 100);
};

// Messages to mute (noisy warnings that don't help debugging)
const MUTED_MESSAGES = [
  'each child in a list should have a unique "key" prop',
  'Each child in a list should have a unique "key" prop',
];

// Check if a message should be muted
const shouldMuteMessage = (message: string): boolean => {
  return MUTED_MESSAGES.some(muted => message.includes(muted));
};

// Queue for batching logs
let logQueue: { level: string; message: string; source: string; timestamp: string; platform: string }[] = [];
let flushTimeout: ReturnType<typeof setTimeout> | null = null;
const FLUSH_INTERVAL = 500; // Flush every 500ms

// Get a friendly platform name
const getPlatformName = (): string => {
  switch (Platform.OS) {
    case 'ios':
      return 'iOS';
    case 'android':
      return 'Android';
    case 'web':
      return 'Web';
    default:
      return Platform.OS;
  }
};

// Cache the log server URL
let cachedLogServerUrl: string | null = null;
let urlChecked = false;

// Get the log server URL based on platform
const getLogServerUrl = (): string | null => {
  if (urlChecked) return cachedLogServerUrl;

  try {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      // For web, use the current origin
      cachedLogServerUrl = `${window.location.origin}/natively-logs`;
    } else {
      // For native, try to get the Expo dev server URL
      // experienceUrl format: exp://xxx.ngrok.io/... or exp://192.168.1.1:8081/...
      const experienceUrl = (Constants as any).experienceUrl;
      if (experienceUrl) {
        // Convert exp:// to https:// (for tunnels) or http:// (for local)
        let baseUrl = experienceUrl
          .replace('exp://', 'https://')
          .split('/')[0] + '//' + experienceUrl.replace('exp://', '').split('/')[0];

        // If it looks like a local IP, use http
        if (baseUrl.includes('192.168.') || baseUrl.includes('10.') || baseUrl.includes('localhost')) {
          baseUrl = baseUrl.replace('https://', 'http://');
        }

        cachedLogServerUrl = `${baseUrl}/natively-logs`;
      } else {
        // Fallback: try to use manifest hostUri
        const hostUri = Constants.expoConfig?.hostUri || (Constants as any).manifest?.hostUri;
        if (hostUri) {
          const protocol = hostUri.includes('ngrok') || hostUri.includes('.io') ? 'https' : 'http';
          cachedLogServerUrl = `${protocol}://${hostUri.split('/')[0]}/natively-logs`;
        }
      }
    }
  } catch (e) {
    // Silently fail
  }

  urlChecked = true;
  return cachedLogServerUrl;
};

// Track if we've logged fetch errors to avoid spam
let fetchErrorLogged = false;

// Flush the log queue to server
const flushLogs = async () => {
  if (logQueue.length === 0) return;

  const logsToSend = [...logQueue];
  logQueue = [];
  flushTimeout = null;

  const url = getLogServerUrl();
  if (!url) {
    // URL not available, silently skip
    return;
  }

  for (const log of logsToSend) {
    try {
      fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(log),
      }).catch((e) => {
        // Log fetch errors only once to avoid spam
        if (!fetchErrorLogged) {
          fetchErrorLogged = true;
          // Use a different method to avoid recursion - write directly without going through our intercept
          if (typeof window !== 'undefined' && window.console) {
            (window.console as any).__proto__.log.call(console, '[Newly] Fetch error (will not repeat):', e.message || e);
          }
        }
      });
    } catch (e) {
      // Silently ignore sync errors
    }
  }
};

// Queue a log to be sent
const queueLog = (level: string, message: string, source: string = '') => {
  const logKey = `${level}:${message}`;

  // Skip duplicates
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

  // Schedule flush if not already scheduled
  if (!flushTimeout) {
    flushTimeout = setTimeout(flushLogs, FLUSH_INTERVAL);
  }
};

// Function to send errors to parent window (React frontend) - for web iframe mode
const sendErrorToParent = (level: string, message: string, data: any) => {
  // Create a simple key to identify duplicate errors
  const errorKey = `${level}:${message}:${JSON.stringify(data)}`;

  // Skip if we've seen this exact error recently
  if (recentLogs[errorKey]) {
    return;
  }

  // Mark this error as seen and schedule cleanup
  recentLogs[errorKey] = true;
  clearLogAfterDelay(errorKey);

  try {
    if (typeof window !== 'undefined' && window.parent && window.parent !== window) {
      window.parent.postMessage({
        type: 'EXPO_ERROR',
        level: level,
        message: message,
        data: data,
        timestamp: new Date().toISOString(),
        userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown',
        source: 'expo-template'
      }, '*');
    }
  } catch (error) {
    // Silently fail
  }
};

// Function to get caller information from stack trace
const getCallerInfo = (): string => {
  const stack = new Error().stack || '';
  const lines = stack.split('\n');

  // Skip the first few lines (Error, getCallerInfo, stringifyArgs, console override, setupErrorLogging internals)
  for (let i = 3; i < lines.length; i++) {
    const line = lines[i];

    // Skip internal errorLogger calls and node_modules
    if (line.includes('errorLogger') || line.includes('node_modules')) {
      continue;
    }

    // Try multiple patterns to extract source location
    // Pattern 1: Standard format "at Component (file.tsx:10:5)"
    let match = line.match(/at\s+\S+\s+\((?:.*\/)?([^/\s:)]+\.[jt]sx?):(\d+):(\d+)\)/);
    if (match) {
      return `${match[1]}:${match[2]}`;
    }

    // Pattern 2: Anonymous function "at file.tsx:10:5"
    match = line.match(/at\s+(?:.*\/)?([^/\s:)]+\.[jt]sx?):(\d+):(\d+)/);
    if (match) {
      return `${match[1]}:${match[2]}`;
    }

    // Pattern 3: Hermes/React Native bundle format
    match = line.match(/(?:.*\/)?([^/\s:)]+\.[jt]sx?):(\d+):\d+/);
    if (match) {
      return `${match[1]}:${match[2]}`;
    }

    // Pattern 4: Look for app/ or components/ paths specifically
    if (line.includes('app/') || line.includes('components/') || line.includes('screens/') || line.includes('hooks/') || line.includes('utils/')) {
      match = line.match(/([^/\s:)]+\.[jt]sx?):(\d+)/);
      if (match) {
        return `${match[1]}:${match[2]}`;
      }
    }
  }

  return '';
};

// Helper to safely stringify arguments
const stringifyArgs = (args: any[]): string => {
  return args.map(arg => {
    if (typeof arg === 'string') return arg;
    if (arg === null) return 'null';
    if (arg === undefined) return 'undefined';
    try {
      return JSON.stringify(arg);
    } catch {
      return String(arg);
    }
  }).join(' ');
};

// Auto-reconnect to Metro when it disconnects.
// Only reloads if the bundle compiles successfully (not 500).
// This prevents wiping Metro's error overlay when there's a compile error.
let _reconnectPoll: ReturnType<typeof setInterval> | null = null;

const attemptMetroReconnect = () => {
  if (_reconnectPoll) return;

  let attempts = 0;
  const MAX_ATTEMPTS = 10;

  _reconnectPoll = setInterval(async () => {
    attempts++;

    if (attempts > MAX_ATTEMPTS) {
      clearInterval(_reconnectPoll!);
      _reconnectPoll = null;
      return;
    }

    try {
      if (typeof window === 'undefined') return;
      const origin = window.location.origin;

      const bundleUrl = `${origin}/index.ts.bundle?platform=web&dev=true`;
      const res = await fetch(bundleUrl, { method: 'HEAD' });

      if (res.ok) {
        // Bundle compiles fine — app is still running, just lost HMR.
        // Don't reload (reloading causes white screen flashes).
        // Metro will reconnect HMR on its own.
        clearInterval(_reconnectPoll!);
        _reconnectPoll = null;
      } else if (res.status === 500) {
        // Compile error — reload so metro.config.js error UI takes over
        // (it has its own auto-recovery polling for when the error is fixed).
        clearInterval(_reconnectPoll!);
        _reconnectPoll = null;
        window.location.reload();
      }
      // Other non-OK statuses (502, 503, etc.) are transient — keep polling
    } catch {
      // Network error — Metro is down, keep polling
    }
  }, 2000);
};

export const setupErrorLogging = () => {
  // Don't initialize in production builds - no need for log forwarding
  if (!__DEV__) {
    return;
  }

  // Store original console methods BEFORE any modifications
  const originalConsoleLog = console.log;
  const originalConsoleWarn = console.warn;
  const originalConsoleError = console.error;

  // Log initialization info using original console (not intercepted)
  const logServerUrl = getLogServerUrl();
  originalConsoleLog('[Newly] Setting up error logging...');
  originalConsoleLog('[Newly] Log server URL:', logServerUrl || 'NOT AVAILABLE');
  originalConsoleLog('[Newly] Platform:', Platform.OS);

  // Override console.log to capture and send to server
  console.log = (...args: any[]) => {
    // Always call original first
    originalConsoleLog.apply(console, args);

    // Queue log for sending to server
    const message = stringifyArgs(args);
    const source = getCallerInfo();
    queueLog('log', message, source);
  };

  // Override console.warn to capture and send to server
  console.warn = (...args: any[]) => {
    // Always call original first
    originalConsoleWarn.apply(console, args);

    // Queue log for sending to server (skip muted messages)
    const message = stringifyArgs(args);
    if (shouldMuteMessage(message)) return;

    const source = getCallerInfo();
    queueLog('warn', message, source);

    // Auto-reconnect when Metro disconnects (only reloads if bundle compiles)
    if (message.includes('Disconnected from Metro')) {
      attemptMetroReconnect();
    }
  };

  // Override console.error to capture and send to server
  console.error = (...args: any[]) => {
    // Queue log for sending to server (skip muted messages)
    const message = stringifyArgs(args);
    if (shouldMuteMessage(message)) return;

    // Always call original first
    originalConsoleError.apply(console, args);

    const source = getCallerInfo();
    queueLog('error', message, source);

    // Also send to parent window for web iframe mode
    sendErrorToParent('error', 'Console Error', message);
  };

  // Capture unhandled errors in web environment
  if (typeof window !== 'undefined') {
    // Override window.onerror to catch JavaScript errors
    window.onerror = (message, source, lineno, colno, error) => {
      const sourceFile = source ? source.split('/').pop() : 'unknown';
      const errorMessage = `RUNTIME ERROR: ${message} at ${sourceFile}:${lineno}:${colno}`;

      queueLog('error', errorMessage, `${sourceFile}:${lineno}:${colno}`);
      sendErrorToParent('error', 'JavaScript Runtime Error', {
        message,
        source: `${sourceFile}:${lineno}:${colno}`,
        error: error?.stack || error,
      });

      return false; // Don't prevent default error handling
    };

    // Capture unhandled promise rejections (web only)
    if (Platform.OS === 'web') {
      window.addEventListener('unhandledrejection', (event) => {
        const message = `UNHANDLED PROMISE REJECTION: ${event.reason}`;
        queueLog('error', message, '');
        sendErrorToParent('error', 'Unhandled Promise Rejection', { reason: event.reason });
      });
    }
  }
};

// Auto-initialize logging when this module is imported
// Only run in development mode - production apps don't need log forwarding
if (__DEV__) {
  setupErrorLogging();
}

// ─── Operational incident logger ─────────────────────────────────────────────
// These functions write to the error_events table via the log-incident Edge Function.
// All calls are fire-and-forget — they never throw and never block the caller.

import { supabase } from '@/lib/supabase';

const LOG_INCIDENT_URL = 'https://juilousufwlsiqdcgllu.supabase.co/functions/v1/log-incident';

function generateActionId(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
}

async function postIncident(payload: Record<string, unknown>): Promise<void> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) return;
    await fetch(LOG_INCIDENT_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`,
      },
      body: JSON.stringify(payload),
    });
  } catch {
    // Silently swallow — logging must never crash the app
  }
}

export interface IncidentPayload {
  severity: 'critical' | 'error' | 'warning' | 'info';
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

/** Log a one-off operational incident (no lifecycle). Fire-and-forget. */
export function logIncident(payload: IncidentPayload): void {
  void postIncident({ ...payload, action: payload.action ?? 'failed' });
}

/** Log the START of a lifecycle-tracked action. Returns a new action_id. Fire-and-forget. */
export function logLifecycleStarted(
  event_type: string,
  context: Omit<IncidentPayload, 'severity' | 'event_type' | 'action' | 'metadata'> & { metadata?: Record<string, unknown> }
): string {
  const action_id = generateActionId();
  void postIncident({
    severity: 'info',
    event_type,
    action: 'started',
    ...context,
    metadata: { ...context.metadata, action_id },
  });
  return action_id;
}

/** Log successful COMPLETION of a lifecycle-tracked action. Fire-and-forget. */
export function logLifecycleCompleted(
  event_type: string,
  action_id: string,
  context: Omit<IncidentPayload, 'severity' | 'event_type' | 'action' | 'metadata'> & { metadata?: Record<string, unknown> }
): void {
  void postIncident({
    severity: 'info',
    event_type,
    action: 'completed',
    user_action_completed: true,
    ...context,
    metadata: { ...context.metadata, action_id },
  });
}

/** Log FAILURE of a lifecycle-tracked action. Fire-and-forget. */
export function logLifecycleFailed(
  event_type: string,
  action_id: string | null,
  context: Omit<IncidentPayload, 'event_type' | 'action' | 'metadata'> & { metadata?: Record<string, unknown> }
): void {
  void postIncident({
    event_type,
    action: 'failed',
    user_action_completed: false,
    ...context,
    metadata: { ...context.metadata, ...(action_id ? { action_id } : {}) },
  });
}
