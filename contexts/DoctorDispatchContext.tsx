import React, { createContext, useContext, useState } from 'react';

type DoctorScreenState = 'idle' | 'incoming' | 'confirmed';

type DispatchRequest = {
  id: string;
  requester_id: string;
  hospital_name: string;
  hospital_address: string;
  shift_type: 'Standard' | 'Home Care';
  shift_date: string;
  start_time: string;
  end_time: string;
  duration_hours: number;
  environment: 'Normal' | 'Busy';
  note?: string | null;
  price: number;
  expiry_at?: string;
};

export type DayLog = {
  day: number;
  started_at: string;
  paused_at: string | null;
  duration_seconds: number;
};

export type CoverageSession = {
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
  coverage_length: number;
  per_day_hours: number | null;
  environment: string;
  price: number;
  hourly_rate_kobo: number;
  current_day: number;
  day_logs: DayLog[];
  status: 'upcoming' | 'active' | 'paused' | 'payment_pending' | 'settled' | 'payment_complete' | 'completed' | 'cancelled' | 'history';
  started_at: string | null;
  ended_at: string | null;
  paused_at: string | null;
  payment_initiated_at: string | null;
  payment_deadline_at: string | null;
  payment_status: string;
  monnify_reference: string | null;
  monnify_account_number: string | null;
  monnify_bank_name: string | null;
  monnify_account_name: string | null;
  monnify_account_reference: string | null;
  settled_at: string | null;
  payment_complete_at: string | null;
  late_fee_applied_at: string | null;
  doctor_name: string;
  doctor_mdcn: string;
  doctor_rating: number;
  doctor_reliability: number;
  doctor_phone: string | null;
  doctor_avatar: string | null;
  requester_name: string;
  requester_phone: string | null;
  created_at: string;
};

type DoctorDispatchCtx = {
  isOnline: boolean;
  setIsOnline: (v: boolean) => void;
  goOnline: (coords?: { lat: number; lng: number }) => void;
  doctorScreenState: DoctorScreenState;
  currentRequest: DispatchRequest | null;
  confirmedRequest: DispatchRequest | null;
  accepting: boolean;
  handleAccept: () => Promise<void>;
  handleDecline: () => Promise<void>;
  activeSession: CoverageSession | null;
  setActiveSession: (s: CoverageSession | null) => void;
  activeJobCount: number;
  setActiveJobCount: (n: number) => void;
};

export const DoctorDispatchContext = createContext<DoctorDispatchCtx>({
  isOnline: false,
  setIsOnline: () => {},
  goOnline: () => {},
  doctorScreenState: 'idle',
  currentRequest: null,
  confirmedRequest: null,
  accepting: false,
  handleAccept: async () => {},
  handleDecline: async () => {},
  activeSession: null,
  setActiveSession: () => {},
  activeJobCount: 0,
  setActiveJobCount: () => {},
});

export const useDoctorDispatch = () => useContext(DoctorDispatchContext);
