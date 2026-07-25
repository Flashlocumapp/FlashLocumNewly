import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, Platform } from 'react-native';
import { supabase } from '@/lib/supabase';
import type { CoverageSession } from '@/contexts/DoctorDispatchContext';
import { buildShiftPillText, EnvironmentBadge } from '@/components/sessionUtils';

// Re-export shared utilities so existing imports from this file continue to work
export { buildShiftPillText, EnvironmentBadge } from '@/components/sessionUtils';

export function DoctorUpcomingCoverageCard({ session, onCall, onCancel, variant = 'light' }: {
  session: CoverageSession;
  onCall: (session: CoverageSession) => void;
  onCancel: (session: CoverageSession) => void;
  variant?: 'light' | 'dark';
}) {
  const [liveRating, setLiveRating] = useState<number | null>(null);
  const [liveReliability, setLiveReliability] = useState<number | null>(null);

  useEffect(() => {
    if (!session.requester_id) return;
    console.log('[DoctorUpcomingCoverageCard] Fetching live requester stats for requester_id:', session.requester_id);
    supabase
      .from('requester_profiles')
      .select('rating, reliability')
      .eq('id', session.requester_id)
      .single()
      .then(({ data, error }) => {
        if (error || !data) {
          console.log('[DoctorUpcomingCoverageCard] Requester stats fetch failed, using defaults:', error?.message);
          setLiveRating(5.0);
          setLiveReliability(100);
        } else {
          console.log('[DoctorUpcomingCoverageCard] Live requester stats fetched:', data);
          setLiveRating(data.rating ?? 5.0);
          setLiveReliability(data.reliability ?? 100);
        }
      });
  }, [session.requester_id]);

  const ratingDisplay = liveRating != null ? liveRating.toFixed(1) : '--';
  const reliabilityDisplay = liveReliability != null ? `${Math.round(liveReliability)}` : '--';
  const shiftPillText = buildShiftPillText(session);
  const canCancel = session.status === 'upcoming';

  const statusLabel = session.status === 'paused'
    ? 'PAUSED COVERAGE'
    : session.status === 'payment_pending'
    ? 'PAYMENT PENDING'
    : 'UPCOMING COVERAGE';

  const isDark = variant === 'dark';
  const cardBg = isDark ? '#2C2C2E' : '#FFFFFF';
  const primaryText = isDark ? '#FFFFFF' : '#1C1C1E';
  const pillBg = isDark ? '#3A3A3C' : '#F0F0F0';
  const pillText = isDark ? '#FFFFFF' : '#1C1C1E';
  const cancelBg = '#FFFFFF';
  const cancelBorder = '#E5E5EA';
  const cancelText = '#1C1C1E';
  const callBg = isDark ? '#0A0A0A' : '#1C1C1E';

  return (
    <View style={{
      backgroundColor: cardBg,
      borderRadius: 20,
      padding: 16,
      marginBottom: 12,
      ...(Platform.OS === 'ios'
        ? { boxShadow: '0 2px 8px rgba(0,0,0,0.08)' } as any
        : { elevation: 4 }),
    }}>
      {/* Header row */}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <Text style={{ fontSize: 11, letterSpacing: 1.2, color: '#8E8E93', fontFamily: 'Inter_600SemiBold' }}>
          {statusLabel}
        </Text>
        <EnvironmentBadge environment={session.environment ?? 'Normal'} />
      </View>

      {/* Hospital name + rating row */}
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
        <Text style={{ fontSize: 20, fontFamily: 'Inter_700Bold', color: primaryText, flexShrink: 1 }} numberOfLines={1}>
          {session.hospital_name}
        </Text>
        <Text style={{ fontSize: 13, color: '#8E8E93', fontFamily: 'Inter_400Regular', marginHorizontal: 6 }}>{'|'}</Text>
        <Text style={{ fontSize: 13, color: '#F4A261', fontFamily: 'Inter_400Regular' }}>{'★ '}</Text>
        <Text style={{ fontSize: 13, color: primaryText, fontFamily: 'Inter_400Regular' }}>{ratingDisplay}</Text>
        <View style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: '#34C759', marginHorizontal: 6 }} />
        <Text style={{ fontSize: 13, color: primaryText, fontFamily: 'Inter_400Regular' }}>{reliabilityDisplay}</Text>
        <Text style={{ fontSize: 13, color: primaryText, fontFamily: 'Inter_400Regular' }}>{'%'}</Text>
      </View>

      {/* Address */}
      <Text style={{ fontSize: 13, color: '#8E8E93', fontFamily: 'Inter_400Regular' }} numberOfLines={1}>
        {session.hospital_address}
      </Text>

      {/* Shift pill */}
      <View style={{ backgroundColor: pillBg, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6, alignSelf: 'flex-start', marginTop: 8 }}>
        <Text style={{ fontSize: 12, color: pillText, fontFamily: 'Inter_400Regular' }} numberOfLines={1}>
          {shiftPillText}
        </Text>
      </View>

      {/* Payment pending banner */}
      {session.status === 'payment_pending' && (
        <View style={{ backgroundColor: '#3A2A00', borderRadius: 10, padding: 12, marginTop: 12 }}>
          <Text style={{ fontSize: 13, fontWeight: '600', color: '#D97706', fontFamily: 'Inter_600SemiBold' }}>{'⏳ Waiting for Payment'}</Text>
          <Text style={{ fontSize: 12, color: '#8E8E93', marginTop: 4, fontFamily: 'Inter_400Regular' }}>
            The requester has been sent a payment request. You will be notified once payment is confirmed.
          </Text>
        </View>
      )}

      {/* Action buttons */}
      {session.status !== 'payment_pending' && (
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
          {canCancel && (
            <TouchableOpacity
              onPress={() => {
                console.log('[DoctorUpcomingCoverageCard] Cancel shift pressed for session:', session.id);
                onCancel(session);
              }}
              activeOpacity={0.8}
              style={{ flex: 1, backgroundColor: cancelBg, borderRadius: 999, paddingVertical: 11, alignItems: 'center', borderWidth: 1, borderColor: cancelBorder }}
            >
              <Text style={{ fontSize: 13, fontFamily: 'Inter_600SemiBold', color: cancelText, letterSpacing: 0.3 }}>CANCEL SHIFT</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            onPress={() => {
              console.log('[DoctorUpcomingCoverageCard] Call pressed for session:', session.id, 'requester_phone:', session.requester_phone);
              onCall(session);
            }}
            activeOpacity={0.8}
            style={{ flex: 1, backgroundColor: callBg, borderRadius: 999, paddingVertical: 11, alignItems: 'center' }}
          >
            <Text style={{ fontSize: 13, fontFamily: 'Inter_600SemiBold', color: '#FFFFFF', letterSpacing: 0.3 }}>CALL</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}
