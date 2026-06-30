import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  TextInput,
  Platform,
  Animated,
  Dimensions,
  KeyboardAvoidingView,
  Alert,
  PanResponder,
  TouchableWithoutFeedback,
  Keyboard,
} from 'react-native';
import MapView, { PROVIDER_GOOGLE, Marker } from 'react-native-maps';
import { GooglePlacesAutocomplete } from 'react-native-google-places-autocomplete';
import { Search, MapPin, ArrowRight, X, CalendarDays, Clock } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import DateTimePicker from '@react-native-community/datetimepicker';
import * as Location from 'expo-location';
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

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

const SHEET_HEIGHTS = {
  idle: 140 + 80,
  searching: SCREEN_HEIGHT * 0.62,
  config: SCREEN_HEIGHT * 0.75,
  summary: 240 + 80,
  matching: 300 + 80,
};

type SheetState = 'idle' | 'searching' | 'config' | 'summary' | 'matching';

type SelectedPlace = {
  name: string;
  address: string;
  lat: number;
  lng: number;
};

function DragHandle({ panHandlers }: { panHandlers?: object }) {
  return (
    <View {...panHandlers} style={{ alignItems: 'center', paddingVertical: 8 }}>
      <View style={{ width: 36, height: 4, borderRadius: 99, backgroundColor: '#DEDEDE' }} />
    </View>
  );
}

