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

type DoctorDispatchCtx = {
  isOnline: boolean;
  setIsOnline: (v: boolean) => void;
  doctorScreenState: DoctorScreenState;
  currentRequest: DispatchRequest | null;
  confirmedRequest: DispatchRequest | null;
  accepting: boolean;
  handleAccept: () => Promise<void>;
  handleDecline: () => Promise<void>;
};

export const DoctorDispatchContext = createContext<DoctorDispatchCtx>({
  isOnline: false,
  setIsOnline: () => {},
  doctorScreenState: 'idle',
  currentRequest: null,
  confirmedRequest: null,
  accepting: false,
  handleAccept: async () => {},
  handleDecline: async () => {},
});

export const useDoctorDispatch = () => useContext(DoctorDispatchContext);
