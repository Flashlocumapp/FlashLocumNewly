import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, Modal, ScrollView,
  TextInput, Platform, KeyboardAvoidingView, Alert,
} from 'react-native';
import MapView, { PROVIDER_GOOGLE } from 'react-native-maps';
import { GooglePlacesAutocomplete } from 'react-native-google-places-autocomplete';
import { Search, X, ChevronDown, Clock, MapPin } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '@/lib/supabase';
import { COLORS, TYPOGRAPHY, SPACING, RADIUS } from '@/constants/Theme';

const ANDROID_KEY = 'AIzaSyACeTm0j_ajj-rRObPbkDBJvW6GVBt6SMU';
const IOS_KEY = 'AIzaSyBFC2FPkzjooOJhFwkMsM_o3qQiTOn0rZk';
const MAPS_KEY = Platform.OS === 'ios' ? IOS_KEY : ANDROID_KEY;

const LAGOS_REGION = {
  latitude: 6.5244,
  longitude: 3.3792,
  latitudeDelta: 0.15,
  longitudeDelta: 0.15,
};

const LAGOS_BOUNDS = {
  northeast: { lat: 6.7027, lng: 3.7042 },
  southwest: { lat: 6.3933, lng: 2.7076 },
};

const COVERAGE_TYPES = ['GP', 'Specialist', 'Nurse', 'Pharmacist', 'Other'];
const ENVIRONMENT_TYPES = ['Hospital', 'Clinic', 'Home Visit', 'Telemedicine', 'Other'];

type SelectedPlace = {
  name: string;
  address: string;
  lat: number;
  lng: number;
};

type ShiftForm = {
  coverageType: string;
  environmentType: string;
  shiftDate: string;
  startTime: string;
  endTime: string;
};

type SelectRowProps = {
  label: string;
  value: string;
  options: string[];
  onSelect: (v: string) => void;
};

