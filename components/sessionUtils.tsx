import React from 'react';
import { View, Text } from 'react-native';

// Shared type — matches both doctor and requester session shapes
export type SessionLike = {
  shift_start: string;
  shift_end: string;
  shift_date: string;
  coverage_type: string;
  coverage_length: number;
  per_day_hours?: number | null;
  booked_price?: number | null;
  price?: number | null;
  status?: string;
  current_day?: number | null;
  environment?: string | null;
};

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
}

export function buildShiftPillText(session: SessionLike): string {
  const totalHours = (new Date(session.shift_end).getTime() - new Date(session.shift_start).getTime()) / 3_600_000;
  const coverageLength = session.coverage_length ?? 1;
  const hoursDisplay = totalHours % 1 === 0 ? `${totalHours} hrs` : `${totalHours.toFixed(1)} hrs`;
  const priceDisplay = `₦${Number(session.booked_price ?? session.price ?? 0).toLocaleString()}`;
  const shiftStart = formatTime(session.shift_start);
  const shiftEnd = formatTime(session.shift_end);
  const sep = ' · ';
  const daysLabel = coverageLength === 1 ? '1 Day' : `${coverageLength} Days`;

  if (session.status === 'paused') {
    const startDate = new Date(session.shift_date);
    const endDate = new Date(startDate);
    endDate.setDate(startDate.getDate() + coverageLength - 1);
    const startDay = startDate.toLocaleDateString('en-US', { weekday: 'short' });
    const endDay = endDate.toLocaleDateString('en-US', { weekday: 'short' });
    const dayRange = coverageLength > 1 ? `${startDay}–${endDay}` : startDay;
    return `${session.coverage_type}${sep}${daysLabel}${sep}${dayRange}${sep}${shiftStart}–${shiftEnd}${sep}${hoursDisplay}${sep}${priceDisplay}`;
  }

  if (totalHours >= 24) {
    const startDate = new Date(session.shift_date);
    const endDate = new Date(startDate);
    endDate.setDate(startDate.getDate() + coverageLength);
    const startDay = startDate.toLocaleDateString('en-US', { weekday: 'short' });
    const endDay = endDate.toLocaleDateString('en-US', { weekday: 'short' });
    return `${session.coverage_type}${sep}${daysLabel}${sep}${startDay}–${endDay}${sep}${shiftStart}–${shiftEnd}${sep}${hoursDisplay}${sep}${priceDisplay}`;
  }

  if (coverageLength > 1) {
    const startDate = new Date(session.shift_date);
    const endDate = new Date(startDate);
    endDate.setDate(startDate.getDate() + coverageLength - 1);
    const startDay = startDate.toLocaleDateString('en-US', { weekday: 'short' });
    const endDay = endDate.toLocaleDateString('en-US', { weekday: 'short' });
    return `${session.coverage_type}${sep}${daysLabel}${sep}${startDay}–${endDay}${sep}${shiftStart}–${shiftEnd}${sep}${hoursDisplay}${sep}${priceDisplay}`;
  }

  const dayLabel = new Date(session.shift_date).toLocaleDateString('en-US', { weekday: 'short' });
  return `${session.coverage_type}${sep}${daysLabel}${sep}${dayLabel}${sep}${shiftStart}–${shiftEnd}${sep}${hoursDisplay}${sep}${priceDisplay}`;
}

export function EnvironmentBadge({ environment }: { environment: string }) {
  return (
    <View style={{ backgroundColor: '#F5F5F0', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 }}>
      <Text style={{ fontSize: 12, color: '#1C1C1E', fontFamily: 'Inter_600SemiBold' }}>{environment}</Text>
    </View>
  );
}
