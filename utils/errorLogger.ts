import { Platform } from 'react-native';
import * as Application from 'expo-application';
import { supabase } from '@/lib/supabase';

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
