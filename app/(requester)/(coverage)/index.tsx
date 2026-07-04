import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Clock } from 'lucide-react-native';
import { COLORS, TYPOGRAPHY, SPACING, RADIUS } from '@/constants/Theme';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { TAB_BAR_HEIGHT } from '@/contexts/TabBarVisibilityContext';

const SUPABASE_URL = 'https://juilousufwlsiqdcgllu.supabase.co';

type CoverageSession = {
  id: string;
  request_id: string;
  doctor_id: string;
  requester_id: string;
  hospital_name: string;
  hospital_address: string;
  shift_date: string;
  shift_start: string;
  shift_end: string;
  shift_type: string;
  coverage_type: string;
  status: 'upcoming' | 'active' | 'paused' | 'completed' | 'cancelled';
  started_at: string | null;
  ended_at: string | null;
  paused_at: string | null;
  doctor_name: string;
  doctor_mdcn: string;
  doctor_rating: number;
  doctor_reliability: number;
  doctor_phone: string | null;
  requester_name: string;
  requester_phone: string | null;
  created_at: string;
};

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
}

function getInitials(name: string): string {
  const parts = name.replace(/^Dr\.?\s*/i, '').trim().split(' ');
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  return parts[0]?.[0]?.toUpperCase() ?? '?';
}

function EmptyState({ message }: { message: string }) {
  return (
    <View style={{ alignItems: 'center', marginTop: SPACING.xxxl }}>
      <View
        style={{
          width: 64,
          height: 64,
          borderRadius: RADIUS.full,
          backgroundColor: '#EBEBEB',
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: SPACING.base,
        }}
      >
        <Clock size={28} color={COLORS.textTertiary} />
      </View>
      <Text style={[TYPOGRAPHY.body, { color: COLORS.textSecondary, textAlign: 'center', paddingHorizontal: SPACING.xl }]}>
        {message}
      </Text>
    </View>
  );
}

interface RequesterCardProps {
  session: CoverageSession;
}

function RequesterCard({ session }: RequesterCardProps) {
  const shiftStart = formatTime(session.shift_start);
  const shiftEnd = formatTime(session.shift_end);
  const dayLabel = session.shift_date
    ? new Date(session.shift_date).toLocaleDateString('en-US', { weekday: 'short' })
    : '';
  const shiftSummary = `${session.shift_type} · ${dayLabel} · ${shiftStart} – ${shiftEnd}`;

  const ratingDisplay = Number(session.doctor_rating).toFixed(1);
  const reliabilityDisplay = Math.round(Number(session.doctor_reliability));

  return (
    <View
      style={[
        {
          backgroundColor: '#FFFFFF',
          borderRadius: 20,
          marginBottom: 12,
          overflow: 'hidden',
          opacity: 0.7,
        },
        Platform.OS === 'ios'
          ? { boxShadow: '0 2px 8px rgba(0,0,0,0.07)' }
          : { elevation: 3 },
      ]}
    >
      <View style={{ padding: 16 }}>
        {/* Doctor info */}
        <Text style={{ fontSize: 16, fontFamily: 'Inter_600SemiBold', color: '#1C1C1E' }} numberOfLines={1}>
          {session.doctor_name}
        </Text>

        {/* MDCN · ★ rating · ● reliability */}
        <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 3, gap: 6 }}>
          <Text style={{ fontSize: 12, fontFamily: 'Inter_400Regular', color: '#71717A' }}>
            {session.doctor_mdcn || 'MDCN/R/—'}
          </Text>
          <Text style={{ color: '#D4D4D8', fontSize: 12 }}>·</Text>
          <Text style={{ fontSize: 12, color: '#F4A261' }}>★</Text>
          <Text style={{ fontSize: 12, fontFamily: 'Inter_600SemiBold', color: '#F4A261' }}>{ratingDisplay}</Text>
          <Text style={{ color: '#D4D4D8', fontSize: 12 }}>·</Text>
          <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: '#2DC653' }} />
          <Text style={{ fontSize: 12, fontFamily: 'Inter_600SemiBold', color: '#2DC653' }}>{reliabilityDisplay}%</Text>
        </View>

        {/* Shift summary */}
        <Text style={{ fontSize: 12, fontFamily: 'Inter_400Regular', color: '#71717A', marginTop: 3 }} numberOfLines={1}>
          {shiftSummary}
        </Text>

        {/* Ended timestamp */}
        {session.ended_at && (
          <Text style={{ fontSize: 12, color: '#A1A1AA', marginTop: 8 }}>
            {'Ended: '}{new Date(session.ended_at).toLocaleDateString('en-US', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}
          </Text>
        )}
      </View>
    </View>
  );
}

export default function RequesterCoverageScreen() {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const [historySessions, setHistorySessions] = useState<CoverageSession[]>([]);
  const [loading, setLoading] = useState(true);

  const getAccessToken = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token ?? null;
  }, []);

  const fetchSessions = useCallback(async () => {
    console.log('[RequesterCoverage] Fetching history sessions');
    setLoading(true);
    try {
      const token = await getAccessToken();
      if (!token) {
        console.log('[RequesterCoverage] No access token available');
        return;
      }

      const historyRes = await fetch(
        `${SUPABASE_URL}/functions/v1/get-coverage-sessions?role=requester&status=completed,cancelled`,
        { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } }
      );

      if (historyRes.ok) {
        const data = await historyRes.json();
        console.log('[RequesterCoverage] History sessions fetched:', data?.sessions?.length ?? 0);
        setHistorySessions(data?.sessions ?? []);
      } else {
        const errText = await historyRes.text();
        console.log('[RequesterCoverage] History fetch error:', historyRes.status, errText);
      }
    } catch (err) {
      console.log('[RequesterCoverage] Fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, [getAccessToken]);

  useEffect(() => {
    fetchSessions();
  }, [fetchSessions]);

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: '#F7F7F5' }}
      contentContainerStyle={{
        paddingTop: insets.top + 24,
        paddingHorizontal: SPACING.base,
        paddingBottom: TAB_BAR_HEIGHT + insets.bottom + 16,
      }}
      showsVerticalScrollIndicator={false}
    >
      <Text style={[TYPOGRAPHY.h1, { color: COLORS.text, marginBottom: 4 }]}>
        Coverage
      </Text>
      <Text style={[TYPOGRAPHY.caption, { color: COLORS.textSecondary, marginBottom: SPACING.xl }]}>
        Your coverage continuity
      </Text>

      {/* Content */}
      {loading ? (
        <ActivityIndicator size="large" color="#0066CC" style={{ marginTop: SPACING.xxxl }} />
      ) : historySessions.length === 0 ? (
        <EmptyState message="No past coverage yet." />
      ) : (
        historySessions.map(session => (
          <RequesterCard
            key={session.id}
            session={session}
          />
        ))
      )}
    </ScrollView>
  );
}