export default function RequesterHomeScreen() {
  const insets = useSafeAreaInsets();
  const TAB_BAR_CLEARANCE = Platform.OS === 'ios' ? 0 : (60 + insets.bottom);
  const mapRef = useRef<MapView>(null);

  // Sheet state
  const [sheetState, setSheetState] = useState<SheetState>('idle');
  const sheetAnim = useRef(new Animated.Value(SHEET_HEIGHTS.idle)).current;

  // Location
  const [userCoords, setUserCoords] = useState<{ latitude: number; longitude: number } | null>(null);
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const locationSub = useRef<Location.LocationSubscription | null>(null);

  // Place
  const [selectedPlace, setSelectedPlace] = useState<SelectedPlace | null>(null);

  // Config form
  const [coverageType, setCoverageType] = useState<'Standard' | 'Home Care'>('Standard');
  const [shiftDate, setShiftDate] = useState<Date>(new Date());
  const [startTime, setStartTime] = useState<Date>(() => {
    const d = new Date();
    d.setHours(8, 0, 0, 0);
    return d;
  });
  const [endTime, setEndTime] = useState<Date>(() => {
    const d = new Date();
    d.setHours(18, 0, 0, 0);
    return d;
  });
  const [coverageLength, setCoverageLength] = useState(1);
  const [environment, setEnvironment] = useState<'Normal' | 'Busy'>('Normal');
  const [note, setNote] = useState('');

  // Date/time pickers
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showStartTimePicker, setShowStartTimePicker] = useState(false);
  const [showEndTimePicker, setShowEndTimePicker] = useState(false);

  // Matching progress
  const matchProgressAnim = useRef(new Animated.Value(0.05)).current;
  const [submitting, setSubmitting] = useState(false);

  // ─── Location on mount (live GPS streaming) ──────────────────────────────────
  useEffect(() => {
    (async () => {
      console.log('[RequesterHome] Requesting location permission');
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status === 'granted') {
        locationSub.current = await Location.watchPositionAsync(
          { accuracy: Location.Accuracy.High, timeInterval: 3000, distanceInterval: 5 },
          (loc) => {
            setUserCoords({ latitude: loc.coords.latitude, longitude: loc.coords.longitude });
          }
        );
      } else {
        console.log('[RequesterHome] Location permission denied, using Lagos fallback');
        setUserCoords({ latitude: LAGOS_REGION.latitude, longitude: LAGOS_REGION.longitude });
      }
    })();
    return () => { locationSub.current?.remove(); };
  }, []);

  // ─── Pulse animation ─────────────────────────────────────────────────────────
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 2.5, duration: 1400, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1.0, duration: 0, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [pulseAnim]);

  // ─── Sheet height animation ───────────────────────────────────────────────────
  const animateSheet = useCallback((state: SheetState) => {
    Animated.timing(sheetAnim, {
      toValue: SHEET_HEIGHTS[state],
      duration: 320,
      useNativeDriver: false,
    }).start();
  }, [sheetAnim]);

  const transitionTo = useCallback((state: SheetState) => {
    console.log('[RequesterHome] Sheet state transition:', sheetState, '->', state);
    setSheetState(state);
    animateSheet(state);
  }, [sheetState, animateSheet]);

  // ─── Matching progress animation ─────────────────────────────────────────────
  useEffect(() => {
    if (sheetState === 'matching') {
      matchProgressAnim.setValue(0.05);
      Animated.timing(matchProgressAnim, {
        toValue: 0.85,
        duration: 8000,
        useNativeDriver: false,
      }).start();
    }
  }, [sheetState, matchProgressAnim]);

  // ─── Drag handle PanResponder ─────────────────────────────────────────────────
  const dragPanResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderMove: () => {},
      onPanResponderRelease: (_, gestureState) => {
        if (gestureState.dy > 40) {
          Keyboard.dismiss();
          transitionTo('idle');
        }
      },
    })
  ).current;

  // ─── Handlers ────────────────────────────────────────────────────────────────
  const handleSearchTap = () => {
    console.log('[RequesterHome] Search input tapped');
    transitionTo('searching');
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
    console.log('[RequesterHome] Place selected:', place.name, { lat: place.lat, lng: place.lng });
    setSelectedPlace(place);
    mapRef.current?.animateToRegion(
      { latitude: place.lat, longitude: place.lng, latitudeDelta: 0.02, longitudeDelta: 0.02 },
      600
    );
    transitionTo('config');
  };

  const handleGoToSummary = () => {
    console.log('[RequesterHome] Proceeding to summary');
    transitionTo('summary');
  };

  const handleRequestCoverage = async () => {
    if (!selectedPlace) return;
    console.log('[RequesterHome] Request Coverage tapped — submitting to Supabase');
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
        coverage_type: coverageType,
        shift_date: shiftDate.toISOString().split('T')[0],
        start_time: startTime.toTimeString().slice(0, 5),
        end_time: endTime.toTimeString().slice(0, 5),
        coverage_length: coverageLength,
        environment,
        note,
        status: 'searching',
      });
      if (error) throw error;
      console.log('[RequesterHome] shift_request inserted successfully');
      transitionTo('matching');
    } catch (e: any) {
      console.log('[RequesterHome] Submit error:', e.message);
      Alert.alert('Error', e.message || 'Could not submit request. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleReset = () => {
    console.log('[RequesterHome] Resetting to idle');
    setSelectedPlace(null);
    setCoverageType('Standard');
    setShiftDate(new Date());
    const s = new Date(); s.setHours(8, 0, 0, 0);
    setStartTime(s);
    const e = new Date(); e.setHours(18, 0, 0, 0);
    setEndTime(e);
    setCoverageLength(1);
    setEnvironment('Normal');
    setNote('');
    transitionTo('idle');
  };

  const handleEditRequest = () => {
    console.log('[RequesterHome] Edit Request tapped');
    transitionTo('config');
  };

  const handleCancelRequest = () => {
    console.log('[RequesterHome] Cancel Request tapped');
    handleReset();
  };

  // ─── Derived display values ───────────────────────────────────────────────────
  const formattedDate = shiftDate.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const formattedDateShort = shiftDate.toLocaleDateString('en-US', { weekday: 'short' });
  const formattedStartTime = startTime.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
  const formattedEndTime = endTime.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
  const coveragePrice = coverageLength * 20000;
  const coveragePriceDisplay = `₦${coveragePrice.toLocaleString()}`;
  const coverageSubtitle = coverageLength === 1 ? '10-hour Single-Day Coverage' : `${coverageLength}-Day Coverage`;
  const summaryPillText = `${coverageType} · ${formattedDateShort} · ${formattedStartTime}`;
  const coverageLengthLabel = coverageLength === 1 ? '1 day' : `${coverageLength} days`;
  const coverageTypeDesc = coverageType === 'Standard'
    ? 'For hospitals, clinics, facilities, and medical centers.'
    : 'For home visits and personal care.';
  const environmentDesc = environment === 'Normal'
    ? 'Standard working conditions.'
    : 'High patient volume expected.';

  const userMarkerCoords = userCoords ?? { latitude: LAGOS_REGION.latitude, longitude: LAGOS_REGION.longitude };

  // ─── Render ───────────────────────────────────────────────────────────────────
  return (
    <View style={{ flex: 1 }}>
      {/* Full-screen map wrapped in TouchableWithoutFeedback for tap-to-dismiss */}
      <TouchableWithoutFeedback onPress={() => {
        Keyboard.dismiss();
        if (sheetState === 'searching' || sheetState === 'config') transitionTo('idle');
      }}>
        <View style={{ flex: 1 }}>
          <MapView
            ref={mapRef}
            style={{ flex: 1 }}
            provider={PROVIDER_GOOGLE}
            initialRegion={LAGOS_REGION}
            showsUserLocation={false}
          >
            {userCoords && (
              <Marker coordinate={userMarkerCoords} anchor={{ x: 0.5, y: 0.5 }} tracksViewChanges={true}>
                <View style={{ width: 80, height: 80, alignItems: 'center', justifyContent: 'center' }}>
                  {/* Outer pulsing filled disc */}
                  <Animated.View style={{
                    position: 'absolute',
                    width: 80,
                    height: 80,
                    borderRadius: 40,
                    backgroundColor: 'rgba(37,99,235,0.12)',
                    transform: [{ scale: pulseAnim.interpolate({ inputRange: [1, 2.5], outputRange: [0.6, 1], extrapolate: 'clamp' }) }],
                    opacity: pulseAnim.interpolate({ inputRange: [1, 2.5], outputRange: [0.8, 0], extrapolate: 'clamp' }),
                  }} />
                  {/* Middle fixed filled disc */}
                  <View style={{
                    position: 'absolute',
                    width: 44,
                    height: 44,
                    borderRadius: 22,
                    backgroundColor: 'rgba(37,99,235,0.20)',
                  }} />
                  {/* Inner solid blue dot */}
                  <View style={{
                    width: 18,
                    height: 18,
                    borderRadius: 9,
                    backgroundColor: '#2563EB',
                    borderWidth: 2.5,
                    borderColor: '#FFFFFF',
                    shadowColor: '#2563EB',
                    shadowOpacity: 0.6,
                    shadowRadius: 6,
                    elevation: 6,
                  }} />
                </View>
              </Marker>
            )}
          </MapView>
        </View>
      </TouchableWithoutFeedback>

      {/* Summary top pill — only in summary state */}
      {sheetState === 'summary' && (
        <View
          style={{
            position: 'absolute',
            top: insets.top + 12,
            left: 16,
            right: 16,
            backgroundColor: '#FFFFFF',
            borderRadius: RADIUS.full,
            paddingHorizontal: 20,
            paddingVertical: 12,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 10,
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 2 },
            shadowOpacity: 0.12,
            shadowRadius: 10,
            elevation: 5,
            zIndex: 20,
          }}
        >
          <TouchableOpacity
            onPress={handleReset}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <X size={18} color={COLORS.text} />
          </TouchableOpacity>
          <Text style={[TYPOGRAPHY.bodyMedium, { color: COLORS.text, flex: 1 }]}>
            {summaryPillText}
          </Text>
        </View>
      )}

      {/* Animated bottom sheet */}
      <Animated.View
        style={{
          position: 'absolute',
          bottom: TAB_BAR_CLEARANCE,
          left: 0,
          right: 0,
          height: sheetAnim,
          backgroundColor: '#FFFFFF',
          borderTopLeftRadius: 28,
          borderTopRightRadius: 28,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: -4 },
          shadowOpacity: 0.10,
          shadowRadius: 16,
          elevation: 12,
          overflow: 'visible',
        }}
      >
        {/* ── IDLE ── */}
        {sheetState === 'idle' && (
          <View style={{ padding: 20, paddingBottom: 16 }}>
            <DragHandle />
            <TouchableOpacity
              onPress={handleSearchTap}
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
              <Search size={18} color={'#3C3C3E'} />
              <Text style={[TYPOGRAPHY.body, { color: '#1C1C1E', fontWeight: '700' }]}>
                Where is coverage needed?
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {/* ── SEARCHING ── */}
        {sheetState === 'searching' && (
          <KeyboardAvoidingView
            style={{ flex: 1 }}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          >
            <View style={{ flex: 1, paddingTop: 20 }}>
              <DragHandle panHandlers={dragPanResponder.panHandlers} />
              <GooglePlacesAutocomplete
                placeholder="Where is coverage needed?"
                onPress={handlePlaceSelect}
                fetchDetails
                autoFocus
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
                  textInputContainer: {
                    backgroundColor: '#FFFFFF',
                    borderRadius: 28,
                    borderWidth: 1.5,
                    borderColor: '#0066CC',
                    marginBottom: 8,
                  },
                  textInput: {
                    backgroundColor: '#FFFFFF',
                    borderRadius: 28,
                    paddingHorizontal: 14,
                    paddingLeft: 44,
                    fontSize: 15,
                    color: COLORS.text,
                    height: 50,
                    margin: 0,
                  },
                  row: {
                    paddingVertical: 12,
                    paddingHorizontal: 0,
                    borderBottomWidth: 1,
                    borderBottomColor: '#F5F5F5',
                    backgroundColor: '#FFFFFF',
                  },
                  description: { fontSize: 14, color: COLORS.text },
                  poweredContainer: { display: 'none' },
                  listView: { backgroundColor: '#FFFFFF', maxHeight: 300, zIndex: 999, elevation: 20 },
                }}
                renderLeftButton={() => (
                  <View style={{ position: 'absolute', left: 16, top: 16, zIndex: 1 }}>
                    <Search size={18} color={COLORS.textTertiary} />
                  </View>
                )}
                renderRow={(rowData) => {
                  const mainText = rowData.structured_formatting?.main_text ?? rowData.description;
                  const secondaryText = rowData.structured_formatting?.secondary_text ?? '';
                  return (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 4 }}>
                      <View style={{
                        width: 36,
                        height: 36,
                        borderRadius: 18,
                        backgroundColor: '#F2F2F2',
                        justifyContent: 'center',
                        alignItems: 'center',
                        flexShrink: 0,
                      }}>
                        <MapPin size={16} color={COLORS.textTertiary} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={[TYPOGRAPHY.bodyMedium, { color: COLORS.text }]} numberOfLines={1}>
                          {mainText}
                        </Text>
                        <Text style={[TYPOGRAPHY.caption, { color: COLORS.textSecondary }]} numberOfLines={1}>
                          {secondaryText}
                        </Text>
                      </View>
                    </View>
                  );
                }}
              />
            </View>
          </KeyboardAvoidingView>
        )}

        {/* ── CONFIG ── */}
        {sheetState === 'config' && (
          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 32 }}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <DragHandle panHandlers={dragPanResponder.panHandlers} />

            {/* Search row — tappable back to searching */}
            <TouchableOpacity
              onPress={handleSearchTap}
              activeOpacity={0.8}
              style={{
                backgroundColor: '#F2F2F2',
                borderRadius: 28,
                padding: 14,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 10,
                marginBottom: 12,
              }}
            >
              <Search size={18} color={COLORS.textTertiary} />
              <Text style={[TYPOGRAPHY.body, { color: COLORS.textTertiary }]}>
                Where is coverage needed?
              </Text>
            </TouchableOpacity>

            {/* Selected location capsule */}
            {selectedPlace && (
              <View style={{
                backgroundColor: '#F8F8F8',
                borderRadius: 16,
                padding: 14,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 10,
                marginBottom: 16,
              }}>
                <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: '#2DC653', flexShrink: 0 }} />
                <View style={{ flex: 1 }}>
                  <Text style={[TYPOGRAPHY.bodyMedium, { color: COLORS.text }]} numberOfLines={1}>
                    {selectedPlace.name}
                  </Text>
                  <Text style={[TYPOGRAPHY.caption, { color: COLORS.textSecondary }]} numberOfLines={2}>
                    {selectedPlace.address}
                  </Text>
                </View>
              </View>
            )}

            {/* Coverage type toggle */}
            <View style={{ marginBottom: 8 }}>
              <View style={{
                flexDirection: 'row',
                backgroundColor: '#F2F2F2',
                borderRadius: RADIUS.full,
                padding: 4,
                alignSelf: 'flex-start',
              }}>
                <TouchableOpacity
                  onPress={() => {
                    console.log('[RequesterHome] Coverage type set to Standard');
                    setCoverageType('Standard');
                  }}
                  style={{
                    backgroundColor: coverageType === 'Standard' ? '#0A0A0A' : 'transparent',
                    borderRadius: RADIUS.full,
                    paddingHorizontal: 20,
                    paddingVertical: 10,
                  }}
                >
                  <Text style={[TYPOGRAPHY.bodyMedium, { color: coverageType === 'Standard' ? '#FFFFFF' : COLORS.text }]}>
                    Standard
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => {
                    console.log('[RequesterHome] Coverage type set to Home Care');
                    setCoverageType('Home Care');
                  }}
                  style={{
                    backgroundColor: coverageType === 'Home Care' ? '#0A0A0A' : 'transparent',
                    borderRadius: RADIUS.full,
                    paddingHorizontal: 20,
                    paddingVertical: 10,
                  }}
                >
                  <Text style={[TYPOGRAPHY.bodyMedium, { color: coverageType === 'Home Care' ? '#FFFFFF' : COLORS.text }]}>
                    Home Care
                  </Text>
                </TouchableOpacity>
              </View>
              <Text style={[TYPOGRAPHY.caption, { color: COLORS.textSecondary, marginTop: 8, marginBottom: 16 }]}>
                {coverageTypeDesc}
              </Text>
            </View>

            {/* Start Date + Start Time */}
            <View style={{ flexDirection: 'row', gap: 12, marginBottom: 12 }}>
              <TouchableOpacity
                onPress={() => {
                  console.log('[RequesterHome] Start date picker opened');
                  setShowDatePicker(true);
                }}
                style={{ flex: 1, backgroundColor: '#F2F2F2', borderRadius: 16, padding: 14 }}
              >
                <Text style={[TYPOGRAPHY.label, { color: COLORS.textSecondary, marginBottom: 6 }]}>
                  START DATE
                </Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Text style={[TYPOGRAPHY.body, { color: COLORS.text }]}>
                    {formattedDate}
                  </Text>
                  <CalendarDays size={16} color={COLORS.textTertiary} />
                </View>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => {
                  console.log('[RequesterHome] Start time picker opened');
                  setShowStartTimePicker(true);
                }}
                style={{ flex: 1, backgroundColor: '#F2F2F2', borderRadius: 16, padding: 14 }}
              >
                <Text style={[TYPOGRAPHY.label, { color: COLORS.textSecondary, marginBottom: 6 }]}>
                  START TIME
                </Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Text style={[TYPOGRAPHY.body, { color: COLORS.text }]}>
                    {formattedStartTime}
                  </Text>
                  <Clock size={16} color={COLORS.textTertiary} />
                </View>
              </TouchableOpacity>
            </View>

            {/* End Time + Coverage Length */}
            <View style={{ flexDirection: 'row', gap: 12, marginBottom: 16 }}>
              <TouchableOpacity
                onPress={() => {
                  console.log('[RequesterHome] End time picker opened');
                  setShowEndTimePicker(true);
                }}
                style={{ flex: 1, backgroundColor: '#F2F2F2', borderRadius: 16, padding: 14 }}
              >
                <Text style={[TYPOGRAPHY.label, { color: COLORS.textSecondary, marginBottom: 6 }]}>
                  END TIME
                </Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Text style={[TYPOGRAPHY.body, { color: COLORS.text }]}>
                    {formattedEndTime}
                  </Text>
                  <Clock size={16} color={COLORS.textTertiary} />
                </View>
              </TouchableOpacity>

              <View style={{ flex: 1, backgroundColor: '#F2F2F2', borderRadius: 16, padding: 14 }}>
                <Text style={[TYPOGRAPHY.label, { color: COLORS.textSecondary, marginBottom: 6 }]}>
                  COVERAGE LENGTH
                </Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <TouchableOpacity
                    onPress={() => {
                      const next = Math.max(1, coverageLength - 1);
                      console.log('[RequesterHome] Coverage length decremented to:', next);
                      setCoverageLength(next);
                    }}
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: RADIUS.full,
                      backgroundColor: '#E8E8E8',
                      justifyContent: 'center',
                      alignItems: 'center',
                    }}
                  >
                    <Text style={{ fontSize: 18, color: COLORS.text, lineHeight: 22 }}>−</Text>
                  </TouchableOpacity>
                  <Text style={[TYPOGRAPHY.body, { color: COLORS.text, minWidth: 50, textAlign: 'center' }]}>
                    {coverageLengthLabel}
                  </Text>
                  <TouchableOpacity
                    onPress={() => {
                      const next = Math.min(30, coverageLength + 1);
                      console.log('[RequesterHome] Coverage length incremented to:', next);
                      setCoverageLength(next);
                    }}
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: RADIUS.full,
                      backgroundColor: '#E8E8E8',
                      justifyContent: 'center',
                      alignItems: 'center',
                    }}
                  >
                    <Text style={{ fontSize: 18, color: COLORS.text, lineHeight: 22 }}>+</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>

            {/* Environment */}
            <View style={{ marginBottom: 16 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                <Text style={[TYPOGRAPHY.label, { color: COLORS.textSecondary }]}>ENVIRONMENT</Text>
                <View style={{
                  flexDirection: 'row',
                  backgroundColor: '#F2F2F2',
                  borderRadius: RADIUS.full,
                  padding: 4,
                }}>
                  <TouchableOpacity
                    onPress={() => {
                      console.log('[RequesterHome] Environment set to Normal');
                      setEnvironment('Normal');
                    }}
                    style={{
                      backgroundColor: environment === 'Normal' ? '#0A0A0A' : 'transparent',
                      borderRadius: RADIUS.full,
                      paddingHorizontal: 16,
                      paddingVertical: 8,
                    }}
                  >
                    <Text style={[TYPOGRAPHY.captionMedium, { color: environment === 'Normal' ? '#FFFFFF' : COLORS.text }]}>
                      Normal
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => {
                      console.log('[RequesterHome] Environment set to Busy');
                      setEnvironment('Busy');
                    }}
                    style={{
                      backgroundColor: environment === 'Busy' ? '#0A0A0A' : 'transparent',
                      borderRadius: RADIUS.full,
                      paddingHorizontal: 16,
                      paddingVertical: 8,
                    }}
                  >
                    <Text style={[TYPOGRAPHY.captionMedium, { color: environment === 'Busy' ? '#FFFFFF' : COLORS.text }]}>
                      Busy
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
              <Text style={[TYPOGRAPHY.caption, { color: COLORS.textSecondary }]}>
                {environmentDesc}
              </Text>
            </View>

            {/* Note */}
            <View style={{ marginBottom: 20 }}>
              <Text style={[TYPOGRAPHY.label, { color: COLORS.textSecondary, marginBottom: 8 }]}>
                NOTE (OPTIONAL)
              </Text>
              <TextInput
                value={note}
                onChangeText={(v) => {
                  console.log('[RequesterHome] Note updated');
                  setNote(v);
                }}
                multiline
                placeholder="Add any special requirements..."
                placeholderTextColor={COLORS.textTertiary}
                style={[
                  TYPOGRAPHY.body,
                  {
                    minHeight: 80,
                    backgroundColor: '#F2F2F2',
                    borderRadius: 16,
                    padding: 14,
                    textAlignVertical: 'top',
                    color: COLORS.text,
                  },
                ]}
              />
            </View>

            {/* Next button */}
            <View style={{ alignItems: 'flex-end' }}>
              <TouchableOpacity
                onPress={handleGoToSummary}
                style={{
                  width: 52,
                  height: 52,
                  borderRadius: 26,
                  backgroundColor: '#0A0A0A',
                  justifyContent: 'center',
                  alignItems: 'center',
                }}
              >
                <ArrowRight size={20} color="#FFFFFF" />
              </TouchableOpacity>
            </View>
          </ScrollView>
        )}

        {/* ── SUMMARY ── */}
        {sheetState === 'summary' && (
          <View style={{ padding: 24, paddingBottom: insets.bottom + 16 }}>
            <DragHandle />
            <Text style={[TYPOGRAPHY.label, { color: COLORS.textSecondary, marginBottom: 8 }]}>
              COVERAGE
            </Text>
            <Text style={{ fontSize: 48, fontWeight: '800', color: COLORS.text, lineHeight: 56 }}>
              {coveragePriceDisplay}
            </Text>
            <Text style={[TYPOGRAPHY.body, { color: COLORS.textSecondary, marginBottom: 24 }]}>
              {coverageSubtitle}
            </Text>
            <TouchableOpacity
              onPress={handleRequestCoverage}
              disabled={submitting}
              style={{
                backgroundColor: submitting ? '#888' : '#0A0A0A',
                borderRadius: 16,
                paddingVertical: 18,
                alignItems: 'center',
              }}
            >
              <Text style={[TYPOGRAPHY.bodyMedium, { color: '#FFF', fontWeight: '700' }]}>
                {submitting ? 'Submitting...' : 'Request Coverage'}
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {/* ── MATCHING ── */}
        {sheetState === 'matching' && (
          <View style={{ padding: 24, paddingBottom: insets.bottom + 16 }}>
            <DragHandle />
            <Text style={[TYPOGRAPHY.label, { color: COLORS.textSecondary, letterSpacing: 1.2, marginBottom: 6 }]}>
              {selectedPlace ? selectedPlace.name.toUpperCase() : 'FACILITY'}
            </Text>
            <Text style={[TYPOGRAPHY.h2, { color: COLORS.text, marginBottom: 4 }]}>
              Medical Officer Found
            </Text>
            <Text style={[TYPOGRAPHY.body, { color: COLORS.textSecondary, marginBottom: 24 }]}>
              Connecting to available doctors nearby
            </Text>

            {/* Progress bar */}
            <View style={{ height: 4, borderRadius: 2, backgroundColor: '#F2F2F2', width: '100%', overflow: 'hidden' }}>
              <Animated.View
                style={{
                  height: 4,
                  borderRadius: 2,
                  backgroundColor: '#0A0A0A',
                  width: matchProgressAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: ['0%', '100%'],
                  }),
                }}
              />
            </View>
            <Text style={[TYPOGRAPHY.caption, { color: COLORS.textSecondary, textAlign: 'center', marginTop: 12, marginBottom: 24 }]}>
              Checking nearby availability...
            </Text>

            {/* Action buttons */}
            <View style={{ flexDirection: 'row', gap: 12 }}>
              <TouchableOpacity
                onPress={handleEditRequest}
                style={{
                  flex: 1,
                  backgroundColor: '#F2F2F2',
                  borderRadius: RADIUS.full,
                  paddingVertical: 14,
                  alignItems: 'center',
                }}
              >
                <Text style={[TYPOGRAPHY.bodyMedium, { color: COLORS.text }]}>Edit Request</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleCancelRequest}
                style={{
                  flex: 1,
                  backgroundColor: '#F2F2F2',
                  borderRadius: RADIUS.full,
                  paddingVertical: 14,
                  alignItems: 'center',
                }}
              >
                <Text style={[TYPOGRAPHY.bodyMedium, { color: COLORS.text }]}>Cancel Request</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </Animated.View>

      {/* Date picker */}
      {showDatePicker && (
        <DateTimePicker
          value={shiftDate}
          mode="date"
          display={Platform.OS === 'ios' ? 'spinner' : 'default'}
          minimumDate={new Date()}
          onChange={(event, date) => {
            console.log('[RequesterHome] Date picker changed:', event.type, date);
            setShowDatePicker(Platform.OS === 'ios');
            if (event.type === 'set' && date) setShiftDate(date);
            if (Platform.OS !== 'ios') setShowDatePicker(false);
          }}
        />
      )}

      {/* Start time picker */}
      {showStartTimePicker && (
        <DateTimePicker
          value={startTime}
          mode="time"
          display={Platform.OS === 'ios' ? 'spinner' : 'default'}
          onChange={(event, date) => {
            console.log('[RequesterHome] Start time picker changed:', event.type, date);
            setShowStartTimePicker(Platform.OS === 'ios');
            if (event.type === 'set' && date) setStartTime(date);
            if (Platform.OS !== 'ios') setShowStartTimePicker(false);
          }}
        />
      )}

      {/* End time picker */}
      {showEndTimePicker && (
        <DateTimePicker
          value={endTime}
          mode="time"
          display={Platform.OS === 'ios' ? 'spinner' : 'default'}
          onChange={(event, date) => {
            console.log('[RequesterHome] End time picker changed:', event.type, date);
            setShowEndTimePicker(Platform.OS === 'ios');
            if (event.type === 'set' && date) setEndTime(date);
            if (Platform.OS !== 'ios') setShowEndTimePicker(false);
          }}
        />
      )}
    </View>
  );
}