function SelectRow({ label, value, options, onSelect }: SelectRowProps) {
  const [open, setOpen] = useState(false);

  const handleToggle = () => {
    console.log('[RequesterHome] SelectRow toggled:', label, 'open:', !open);
    setOpen(!open);
  };

  const handleSelect = (opt: string) => {
    console.log('[RequesterHome] SelectRow selected:', label, '=', opt);
    onSelect(opt);
    setOpen(false);
  };

  const displayText = value || `Select ${label}`;
  const displayColor = value ? COLORS.text : COLORS.textTertiary;

  return (
    <View style={{ marginBottom: 16 }}>
      <Text style={[TYPOGRAPHY.caption, { color: COLORS.textSecondary, marginBottom: 6 }]}>
        {label}
      </Text>
      <TouchableOpacity
        onPress={handleToggle}
        style={{
          backgroundColor: '#F2F2F2',
          borderRadius: 28,
          paddingHorizontal: 16,
          paddingVertical: 14,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <Text style={[TYPOGRAPHY.body, { color: displayColor }]}>
          {displayText}
        </Text>
        <ChevronDown size={16} color={COLORS.textTertiary} />
      </TouchableOpacity>
      {open && (
        <View style={{
          backgroundColor: '#FFF',
          borderRadius: 16,
          marginTop: 4,
          overflow: 'hidden',
          borderWidth: 1,
          borderColor: '#EFEFEF',
        }}>
          {options.map((opt) => (
            <TouchableOpacity
              key={opt}
              onPress={() => handleSelect(opt)}
              style={{
                paddingHorizontal: 16,
                paddingVertical: 12,
                borderBottomWidth: 1,
                borderBottomColor: '#F5F5F5',
              }}
            >
              <Text style={[TYPOGRAPHY.body, { color: COLORS.text }]}>{opt}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
    </View>
  );
}

type TimeInputProps = {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
};

function TimeInput({ label, value, onChange, placeholder }: TimeInputProps) {
  return (
    <View style={{ flex: 1 }}>
      <Text style={[TYPOGRAPHY.caption, { color: COLORS.textSecondary, marginBottom: 6 }]}>
        {label}
      </Text>
      <View style={{
        backgroundColor: '#F2F2F2',
        borderRadius: 28,
        paddingHorizontal: 14,
        paddingVertical: 14,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
      }}>
        <Clock size={14} color={COLORS.textTertiary} />
        <TextInput
          value={value}
          onChangeText={onChange}
          placeholder={placeholder}
          placeholderTextColor={COLORS.textTertiary}
          style={[TYPOGRAPHY.body, { flex: 1, color: COLORS.text }]}
        />
      </View>
    </View>
  );
}

export default function RequesterHomeScreen() {
  const insets = useSafeAreaInsets();
  const mapRef = useRef<MapView>(null);
  const [selectedPlace, setSelectedPlace] = useState<SelectedPlace | null>(null);

  useEffect(() => {
    AsyncStorage.setItem('flashlocum_last_pathway', 'requester').catch(() => {});
  }, []);
  const [showRequestSheet, setShowRequestSheet] = useState(false);
  const [showSearchModal, setShowSearchModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState<ShiftForm>({
    coverageType: '',
    environmentType: '',
    shiftDate: '',
    startTime: '',
    endTime: '',
  });

  const handleOpenSearch = () => {
    console.log('[RequesterHome] Search modal opened');
    setShowSearchModal(true);
  };

  const handleCloseSearch = () => {
    console.log('[RequesterHome] Search modal closed');
    setShowSearchModal(false);
  };

  const handleCloseRequestSheet = () => {
    console.log('[RequesterHome] Request sheet closed');
    setShowRequestSheet(false);
  };

  const handlePlaceSelect = (data: any, details: any) => {
    if (!details) {
      console.log('[RequesterHome] Place selected but no details returned');
      return;
    }
    const place: SelectedPlace = {
      name: details.name || data.structured_formatting?.main_text || data.description,
      address: details.formatted_address || data.description,
      lat: details.geometry.location.lat,
      lng: details.geometry.location.lng,
    };
    console.log('[RequesterHome] Place selected:', place.name, place.address, { lat: place.lat, lng: place.lng });
    setSelectedPlace(place);
    setShowSearchModal(false);
    setShowRequestSheet(true);
    mapRef.current?.animateToRegion({
      latitude: place.lat,
      longitude: place.lng,
      latitudeDelta: 0.02,
      longitudeDelta: 0.02,
    }, 600);
  };

  const handleSubmit = async () => {
    if (!selectedPlace) return;
    if (!form.coverageType || !form.environmentType || !form.shiftDate || !form.startTime || !form.endTime) {
      console.log('[RequesterHome] Submit blocked — missing fields:', form);
      Alert.alert('Missing fields', 'Please fill in all fields before submitting.');
      return;
    }
    console.log('[RequesterHome] Submitting coverage request:', { place: selectedPlace, form });
    setSubmitting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');
      console.log('[RequesterHome] Inserting shift_request for user:', user.id);
      const { error } = await supabase.from('shift_requests').insert({
        requester_id: user.id,
        place_name: selectedPlace.name,
        address: selectedPlace.address,
        latitude: selectedPlace.lat,
        longitude: selectedPlace.lng,
        coverage_type: form.coverageType,
        environment_type: form.environmentType,
        shift_date: form.shiftDate,
        start_time: form.startTime,
        end_time: form.endTime,
        status: 'searching',
      });
      if (error) throw error;
      console.log('[RequesterHome] Coverage request submitted successfully');
      setShowRequestSheet(false);
      setSelectedPlace(null);
      setForm({ coverageType: '', environmentType: '', shiftDate: '', startTime: '', endTime: '' });
      Alert.alert('Coverage request submitted', 'We are searching for available locum doctors.');
    } catch (e: any) {
      console.log('[RequesterHome] Submit error:', e.message);
      Alert.alert('Error', e.message || 'Could not submit request. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const submitButtonBg = submitting ? '#888' : '#0A0A0A';
  const submitButtonLabel = submitting ? 'Submitting...' : 'Request coverage';
  const searchBarLabel = selectedPlace ? selectedPlace.name : 'Where is coverage needed?';
  const pillTop = insets.top + 12;

  return (
    <View style={{ flex: 1 }}>
      <MapView
        ref={mapRef}
        style={{ flex: 1 }}
        provider={PROVIDER_GOOGLE}
        initialRegion={LAGOS_REGION}
        customMapStyle={DESATURATED_MAP_STYLE}
      />

      {/* Stats pill */}
      <View
        style={{
          position: 'absolute',
          top: pillTop,
          alignSelf: 'center',
          zIndex: 10,
          backgroundColor: '#FFFFFF',
          borderRadius: RADIUS.full,
          paddingHorizontal: 16,
          paddingVertical: 10,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 8,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.15,
          shadowRadius: 8,
          elevation: 4,
        }}
      >
        <Text style={{ fontSize: 14, color: '#F4A261', fontWeight: '600' }}>★</Text>
        <Text style={[TYPOGRAPHY.bodyMedium, { color: COLORS.text }]}>5.0</Text>
        <Text style={{ color: COLORS.textTertiary, fontSize: 16 }}>|</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
          <View style={{ width: 8, height: 8, borderRadius: RADIUS.full, backgroundColor: COLORS.success }} />
          <Text style={[TYPOGRAPHY.bodyMedium, { color: COLORS.text }]}>100%</Text>
        </View>
        <Text style={{ color: COLORS.textTertiary, fontSize: 16 }}>|</Text>
        <TouchableOpacity
          activeOpacity={0.7}
          onPress={() => console.log('[RequesterHome] Info pill tapped')}
        >
          <Text style={{ fontSize: 14, color: COLORS.textTertiary }}>ℹ</Text>
        </TouchableOpacity>
      </View>

      {/* Bottom search card */}
      <View
        style={{
          position: 'absolute',
          bottom: 100,
          left: 16,
          right: 16,
          backgroundColor: '#FFFFFF',
          borderRadius: 24,
          padding: SPACING.lg,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.12,
          shadowRadius: 16,
          elevation: 6,
        }}
      >
        <View style={{
          width: 36,
          height: 4,
          borderRadius: RADIUS.full,
          backgroundColor: '#DEDEDE',
          alignSelf: 'center',
          marginBottom: SPACING.base,
        }} />
        <TouchableOpacity
          onPress={handleOpenSearch}
          activeOpacity={0.8}
          style={{
            backgroundColor: '#F2F2F2',
            borderRadius: 28,
            padding: 14,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 10,
          }}
        >
          <Search size={18} color={COLORS.textTertiary} />
          <Text style={[TYPOGRAPHY.body, { color: COLORS.textTertiary }]}>
            {searchBarLabel}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Search Modal */}
      <Modal visible={showSearchModal} animationType="slide" presentationStyle="pageSheet">
        <View style={{ flex: 1, backgroundColor: '#FFF', paddingTop: insets.top + 16 }}>
          <View style={{
            flexDirection: 'row',
            alignItems: 'center',
            paddingHorizontal: 16,
            marginBottom: 12,
          }}>
            <Text style={[TYPOGRAPHY.h3, { flex: 1 }]}>Find a location</Text>
            <TouchableOpacity onPress={handleCloseSearch}>
              <X size={22} color={COLORS.text} />
            </TouchableOpacity>
          </View>
          <GooglePlacesAutocomplete
            placeholder="Search clinic, hospital, facility..."
            onPress={handlePlaceSelect}
            fetchDetails
            query={{
              key: MAPS_KEY,
              language: 'en',
              components: 'country:ng',
              location: `${LAGOS_REGION.latitude},${LAGOS_REGION.longitude}`,
              radius: 50000,
              strictbounds: true,
              locationbias: `rectangle:${LAGOS_BOUNDS.southwest.lat},${LAGOS_BOUNDS.southwest.lng}|${LAGOS_BOUNDS.northeast.lat},${LAGOS_BOUNDS.northeast.lng}`,
            }}
            styles={{
              container: { flex: 1, paddingHorizontal: 16 },
              textInput: {
                backgroundColor: '#F2F2F2',
                borderRadius: 28,
                paddingHorizontal: 16,
                paddingVertical: 14,
                fontSize: 15,
                color: COLORS.text,
                height: 52,
              },
              row: { paddingHorizontal: 4, paddingVertical: 12 },
              description: { fontSize: 14, color: COLORS.text },
              poweredContainer: { display: 'none' },
            }}
            renderLeftButton={() => (
              <View style={{ position: 'absolute', left: 32, top: 17, zIndex: 1 }}>
                <MapPin size={16} color={COLORS.textTertiary} />
              </View>
            )}
          />
        </View>
      </Modal>

      {/* Request Creation Sheet */}
      <Modal visible={showRequestSheet} animationType="slide" presentationStyle="pageSheet">
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View style={{ flex: 1, backgroundColor: '#FFF', paddingTop: insets.top + 16 }}>
            <View style={{
              flexDirection: 'row',
              alignItems: 'center',
              paddingHorizontal: 16,
              marginBottom: 4,
            }}>
              <View style={{ flex: 1 }}>
                <Text style={[TYPOGRAPHY.h3, { marginBottom: 2 }]}>New coverage request</Text>
                {selectedPlace && (
                  <Text
                    style={[TYPOGRAPHY.caption, { color: COLORS.textSecondary }]}
                    numberOfLines={1}
                  >
                    {selectedPlace.name}
                    {' · '}
                    {selectedPlace.address}
                  </Text>
                )}
              </View>
              <TouchableOpacity onPress={handleCloseRequestSheet}>
                <X size={22} color={COLORS.text} />
              </TouchableOpacity>
            </View>

            <ScrollView
              style={{ flex: 1 }}
              contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
              keyboardShouldPersistTaps="handled"
            >
              <SelectRow
                label="Coverage type"
                value={form.coverageType}
                options={COVERAGE_TYPES}
                onSelect={(v) => setForm(f => ({ ...f, coverageType: v }))}
              />
              <SelectRow
                label="Environment type"
                value={form.environmentType}
                options={ENVIRONMENT_TYPES}
                onSelect={(v) => setForm(f => ({ ...f, environmentType: v }))}
              />

              {/* Date */}
              <View style={{ marginBottom: 16 }}>
                <Text style={[TYPOGRAPHY.caption, { color: COLORS.textSecondary, marginBottom: 6 }]}>
                  Shift date
                </Text>
                <View style={{
                  backgroundColor: '#F2F2F2',
                  borderRadius: 28,
                  paddingHorizontal: 16,
                  paddingVertical: 14,
                }}>
                  <TextInput
                    value={form.shiftDate}
                    onChangeText={(v) => setForm(f => ({ ...f, shiftDate: v }))}
                    placeholder="YYYY-MM-DD"
                    placeholderTextColor={COLORS.textTertiary}
                    style={[TYPOGRAPHY.body, { color: COLORS.text }]}
                  />
                </View>
              </View>

              {/* Time row */}
              <View style={{ flexDirection: 'row', gap: 12, marginBottom: 24 }}>
                <TimeInput
                  label="Start time"
                  value={form.startTime}
                  onChange={(v) => setForm(f => ({ ...f, startTime: v }))}
                  placeholder="08:00"
                />
                <TimeInput
                  label="End time"
                  value={form.endTime}
                  onChange={(v) => setForm(f => ({ ...f, endTime: v }))}
                  placeholder="17:00"
                />
              </View>

              <TouchableOpacity
                onPress={handleSubmit}
                disabled={submitting}
                style={{
                  backgroundColor: submitButtonBg,
                  borderRadius: 28,
                  paddingVertical: 16,
                  alignItems: 'center',
                }}
              >
                <Text style={[TYPOGRAPHY.bodyMedium, { color: '#FFF' }]}>
                  {submitButtonLabel}
                </Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const DESATURATED_MAP_STYLE = [
  { elementType: 'geometry', stylers: [{ color: '#f5f5f5' }] },
  { elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#616161' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#f5f5f5' }] },
  { featureType: 'administrative.land_parcel', elementType: 'labels.text.fill', stylers: [{ color: '#bdbdbd' }] },
  { featureType: 'poi', elementType: 'geometry', stylers: [{ color: '#eeeeee' }] },
  { featureType: 'poi', elementType: 'labels.text.fill', stylers: [{ color: '#757575' }] },
  { featureType: 'poi.park', elementType: 'geometry', stylers: [{ color: '#e5e5e5' }] },
  { featureType: 'poi.park', elementType: 'labels.text.fill', stylers: [{ color: '#9e9e9e' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#ffffff' }] },
  { featureType: 'road.arterial', elementType: 'labels.text.fill', stylers: [{ color: '#757575' }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#dadada' }] },
  { featureType: 'road.highway', elementType: 'labels.text.fill', stylers: [{ color: '#616161' }] },
  { featureType: 'road.local', elementType: 'labels.text.fill', stylers: [{ color: '#9e9e9e' }] },
  { featureType: 'transit.line', elementType: 'geometry', stylers: [{ color: '#e5e5e5' }] },
  { featureType: 'transit.station', elementType: 'geometry', stylers: [{ color: '#eeeeee' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#c9d8e8' }] },
  { featureType: 'water', elementType: 'labels.text.fill', stylers: [{ color: '#9e9e9e' }] },
];
