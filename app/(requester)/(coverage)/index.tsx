import React, { useRef, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  ActivityIndicator,
  Animated,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Clock } from 'lucide-react-native';
import { COLORS, TYPOGRAPHY, SPACING, RADIUS } from '@/constants/Theme';
import { getValidToken } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { TAB_BAR_HEIGHT } from '@/contexts/TabBarVisibilityContext';
import { useTabData } from '@/hooks/useTabData';

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

function SkeletonCard() {
  const opacity = useRef(new Animated.Value(0.3)).current;
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.7, duration: 900, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.3, duration: 900, useNativeDriver: true }),
      ]),
    ).start();
  }, [opacity]);
  return (
    <Animated.View style={{ opacity, backgroundColor: '#FFFFFF', borderRadius: 20, padding: 16, marginBottom: 12 }}>
      <View style={{ width: '60%', height: 16, borderRadius: 8, backgroundColor: '#E5E5E5', marginBottom: 8 }} />
      <View style={{ width: '40%', height: 12, borderRadius: 6, backgroundColor: '#E5E5E5', marginBottom: 6 }} />
      <View style={{ width: '80%', height: 12, borderRadius: 6, backgroundColor: '#E5E5E5' }} />
    </Animated.View>
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
        <Text style={{ fontSize: 16, fontFamily: 'Inter_600SemiBold', color: '#1C1C1E' }} numberOfLines={1}>
          {session.doctor_name}
        </Text>

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

        <Text style={{ fontSize: 12, fontFamily: 'Inter_400Regular', color: '#71717A', marginTop: 3 }} numberOfLines={1}>
          {shiftSummary}
        </Text>

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

  const cacheKey = `requester-coverage-${user?.id ?? 'anon'}`;

  const { data: historySessions, loading, refreshing } = useTabData<CoverageSession[]>({
    cacheKey,
    fetcher: async () => {
      console.log('[RequesterCoverage] Fetching history sessions');
      const token = await getValidToken();
      if (!token) {
        console.log('[RequesterCoverage] No access token available');
        return [];
      }
      const res = await fetch(
        `${SUPABASE_URL}/functions/v1/get-coverage-sessions?role=requester&status=completed,cancelled`,
        { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } },
      );
      if (!res.ok) {
        const errText = await res.text();
        console.log('[RequesterCoverage] Fetch error:', res.status, errText);
        throw new Error('Failed to load coverage history');
      }
      const data = await res.json();
      console.log('[RequesterCoverage] History sessions fetched:', data?.sessions?.length ?? 0);
      return data?.sessions ?? [];
    },
    alwaysRefresh: true,
  });

  const sessions = historySessions ?? [];

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

      {/* Background refresh indicator */}
      {refreshing && (
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginBottom: 8, gap: 6 }}>
          <ActivityIndicator size="small" color="#0066CC" />
          <Text style={{ fontSize: 12, color: '#8E8E93' }}>Updating...</Text>
        </View>
      )}

      {/* Content */}
      {loading ? (
        <>
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </>
      ) : sessions.length === 0 ? (
        <EmptyState message="No past coverage yet." />
      ) : (
        sessions.map(session => (
          <RequesterCard
            key={session.id}
            session={session}
          />
        ))
      )}
    </ScrollView>
  );
}
