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
  Pressable,
  Keyboard,
  StyleSheet,
  ActivityIndicator,
  Modal,
  FlatList,
} from 'react-native';
import MapView, { PROVIDER_GOOGLE, Marker } from 'react-native-maps';
import { Search, MapPin, ArrowRight, X, History, ArrowLeft } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import DateTimePicker from '@react-native-community/datetimepicker';
import * as Location from 'expo-location';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '@/lib/supabase';
import { COLORS, TYPOGRAPHY, SPACING, RADIUS } from '@/constants/Theme';
import { useTabBarVisibility, TAB_BAR_HEIGHT } from '@/contexts/TabBarVisibilityContext';

// ─── Pricing config ───────────────────────────────────────────────────────────
type PricingConfig = {
  home_care_rate: number;
  day_rate_short: number;
  day_rate_medium: number;
  day_rate_long: number;
  night_rate: number;
  flat_24h_fee: number;
  busy_multiplier: number;
};

const DEFAULT_PRICING: PricingConfig = {
  home_care_rate: 15000,
  day_rate_short: 3000,
  day_rate_medium: 2500,
  day_rate_long: 2000,
  night_rate: 1500,
  flat_24h_fee: 36000,
  busy_multiplier: 1.3,
};

function usePricingConfig(): PricingConfig {
  const [config, setConfig] = useState<PricingConfig>(DEFAULT_PRICING);
  useEffect(() => {
    supabase
      .from('pricing_config')
      .select('*')
      .limit(1)
      .single()
      .then(({ data, error }) => {
        if (error) {
          console.log('[PricingConfig] fetch error:', error.message, '— using defaults');
          return;
        }
        if (data) {
          console.log('[PricingConfig] loaded from Supabase:', data);
          setConfig({
            home_care_rate: data.home_care_rate ?? DEFAULT_PRICING.home_care_rate,
            day_rate_short: data.day_rate_short ?? DEFAULT_PRICING.day_rate_short,
            day_rate_medium: data.day_rate_medium ?? DEFAULT_PRICING.day_rate_medium,
            day_rate_long: data.day_rate_long ?? DEFAULT_PRICING.day_rate_long,
            night_rate: data.night_rate ?? DEFAULT_PRICING.night_rate,
            flat_24h_fee: data.flat_24h_fee ?? DEFAULT_PRICING.flat_24h_fee,
            busy_multiplier: data.busy_multiplier ?? DEFAULT_PRICING.busy_multiplier,
          });
        }
      });
  }, []);
  return config;
}

const ANDROID_KEY = 'AIzaSyACeTm0j_ajj-rRObPbkDBJvW6GVBt6SMU';
const IOS_KEY = 'AIzaSyBFC2FPkzjooOJhFwkMsM_o3qQiTOn0rZk';
const MAPS_KEY = Platform.OS === 'ios' ? IOS_KEY : ANDROID_KEY;

const RECENT_PLACE_KEY = 'flashlocum_recent_place';

const LAGOS_REGION = {
  latitude: 6.5244,
  longitude: 3.3792,
  latitudeDelta: 0.08,
  longitudeDelta: 0.08,
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
  matched: SCREEN_HEIGHT * 0.55,
};

type SheetState = 'idle' | 'searching' | 'config' | 'summary' | 'matching' | 'matched';

type SelectedPlace = {
  name: string;
  address: string;
  lat: number;
  lng: number;
};

const MINIMALIST_MAP_STYLE = [
  { elementType: 'geometry', stylers: [{ color: '#f5f5f5' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#616161' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#f5f5f5' }] },
  { featureType: 'administrative.land_parcel', stylers: [{ visibility: 'off' }] },
  { featureType: 'administrative.neighborhood', stylers: [{ visibility: 'off' }] },
  { featureType: 'poi', stylers: [{ visibility: 'off' }] },
  { featureType: 'poi.park', elementType: 'geometry', stylers: [{ color: '#e5e5e5' }] },
  { featureType: 'poi.park', elementType: 'labels.text', stylers: [{ visibility: 'off' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#ffffff' }] },
  { featureType: 'road.arterial', elementType: 'labels.text.fill', stylers: [{ color: '#757575' }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#dadada' }] },
  { featureType: 'road.highway', elementType: 'labels.text.fill', stylers: [{ color: '#616161' }] },
  { featureType: 'road.local', stylers: [{ visibility: 'off' }] },
  { featureType: 'transit', stylers: [{ visibility: 'off' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#c9d8e8' }] },
  { featureType: 'water', elementType: 'labels.text', stylers: [{ visibility: 'off' }] },
];

// ─── Custom Time Picker ───────────────────────────────────────────────────────
const HOURS = Array.from({ length: 24 }, (_, i) => i);
const MINUTES = [0, 15, 30, 45];
const ITEM_HEIGHT = 48;

function CustomTimePicker({
  visible,
  initialTime,
  onDone,
  onCancel,
  isForDate,
  shiftDate,
  watNow,
}: {
  visible: boolean;
  initialTime: Date;
  onDone: (date: Date) => void;
  onCancel: () => void;
  isForDate: Date;
  shiftDate: Date;
  watNow: Date;
}) {
  const [selectedHour, setSelectedHour] = useState(initialTime.getHours());
  const [selectedMinute, setSelectedMinute] = useState(() => {
    const m = initialTime.getMinutes();
    // snap to nearest 15
    return MINUTES.reduce((prev, curr) => Math.abs(curr - m) < Math.abs(prev - m) ? curr : prev, 0);
  });

  const hourListRef = useRef<FlatList<number>>(null);
  const minuteListRef = useRef<FlatList<number>>(null);

  useEffect(() => {
    if (visible) {
      const h = initialTime.getHours();
      const rawM = initialTime.getMinutes();
      const snappedM = MINUTES.reduce((prev, curr) => Math.abs(curr - rawM) < Math.abs(prev - rawM) ? curr : prev, 0);
      setSelectedHour(h);
      setSelectedMinute(snappedM);
      setTimeout(() => {
        hourListRef.current?.scrollToIndex({ index: h, animated: false });
        const mIdx = MINUTES.indexOf(snappedM);
        minuteListRef.current?.scrollToIndex({ index: mIdx >= 0 ? mIdx : 0, animated: false });
      }, 100);
    }
  }, [visible]);

  const handleDone = () => {
    console.log('[CustomTimePicker] Done pressed — hour:', selectedHour, 'minute:', selectedMinute);
    // WAT validation: if shift date is today (WAT), ensure selected time is in the future
    const shiftDateStr = shiftDate.toISOString().split('T')[0];
    const watTodayStr = watNow.toISOString().split('T')[0];
    if (shiftDateStr === watTodayStr) {
      const watHour = watNow.getUTCHours();
      const watMinute = watNow.getUTCMinutes();
      if (selectedHour < watHour || (selectedHour === watHour && selectedMinute <= watMinute)) {
        Alert.alert('Invalid Time', 'Please select a future time.');
        return;
      }
    }
    const result = new Date(isForDate);
    result.setHours(selectedHour, selectedMinute, 0, 0);
    onDone(result);
  };

  const insets = useSafeAreaInsets();

  const renderHourItem = ({ item }: { item: number }) => {
    const isSelected = item === selectedHour;
    const label = item.toString().padStart(2, '0');
    return (
      <TouchableOpacity
        onPress={() => {
          console.log('[CustomTimePicker] Hour selected:', item);
          setSelectedHour(item);
        }}
        style={{
          height: ITEM_HEIGHT,
          justifyContent: 'center',
          alignItems: 'center',
          backgroundColor: isSelected ? '#0A0A0A' : 'transparent',
          borderRadius: 12,
          marginHorizontal: 4,
        }}
      >
        <Text style={{ fontSize: 22, fontWeight: isSelected ? '700' : '400', color: isSelected ? '#FFFFFF' : COLORS.text }}>
          {label}
        </Text>
      </TouchableOpacity>
    );
  };

  const renderMinuteItem = ({ item }: { item: number }) => {
    const isSelected = item === selectedMinute;
    const label = item.toString().padStart(2, '0');
    return (
      <TouchableOpacity
        onPress={() => {
          console.log('[CustomTimePicker] Minute selected:', item);
          setSelectedMinute(item);
        }}
        style={{
          height: ITEM_HEIGHT,
          justifyContent: 'center',
          alignItems: 'center',
          backgroundColor: isSelected ? '#0A0A0A' : 'transparent',
          borderRadius: 12,
          marginHorizontal: 4,
        }}
      >
        <Text style={{ fontSize: 22, fontWeight: isSelected ? '700' : '400', color: isSelected ? '#FFFFFF' : COLORS.text }}>
          {label}
        </Text>
      </TouchableOpacity>
    );
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onCancel}>
      <TouchableWithoutFeedback onPress={onCancel}>
        <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' }}>
          <TouchableWithoutFeedback>
            <View style={{ backgroundColor: '#FFFFFF', borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingBottom: insets.bottom + 8 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingTop: 16, paddingBottom: 8 }}>
                <TouchableOpacity onPress={onCancel}>
                  <Text style={{ fontSize: 16, color: COLORS.textSecondary }}>Cancel</Text>
                </TouchableOpacity>
                <Text style={{ fontSize: 16, fontWeight: '600', color: COLORS.text }}>Select Time</Text>
                <TouchableOpacity onPress={handleDone}>
                  <Text style={{ fontSize: 16, fontWeight: '600', color: '#1C1C1E' }}>Done</Text>
                </TouchableOpacity>
              </View>

              <View style={{ flexDirection: 'row', paddingHorizontal: 20, paddingVertical: 12, gap: 12 }}>
                {/* Hour column */}
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 12, fontWeight: '600', color: COLORS.textSecondary, textAlign: 'center', marginBottom: 8, letterSpacing: 0.8 }}>
                    HOUR
                  </Text>
                  <FlatList
                    ref={hourListRef}
                    data={HOURS}
                    keyExtractor={(item) => String(item)}
                    renderItem={renderHourItem}
                    snapToInterval={ITEM_HEIGHT}
                    decelerationRate="fast"
                    showsVerticalScrollIndicator={false}
                    style={{ height: ITEM_HEIGHT * 5 }}
                    getItemLayout={(_, index) => ({ length: ITEM_HEIGHT, offset: ITEM_HEIGHT * index, index })}
                    onScrollToIndexFailed={() => {}}
                  />
                </View>

                {/* Separator */}
                <View style={{ justifyContent: 'center', paddingBottom: 8 }}>
                  <Text style={{ fontSize: 28, fontWeight: '700', color: COLORS.text }}>:</Text>
                </View>

                {/* Minute column */}
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 12, fontWeight: '600', color: COLORS.textSecondary, textAlign: 'center', marginBottom: 8, letterSpacing: 0.8 }}>
                    MIN
                  </Text>
                  <FlatList
                    ref={minuteListRef}
                    data={MINUTES}
                    keyExtractor={(item) => String(item)}
                    renderItem={renderMinuteItem}
                    snapToInterval={ITEM_HEIGHT}
                    decelerationRate="fast"
                    showsVerticalScrollIndicator={false}
                    style={{ height: ITEM_HEIGHT * 4 }}
                    getItemLayout={(_, index) => ({ length: ITEM_HEIGHT, offset: ITEM_HEIGHT * index, index })}
                    onScrollToIndexFailed={() => {}}
                  />
                </View>
              </View>
            </View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
}

// ─── Pricing Engine ───────────────────────────────────────────────────────────

/**
 * Calculates total coverage price in Naira.
 * Rules:
 * - Home Care: flat ₦15,000/hr regardless of time/environment
 * - Standard:
 *   - Total continuous hours = (endTime - startTime in hours) × coverageLength
 *   - Full 24-hr blocks → ₦36,000 flat each
 *   - Remainder hours split into day (06:00–22:00) and night (22:00–06:00) windows
 *     using the actual start time to determine which window the remainder falls in
 *   - Day rate tiers (for non-remainder hours):
 *       < 4 hrs/day  → ₦3,000/hr
 *       4–6 hrs/day  → ₦2,500/hr
 *       > 6 hrs/day  → ₦2,000/hr
 *   - Remainder after 24-hr blocks always billed at ₦2,000/hr (long-duration rate)
 *   - Night rate: ₦1,500/hr
 *   - Busy surcharge: 30% on everything
 */
function calculateCoveragePrice(
  startTime: Date,
  endTime: Date,
  coverageLength: number,
  coverageType: 'Standard' | 'Home Care',
  environment: 'Normal' | 'Busy',
  pricing: PricingConfig
): { totalNaira: number; totalHours: number } {
  // Duration of one shift in hours (fractional, 15-min precision)
  const shiftMs = endTime.getTime() - startTime.getTime();
  const shiftHours = Math.max(0, Math.round((shiftMs / (1000 * 60 * 60)) * 4) / 4); // round to nearest 0.25
  const totalHours = shiftHours * coverageLength;

  if (coverageType === 'Home Care') {
    const base = totalHours * pricing.home_care_rate;
    return { totalNaira: base, totalHours };
  }

  // Standard pricing
  const busyMultiplier = environment === 'Busy' ? pricing.busy_multiplier : 1.0;

  // Check if this is a straight continuous booking (coverageLength days back-to-back)
  // A straight booking means the end of one day's shift is the start of the next,
  // i.e. the shift spans the full 24 hours per day block.
  // We treat it as straight if totalHours >= 24 and coverageLength > 1
  // and the shift duration per day equals 24 hours (i.e. endTime - startTime = 24h exactly or more).
  const isStraight = totalHours >= 24 && shiftHours >= 24;

  if (isStraight) {
    const fullBlocks = Math.floor(totalHours / 24);
    const remainderHours = Math.round((totalHours - fullBlocks * 24) * 4) / 4;

    const flatFee = fullBlocks * pricing.flat_24h_fee * busyMultiplier;
    // Remainder billed at long-duration day rate, scaled by busy
    const remainderFee = remainderHours * pricing.day_rate_long * busyMultiplier;

    return { totalNaira: Math.round(flatFee + remainderFee), totalHours };
  }

  // Non-straight: evaluate each day's shift independently
  // Determine how many hours of the shift fall in day window (06:00–22:00) vs night (22:00–06:00)
  const startHour = startTime.getHours() + startTime.getMinutes() / 60;
  const endHour = startHour + shiftHours;

  // Day window: 6 to 22 (16 hours)
  // Night window: 22 to 30 (i.e. 22:00 to 06:00 next day, represented as 22–30)
  const DAY_START = 6;
  const DAY_END = 22;

  // Overlap with day window [6, 22]
  const dayOverlapStart = Math.max(startHour, DAY_START);
  const dayOverlapEnd = Math.min(endHour, DAY_END);
  const dayHours = Math.max(0, Math.round((dayOverlapEnd - dayOverlapStart) * 4) / 4);

  // Night hours = total - day hours
  const nightHours = Math.max(0, Math.round((shiftHours - dayHours) * 4) / 4);

  // Day rate tier based on total shift duration (not just day portion)
  let dayRate: number;
  if (shiftHours < 4) {
    dayRate = pricing.day_rate_short;
  } else if (shiftHours <= 6) {
    dayRate = pricing.day_rate_medium;
  } else {
    dayRate = pricing.day_rate_long;
  }

  const nightRate = pricing.night_rate;

  const dailyCost = (dayHours * dayRate + nightHours * nightRate) * busyMultiplier;
  const totalNaira = Math.round(dailyCost * coverageLength);

  return { totalNaira, totalHours };
}

/**
 * Returns the dynamic coverage label shown under the price on the summary screen.
 */
function getCoverageLabel(
  totalHours: number,
  coverageLength: number,
  coverageType: 'Standard' | 'Home Care'
): string {
  // Format hours: show as integer if whole, otherwise with decimal
  const hoursDisplay = totalHours % 1 === 0 ? String(totalHours) : totalHours.toFixed(1);

  if (coverageType === 'Home Care') {
    return `${hoursDisplay}-hour Home Care Coverage`;
  }

  // Single-day: booking fits within one calendar day
  if (coverageLength === 1) {
    return `${hoursDisplay}-hour Single-Day Coverage`;
  }

  // Straight multi-day: total hours divisible by 24 with no remainder
  const isStraight = totalHours >= 24 && totalHours % 24 === 0;
  if (isStraight) {
    return `${hoursDisplay}-hour Straight Multi-day Coverage`;
  }

  // Mixed multi-day
  return `${hoursDisplay}-hr Multi-day Coverage`;
}

function DragHandle({ panHandlers }: { panHandlers?: object }) {
  return (
    <View {...panHandlers} style={{ alignItems: 'center', paddingVertical: 8 }}>
      <View style={{ width: 36, height: 4, borderRadius: 99, backgroundColor: '#DEDEDE' }} />
    </View>
  );
}

export default function RequesterHomeScreen() {
  const insets = useSafeAreaInsets();
  const { setTabBarVisible } = useTabBarVisibility();
  const pricingConfig = usePricingConfig();

  const mapRef = useRef<MapView>(null);
  const [userCoords, setUserCoords] = useState<{ latitude: number; longitude: number } | null>(null);
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const locationSub = useRef<Location.LocationSubscription | null>(null);
  const hasInitialFix = useRef(false);

  // Sheet state
  const [sheetState, setSheetState] = useState<SheetState>('idle');
  const sheetAnim = useRef(new Animated.Value(SHEET_HEIGHTS.idle)).current;

  // Place
  const [selectedPlace, setSelectedPlace] = useState<SelectedPlace | null>(null);

  // Recent place
  const [recentPlace, setRecentPlace] = useState<SelectedPlace | null>(null);

  // Search (Places API New)
  const [searchText, setSearchText] = useState('');
  const [searchResults, setSearchResults] = useState<Array<{
    placeId: string;
    mainText: string;
    secondaryText: string;
  }>>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  // WAT now state
  const [watNow, setWatNow] = useState<Date>(() => new Date(Date.now() + 60 * 60 * 1000));

  // Date/time pickers
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showStartTimePicker, setShowStartTimePicker] = useState(false);
  const [showEndTimePicker, setShowEndTimePicker] = useState(false);

  // Matching progress
  const matchProgressAnim = useRef(new Animated.Value(0.05)).current;
  const [submitting, setSubmitting] = useState(false);

  // Matched doctor state
  const [matchedDoctor, setMatchedDoctor] = useState<{
    name: string;
    mdcn: string;
    rating: number;
    reliability: number;
    shift_summary: string;
  } | null>(null);
  const [activeRequestId, setActiveRequestId] = useState<string | null>(null);

  // Realtime refs for matching
  const matchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const realtimeChannelRef = useRef<any>(null);

  // ─── Load recent place on mount ───────────────────────────────────────────────
  useEffect(() => {
    AsyncStorage.getItem(RECENT_PLACE_KEY).then((raw) => {
      if (raw) {
        try {
          const parsed = JSON.parse(raw) as SelectedPlace;
          console.log('[RequesterHome] Loaded recent place:', parsed.name);
          setRecentPlace(parsed);
        } catch {
          console.log('[RequesterHome] Failed to parse recent place');
        }
      }
    });
  }, []);

  // ─── Location on mount — animate map to user position + stream ───────────────
  useEffect(() => {
    (async () => {
      console.log('[RequesterHome] Requesting location permission');
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status === 'granted') {
        locationSub.current = await Location.watchPositionAsync(
          { accuracy: Location.Accuracy.Highest, timeInterval: 2000, distanceInterval: 5, mayShowUserSettingsDialog: true },
          (loc) => {
            if (!hasInitialFix.current) {
              hasInitialFix.current = true;
              mapRef.current?.animateToRegion({
                latitude: loc.coords.latitude,
                longitude: loc.coords.longitude,
                latitudeDelta: 0.01,
                longitudeDelta: 0.01,
              }, 800);
            }
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

  // ─── Pulse animation loop ─────────────────────────────────────────────────────
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.6, duration: 1200, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1.0, duration: 600, useNativeDriver: true }),
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

  // ─── Clean up search state when leaving searching ─────────────────────────────
  useEffect(() => {
    if (sheetState !== 'searching') {
      setSearchText('');
      setSearchResults([]);
      if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    }
  }, [sheetState]);

  // ─── Places API (New) search ──────────────────────────────────────────────────
  const searchPlaces = useCallback(async (input: string) => {
    if (input.length < 2) {
      setSearchResults([]);
      return;
    }
    setSearchLoading(true);
    try {
      console.log('[PlacesNew] Searching for:', input);
      const response = await fetch('https://places.googleapis.com/v1/places:autocomplete', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': MAPS_KEY,
        },
        body: JSON.stringify({
          input,
          locationRestriction: {
            rectangle: {
              low: { latitude: 6.35, longitude: 2.68 },
              high: { latitude: 6.70, longitude: 3.75 },
            },
          },
          includedRegionCodes: ['ng'],
        }),
      });
      const data = await response.json();
      console.log('[PlacesNew] autocomplete response status:', response.status);
      if (data.suggestions) {
        setSearchResults(
          data.suggestions
            .filter((s: any) => s.placePrediction)
            .map((s: any) => ({
              placeId: s.placePrediction.placeId,
              mainText: s.placePrediction.structuredFormat?.mainText?.text ?? s.placePrediction.text?.text ?? '',
              secondaryText: s.placePrediction.structuredFormat?.secondaryText?.text ?? '',
            }))
        );
      } else {
        console.log('[PlacesNew] No suggestions:', JSON.stringify(data));
        setSearchResults([]);
      }
    } catch (e: any) {
      console.error('[PlacesNew] fetch error:', e.message);
      setSearchResults([]);
    } finally {
      setSearchLoading(false);
    }
  }, []);

  const handleSearchTextChange = useCallback((text: string) => {
    setSearchText(text);
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    searchDebounceRef.current = setTimeout(() => searchPlaces(text), 300);
  }, [searchPlaces]);

  const handlePlaceResultSelect = useCallback(async (placeId: string, mainText: string) => {
    console.log('[PlacesNew] Place result tapped:', mainText, placeId);
    Keyboard.dismiss();
    setSearchLoading(true);
    try {
      const response = await fetch(
        `https://places.googleapis.com/v1/places/${placeId}?fields=id,displayName,formattedAddress,location&key=${MAPS_KEY}`
      );
      const data = await response.json();
      console.log('[PlacesNew] place details:', JSON.stringify(data));
      if (!data.location) throw new Error('No location in place details');
      const address = data.formattedAddress || mainText;
      // Client-side Lagos safety check
      if (!address.toLowerCase().includes('lagos')) {
        console.log('[PlacesNew] Rejected non-Lagos result:', address);
        return;
      }
      const place: SelectedPlace = {
        name: data.displayName?.text || mainText,
        address,
        lat: data.location.latitude,
        lng: data.location.longitude,
      };
      console.log('[PlacesNew] Place selected:', place.name, { lat: place.lat, lng: place.lng });
      setSelectedPlace(place);
      setSearchText('');
      setSearchResults([]);
      // Save to recent
      AsyncStorage.setItem(RECENT_PLACE_KEY, JSON.stringify(place)).then(() => {
        console.log('[RequesterHome] Saved recent place:', place.name);
        setRecentPlace(place);
      });
      transitionTo('config');
    } catch (e: any) {
      console.error('[PlacesNew] place details error:', e.message);
      Alert.alert('Error', 'Could not load place details. Please try again.');
    } finally {
      setSearchLoading(false);
    }
  }, [transitionTo]);

  // ─── Recent place tap ─────────────────────────────────────────────────────────
  const handleRecentPlaceTap = useCallback(() => {
    if (!recentPlace) return;
    console.log('[RequesterHome] Recent place tapped:', recentPlace.name);
    setSelectedPlace(recentPlace);
    AsyncStorage.setItem(RECENT_PLACE_KEY, JSON.stringify(recentPlace));
    transitionTo('config');
  }, [recentPlace, transitionTo]);

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

  // ─── Realtime matching subscription + 180s timeout ───────────────────────────
  useEffect(() => {
    if (sheetState === 'matching' && activeRequestId) {
      console.log('[RequesterHome] Starting match timer and subscribing to requester channel:', activeRequestId);

      matchTimerRef.current = setTimeout(() => {
        console.log('[RequesterHome] Match timeout — no doctor accepted in 180s');
        Alert.alert(
          'No Match Found',
          'No doctor accepted your request at this time. Please try again or adjust your request parameters.',
          [{ text: 'OK', onPress: () => transitionTo('summary') }]
        );
      }, 180000);

      const channelName = `requester:${activeRequestId}`;
      realtimeChannelRef.current = supabase.channel(channelName)
        .on('broadcast', { event: 'MATCH_CONFIRMED' }, (payload) => {
          console.log('[RequesterHome] MATCH_CONFIRMED received:', JSON.stringify(payload));
          if (matchTimerRef.current) clearTimeout(matchTimerRef.current);
          const doctor = payload.payload?.doctor;
          setMatchedDoctor({
            name: doctor?.name || 'Dr. Unknown',
            mdcn: doctor?.mdcn || 'MDCN/R/00000',
            rating: doctor?.rating || 5.0,
            reliability: doctor?.reliability || 100,
            shift_summary: `${coverageType} · ${formattedDateShort} · ${formattedStartTime} – ${formattedEndTime}`,
          });
          transitionTo('matched');
        })
        .on('broadcast', { event: 'REQUEST_EXPIRED' }, () => {
          console.log('[RequesterHome] REQUEST_EXPIRED received');
          if (matchTimerRef.current) clearTimeout(matchTimerRef.current);
          Alert.alert('Request Expired', 'Your request expired. Please try again.');
          transitionTo('summary');
        })
        .subscribe((status) => {
          console.log('[RequesterHome] Realtime channel status:', channelName, status);
        });

      return () => {
        if (matchTimerRef.current) clearTimeout(matchTimerRef.current);
        if (realtimeChannelRef.current) {
          console.log('[RequesterHome] Removing realtime channel:', channelName);
          supabase.removeChannel(realtimeChannelRef.current);
          realtimeChannelRef.current = null;
        }
      };
    }
  }, [sheetState, activeRequestId]);

  // ─── Show tab bar only when idle ─────────────────────────────────────────────
  useEffect(() => {
    setTabBarVisible(sheetState === 'idle');
  }, [sheetState]);

  // ─── Drag handle PanResponder ─────────────────────────────────────────────────
  const handleResetRef = useRef<() => void>(() => {});

  const dragPanResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, gs) => gs.dy > 5,
      onPanResponderMove: () => {},
      onPanResponderRelease: (_, gs) => {
        if (gs.dy > 15) {
          console.log('[RequesterHome] Drag handle released — resetting');
          Keyboard.dismiss();
          handleResetRef.current();
        }
      },
      onPanResponderTerminate: (_, gs) => {
        if (gs.dy > 15) {
          console.log('[RequesterHome] Drag handle terminated — resetting');
          Keyboard.dismiss();
          handleResetRef.current();
        }
      },
    })
  ).current;

  // ─── Handlers ────────────────────────────────────────────────────────────────
  const handleSearchTap = () => {
    console.log('[RequesterHome] Search input tapped');
    transitionTo('searching');
  };

  const handleGoToSummary = () => {
    console.log('[RequesterHome] Proceeding to summary');
    transitionTo('summary');
  };

  const handleRequestCoverage = async () => {
    if (!selectedPlace) return;
    console.log('[RequesterHome] Request Coverage tapped — submitting to submit-request Edge Function');
    setSubmitting(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');
      console.log('[RequesterHome] Calling submit-request for place:', selectedPlace.name);
      const { totalNaira: submitPrice, totalHours: submitDurationHours } = calculateCoveragePrice(
        startTime, endTime, coverageLength, coverageType, environment, pricingConfig
      );

      // Construct ISO datetime strings for start_date and end_date
      const shiftDateStr = shiftDate.toISOString().split('T')[0]; // YYYY-MM-DD

      const startDateObj = new Date(shiftDate);
      startDateObj.setHours(startTime.getHours(), startTime.getMinutes(), 0, 0);

      const endDateObj = new Date(shiftDate);
      endDateObj.setHours(endTime.getHours(), endTime.getMinutes(), 0, 0);
      if (endDateObj <= startDateObj) {
        endDateObj.setDate(endDateObj.getDate() + 1);
      }

      const startDateISO = startDateObj.toISOString();
      const endDateISO = endDateObj.toISOString();
      console.log('[RequesterHome] Constructed start_date:', startDateISO, 'end_date:', endDateISO);

      const res = await fetch('https://juilousufwlsiqdcgllu.supabase.co/functions/v1/submit-request', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          hospital_name: selectedPlace.name,
          hospital_address: selectedPlace.address,
          latitude: selectedPlace.lat,
          longitude: selectedPlace.lng,
          shift_type: coverageType,
          shift_date: shiftDateStr,
          start_time: startTime.toTimeString().slice(0, 5),
          end_time: endTime.toTimeString().slice(0, 5),
          start_date: startDateISO,
          end_date: endDateISO,
          coverage_length: coverageLength,
          duration_hours: submitDurationHours,
          environment,
          note: note || null,
          price: submitPrice,
        }),
      });
      console.log('[RequesterHome] submit-request response status:', res.status);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as any).error || 'Could not submit request');
      }
      const data = await res.json();
      console.log('[RequesterHome] submit-request success, request_id:', data.request_id || data.id);
      setActiveRequestId(data.request_id || data.id || null);
      transitionTo('matching');
    } catch (e: any) {
      console.log('[RequesterHome] Submit error:', e.message);
      Alert.alert('Error', e.message || 'Could not submit request. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleReset = useCallback(() => {
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
    setActiveRequestId(null);
    setMatchedDoctor(null);
    transitionTo('idle');
  }, [transitionTo]);

  // Keep ref in sync so PanResponder can call it
  useEffect(() => {
    handleResetRef.current = handleReset;
  }, [handleReset]);

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
  const { totalNaira: coveragePrice, totalHours: coverageTotalHours } = calculateCoveragePrice(
    startTime, endTime, coverageLength, coverageType, environment, pricingConfig
  );
  const coveragePriceDisplay = `₦${coveragePrice.toLocaleString()}`;
  const coverageSubtitle = getCoverageLabel(coverageTotalHours, coverageLength, coverageType);
  const summaryPillText = `${coverageType} · ${formattedDateShort} · ${formattedStartTime}`;
  const coverageLengthLabel = coverageLength === 1 ? '1 day' : `${coverageLength} days`;
  const coverageTypeDesc = coverageType === 'Standard'
    ? 'For hospitals, clinics, facilities, and medical centers.'
    : 'For home visits and personal care.';
  const environmentDesc = environment === 'Normal'
    ? 'Standard working conditions.'
    : 'High patient volume expected.';

  const whiteCardPaddingBottom = Platform.OS === 'ios' ? insets.bottom + 16 : TAB_BAR_HEIGHT + insets.bottom + 16;

  // Max date = today + 15 days
  const maxDate = new Date(new Date().getTime() + 15 * 24 * 60 * 60 * 1000);

  const isPlusDisabled = coverageLength >= 15;

  // ─── Render ───────────────────────────────────────────────────────────────────
  return (
    <View style={{ flex: 1, backgroundColor: '#000' }}>

      {/* ── FULL-SCREEN MAP (always behind everything) ── */}
      <MapView
        ref={mapRef}
        style={StyleSheet.absoluteFillObject}
        provider={PROVIDER_GOOGLE}
        initialRegion={LAGOS_REGION}
        customMapStyle={MINIMALIST_MAP_STYLE}
        maxZoomLevel={14}
      >
        {userCoords && (
          <Marker coordinate={userCoords} anchor={{ x: 0.5, y: 0.5 }} tracksViewChanges={true}>
            <View style={{ width: 100, height: 100, alignItems: 'center', justifyContent: 'center' }}>
              <Animated.View style={{
                position: 'absolute', width: 100, height: 100, borderRadius: 50,
                backgroundColor: 'rgba(37,99,235,0.12)',
                transform: [{ scale: pulseAnim }],
                opacity: pulseAnim.interpolate({ inputRange: [1, 1.6], outputRange: [0.9, 0], extrapolate: 'clamp' }),
              }} />
              <View style={{ position: 'absolute', width: 60, height: 60, borderRadius: 30, backgroundColor: 'rgba(37,99,235,0.22)' }} />
              <View style={{ width: 18, height: 18, borderRadius: 9, backgroundColor: '#2563EB', borderWidth: 2.5, borderColor: '#FFFFFF', shadowColor: '#2563EB', shadowOpacity: 0.5, shadowRadius: 4, elevation: 4 }} />
            </View>
          </Marker>
        )}
      </MapView>

      {/* ── RE-CENTRE FAB ── */}
      {userCoords && (
        <TouchableOpacity
          onPress={() => {
            console.log('[RequesterHome] Re-centre FAB pressed');
            mapRef.current?.animateToRegion(
              { latitude: userCoords.latitude, longitude: userCoords.longitude, latitudeDelta: 0.08, longitudeDelta: 0.08 },
              500
            );
          }}
          activeOpacity={0.85}
          style={{
            position: 'absolute',
            top: insets.top + 16,
            right: 16,
            width: 44,
            height: 44,
            borderRadius: 22,
            backgroundColor: '#FFFFFF',
            justifyContent: 'center',
            alignItems: 'center',
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 2 },
            shadowOpacity: 0.15,
            shadowRadius: 6,
            elevation: 6,
          }}
        >
          <MapPin size={20} color="#1C1C1E" />
        </TouchableOpacity>
      )}

      {/* ── SUMMARY BACK BUTTON ── */}
      {sheetState === 'summary' && (
        <TouchableOpacity
          onPress={() => transitionTo('config')}
          activeOpacity={0.85}
          style={{
            position: 'absolute',
            top: insets.top + 12,
            left: 16,
            width: 44,
            height: 44,
            borderRadius: 22,
            backgroundColor: '#FFFFFF',
            justifyContent: 'center',
            alignItems: 'center',
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 2 },
            shadowOpacity: 0.12,
            shadowRadius: 8,
            elevation: 5,
          }}
        >
          <ArrowLeft size={20} color="#1C1C1E" />
        </TouchableOpacity>
      )}

      {/* ── NON-IDLE ANIMATED SHEET ── */}
      {sheetState !== 'idle' && (
        <Animated.View style={{
          position: 'absolute', bottom: 0, left: 0, right: 0,
          height: sheetAnim,
          backgroundColor: '#1C1C1E',
          borderTopLeftRadius: 28, borderTopRightRadius: 28,
          shadowColor: '#000', shadowOffset: { width: -4, height: 0 }, shadowOpacity: 0.10, shadowRadius: 16, elevation: 12,
          overflow: 'visible',
        }}>
          {/* SEARCHING */}
          {sheetState === 'searching' && (
            <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
              <View style={{ flex: 1, paddingTop: 20 }}>
                <DragHandle panHandlers={dragPanResponder.panHandlers} />

                {/* Search input */}
                <View style={{
                  marginHorizontal: 16,
                  marginTop: 8,
                  marginBottom: 8,
                  backgroundColor: '#2C2C2E',
                  borderRadius: 28,
                  borderWidth: 2,
                  borderColor: '#3A3A3C',
                  flexDirection: 'row',
                  alignItems: 'center',
                  paddingHorizontal: 14,
                  height: 50,
                }}>
                  <Search size={20} color="#8E8E93" strokeWidth={2.5} style={{ marginRight: 10 }} />
                  <TextInput
                    autoFocus
                    value={searchText}
                    onChangeText={handleSearchTextChange}
                    placeholder="Where is coverage needed?"
                    placeholderTextColor={COLORS.textTertiary}
                    style={{
                      flex: 1,
                      fontSize: 15,
                      color: '#FFFFFF',
                      height: 50,
                    }}
                    returnKeyType="search"
                    clearButtonMode="while-editing"
                  />
                  {searchLoading && (
                    <ActivityIndicator size="small" color={COLORS.textTertiary} />
                  )}
                </View>

                {/* Recent place — shown only when search is empty */}
                {searchText.length === 0 && recentPlace !== null && (
                  <View style={{ marginHorizontal: 16, marginBottom: 8 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8, marginTop: 4 }}>
                      <History size={13} color={COLORS.textTertiary} />
                      <Text style={{ fontSize: 11, fontWeight: '600', color: COLORS.textTertiary, letterSpacing: 0.8 }}>
                        RECENT
                      </Text>
                    </View>
                    <TouchableOpacity
                      onPress={handleRecentPlaceTap}
                      activeOpacity={0.7}
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        paddingHorizontal: 14,
                        paddingVertical: 12,
                        backgroundColor: '#2C2C2E',
                        borderRadius: 12,
                        gap: 12,
                      }}
                    >
                      <View style={{
                        width: 36, height: 36, borderRadius: 18,
                        backgroundColor: '#3A3A3C',
                        justifyContent: 'center', alignItems: 'center', flexShrink: 0,
                      }}>
                        <MapPin size={16} color={COLORS.textTertiary} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 14, fontWeight: '600', color: '#FFFFFF' }} numberOfLines={1}>
                          {recentPlace.name}
                        </Text>
                        <Text style={{ fontSize: 12, color: '#8E8E93', marginTop: 2 }} numberOfLines={1}>
                          {recentPlace.address}
                        </Text>
                      </View>
                    </TouchableOpacity>
                  </View>
                )}

                {/* Results list */}
                {searchResults.length > 0 && (
                  <ScrollView
                    keyboardShouldPersistTaps="handled"
                    style={{
                      marginHorizontal: 16,
                      backgroundColor: '#2C2C2E',
                      borderRadius: 12,
                      maxHeight: 300,
                    }}
                    showsVerticalScrollIndicator={false}
                  >
                    {searchResults.map((result, index) => (
                      <TouchableOpacity
                        key={result.placeId}
                        onPress={() => handlePlaceResultSelect(result.placeId, result.mainText)}
                        activeOpacity={0.7}
                        style={{
                          flexDirection: 'row',
                          alignItems: 'center',
                          paddingHorizontal: 14,
                          paddingVertical: 12,
                          borderBottomWidth: index < searchResults.length - 1 ? 1 : 0,
                          borderBottomColor: '#3A3A3C',
                          gap: 12,
                        }}
                      >
                        <View style={{
                          width: 36, height: 36, borderRadius: 18,
                          backgroundColor: '#3A3A3C',
                          justifyContent: 'center', alignItems: 'center', flexShrink: 0,
                        }}>
                          <MapPin size={16} color={COLORS.textTertiary} />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={{ fontSize: 14, fontWeight: '600', color: '#FFFFFF' }} numberOfLines={1}>
                            {result.mainText}
                          </Text>
                          {result.secondaryText ? (
                            <Text style={{ fontSize: 12, color: '#8E8E93', marginTop: 2 }} numberOfLines={1}>
                              {result.secondaryText}
                            </Text>
                          ) : null}
                        </View>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                )}

                {/* Empty state — only show after typing with no results */}
                {!searchLoading && searchText.length >= 2 && searchResults.length === 0 && (
                  <View style={{ alignItems: 'center', paddingTop: 32 }}>
                    <Text style={{ fontSize: 14, color: '#8E8E93' }}>No places found in Lagos</Text>
                  </View>
                )}
              </View>
            </KeyboardAvoidingView>
          )}

          {/* CONFIG */}
          {sheetState === 'config' && (
            <KeyboardAvoidingView
              style={{ flex: 1 }}
              behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
              keyboardVerticalOffset={0}
            >
            <ScrollView
              style={{ flex: 1 }}
              contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 80 }}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              <DragHandle panHandlers={dragPanResponder.panHandlers} />

              {/* Search row — tappable back to searching */}
              <TouchableOpacity
                onPress={handleSearchTap}
                activeOpacity={0.8}
                style={{
                  backgroundColor: '#2C2C2E',
                  borderRadius: 28,
                  padding: 14,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 10,
                  marginBottom: 12,
                }}
              >
                <Search size={18} color="#8E8E93" />
                <Text style={[TYPOGRAPHY.body, { color: '#8E8E93' }]}>
                  Where is coverage needed?
                </Text>
              </TouchableOpacity>

              {/* Selected location capsule — ITEM 1 */}
              {selectedPlace && (
                <View style={{
                  backgroundColor: '#2C2C2E',
                  borderRadius: 28,
                  padding: 14,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 10,
                  marginBottom: 16,
                }}>
                  <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: '#2DC653', flexShrink: 0 }} />
                  <View style={{ flex: 1 }}>
                    <Text style={[TYPOGRAPHY.bodyMedium, { color: '#FFFFFF' }]} numberOfLines={1} ellipsizeMode="tail">
                      {selectedPlace.name}
                    </Text>
                    <Text style={[TYPOGRAPHY.caption, { color: '#8E8E93' }]} numberOfLines={1} ellipsizeMode="tail">
                      {selectedPlace.address}
                    </Text>
                  </View>
                </View>
              )}

              {/* Coverage type toggle */}
              <View style={{ marginBottom: 8 }}>
                <View style={{
                  flexDirection: 'row',
                  backgroundColor: '#2C2C2E',
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
                <Text style={[TYPOGRAPHY.caption, { color: '#8E8E93', marginTop: 8, marginBottom: 16 }]}>
                  {coverageTypeDesc}
                </Text>
              </View>

              {/* Start Date + Start Time — ITEM 1 borderRadius 20 */}
              <View style={{ flexDirection: 'row', gap: 12, marginBottom: 16 }}>
                <TouchableOpacity
                  onPress={() => {
                    console.log('[RequesterHome] Start date picker opened');
                    setWatNow(new Date(Date.now() + 60 * 60 * 1000));
                    setShowDatePicker(true);
                  }}
                  style={{ flex: 1, backgroundColor: '#2C2C2E', borderRadius: 22, padding: 14 }}
                >
                  <Text style={[TYPOGRAPHY.label, { color: '#8E8E93', marginBottom: 6 }]}>
                    START DATE
                  </Text>
                  <Text style={[TYPOGRAPHY.body, { color: '#FFFFFF' }]}>
                    {formattedDate}
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={() => {
                    console.log('[RequesterHome] Start time picker opened');
                    setWatNow(new Date(Date.now() + 60 * 60 * 1000));
                    setShowStartTimePicker(true);
                  }}
                  style={{ flex: 1, backgroundColor: '#2C2C2E', borderRadius: 22, padding: 14 }}
                >
                  <Text style={[TYPOGRAPHY.label, { color: '#8E8E93', marginBottom: 6 }]}>
                    START TIME
                  </Text>
                  <Text style={[TYPOGRAPHY.body, { color: '#FFFFFF' }]}>
                    {formattedStartTime}
                  </Text>
                </TouchableOpacity>
              </View>

              {/* End Time + Coverage Length — ITEM 1 borderRadius 20 */}
              <View style={{ flexDirection: 'row', gap: 12, marginBottom: 16 }}>
                <TouchableOpacity
                  onPress={() => {
                    console.log('[RequesterHome] End time picker opened');
                    setWatNow(new Date(Date.now() + 60 * 60 * 1000));
                    setShowEndTimePicker(true);
                  }}
                  style={{ flex: 1, backgroundColor: '#2C2C2E', borderRadius: 22, padding: 14 }}
                >
                  <Text style={[TYPOGRAPHY.label, { color: '#8E8E93', marginBottom: 6 }]}>
                    END TIME
                  </Text>
                  <Text style={[TYPOGRAPHY.body, { color: '#FFFFFF' }]}>
                    {formattedEndTime}
                  </Text>
                </TouchableOpacity>

                {/* Coverage Length — ITEM 1 borderRadius 20, ITEM 5.1 cap at 15 */}
                <View style={{ flex: 1, backgroundColor: '#2C2C2E', borderRadius: 22, padding: 14 }}>
                  <Text style={[TYPOGRAPHY.label, { color: '#8E8E93', marginBottom: 6 }]}>
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
                        backgroundColor: '#3A3A3C',
                        justifyContent: 'center',
                        alignItems: 'center',
                      }}
                    >
                      <Text style={{ fontSize: 18, color: '#FFFFFF', lineHeight: 22 }}>−</Text>
                    </TouchableOpacity>
                    <Text style={[TYPOGRAPHY.body, { color: '#FFFFFF', minWidth: 50, textAlign: 'center' }]}>
                      {coverageLengthLabel}
                    </Text>
                    <TouchableOpacity
                      onPress={() => {
                        if (isPlusDisabled) return;
                        const next = Math.min(15, coverageLength + 1);
                        console.log('[RequesterHome] Coverage length incremented to:', next);
                        setCoverageLength(next);
                      }}
                      style={{
                        width: 32,
                        height: 32,
                        borderRadius: RADIUS.full,
                        backgroundColor: '#3A3A3C',
                        justifyContent: 'center',
                        alignItems: 'center',
                        opacity: isPlusDisabled ? 0.35 : 1,
                      }}
                      pointerEvents={isPlusDisabled ? 'none' : 'auto'}
                    >
                      <Text style={{ fontSize: 18, color: '#FFFFFF', lineHeight: 22 }}>+</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>

              {/* Environment — ITEM 2: wrapped in structured card, hidden for Home Care */}
              {coverageType === 'Standard' && (
              <View style={{
                backgroundColor: '#2C2C2E',
                borderRadius: 22,
                padding: 16,
                marginBottom: 16,
              }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                  <Text style={[TYPOGRAPHY.label, { color: '#8E8E93' }]}>ENVIRONMENT</Text>
                  <View style={{
                    flexDirection: 'row',
                    backgroundColor: '#3A3A3C',
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
                <Text style={[TYPOGRAPHY.caption, { color: '#8E8E93' }]}>
                  {environmentDesc}
                </Text>
              </View>
              )}

              {/* Note — ITEM 3: unified container */}
              <View style={{
                backgroundColor: '#2C2C2E',
                borderRadius: 22,
                padding: 16,
                marginBottom: 28,
              }}>
                <Text style={[TYPOGRAPHY.label, { color: '#8E8E93', marginBottom: 8 }]}>
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
                      backgroundColor: 'transparent',
                      textAlignVertical: 'top',
                      color: '#FFFFFF',
                    },
                  ]}
                />
              </View>

              {/* Next button */}
              <View style={{ alignItems: 'flex-end', marginTop: 8, marginBottom: 16 }}>
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
            </KeyboardAvoidingView>
          )}

          {/* SUMMARY */}
          {sheetState === 'summary' && (
            <View style={{ paddingHorizontal: 24, paddingBottom: insets.bottom + 24, paddingTop: 8 }}>
              <DragHandle panHandlers={dragPanResponder.panHandlers} />
              <Text style={{
                fontSize: 11,
                fontWeight: '600',
                letterSpacing: 1.4,
                color: COLORS.textSecondary,
                marginBottom: 10,
                marginTop: 8,
              }}>
                COVERAGE
              </Text>
              <Text style={{
                fontSize: 52,
                fontWeight: '800',
                color: '#FFFFFF',
                lineHeight: 60,
                letterSpacing: -1,
                marginBottom: 6,
              }}>
                {coveragePriceDisplay}
              </Text>
              <Text style={{
                fontSize: 15,
                fontWeight: '400',
                color: '#8E8E93',
                marginBottom: 32,
              }}>
                {coverageSubtitle}
              </Text>
              <TouchableOpacity
                onPress={handleRequestCoverage}
                disabled={submitting}
                activeOpacity={0.85}
                style={{
                  backgroundColor: submitting ? '#555' : '#FFFFFF',
                  borderRadius: 28,
                  paddingVertical: 18,
                  alignItems: 'center',
                  width: '100%',
                }}
              >
                <Text style={{
                  fontSize: 16,
                  fontWeight: '700',
                  color: '#1C1C1E',
                  letterSpacing: 0.2,
                }}>
                  {submitting ? 'Submitting...' : 'Request Coverage'}
                </Text>
              </TouchableOpacity>
            </View>
          )}

          {/* MATCHING */}
          {sheetState === 'matching' && (
            <View style={{ padding: 24, paddingBottom: insets.bottom + 16 }}>
              <DragHandle />
              <Text style={[TYPOGRAPHY.label, { color: '#8E8E93', letterSpacing: 1.2, marginBottom: 6 }]}>
                {selectedPlace ? selectedPlace.name.toUpperCase() : 'FACILITY'}
              </Text>
              <Text style={[TYPOGRAPHY.h2, { color: '#FFFFFF', marginBottom: 4 }]}>Medical Officer Found</Text>
              <Text style={[TYPOGRAPHY.body, { color: '#8E8E93', marginBottom: 24 }]}>Connecting to available doctors nearby</Text>

              {/* Progress bar with A/B labels */}
              <View style={{ width: '100%' }}>
                <View style={{ height: 4, borderRadius: 2, backgroundColor: '#2C2C2E', width: '100%', overflow: 'hidden' }}>
                  <Animated.View style={{
                    height: 4,
                    borderRadius: 2,
                    backgroundColor: '#2563EB',
                    width: matchProgressAnim.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }),
                  }} />
                </View>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 }}>
                  <Text style={{ fontSize: 12, color: '#8E8E93', fontFamily: 'Inter_400Regular' }}>A</Text>
                  <Text style={{ fontSize: 12, color: '#8E8E93', fontFamily: 'Inter_400Regular' }}>B</Text>
                </View>
              </View>

              <Text style={[TYPOGRAPHY.caption, { color: '#8E8E93', textAlign: 'center', marginTop: 8, marginBottom: 24 }]}>
                Checking nearby availability...
              </Text>

              <View style={{ flexDirection: 'row', gap: 12 }}>
                <TouchableOpacity
                  onPress={handleEditRequest}
                  style={{ flex: 1, backgroundColor: '#0A0A0A', borderRadius: RADIUS.full, paddingVertical: 14, alignItems: 'center' }}
                >
                  <Text style={[TYPOGRAPHY.bodyMedium, { color: '#FFFFFF' }]}>Edit Request</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={handleCancelRequest}
                  style={{ flex: 1, backgroundColor: '#FFFFFF', borderRadius: RADIUS.full, paddingVertical: 14, alignItems: 'center' }}
                >
                  <Text style={[TYPOGRAPHY.bodyMedium, { color: '#1C1C1E' }]}>Cancel Request</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* MATCHED — Doctor Accepted */}
          {sheetState === 'matched' && (
            <View style={{ padding: 20, paddingBottom: insets.bottom + 16 }}>
              <DragHandle />

              {/* Header label */}
              <Text style={{
                fontSize: 11,
                fontFamily: 'Inter_600SemiBold',
                letterSpacing: 1.4,
                color: '#8E8E93',
                marginTop: 8,
                marginBottom: 12,
              }}>
                DOCTOR ACCEPTED
              </Text>

              {/* Doctor profile card */}
              <View style={{
                backgroundColor: '#2C2C2E',
                borderRadius: 16,
                padding: 14,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 12,
                marginBottom: 16,
              }}>
                {/* Avatar placeholder */}
                <View style={{
                  width: 48,
                  height: 48,
                  borderRadius: 24,
                  backgroundColor: '#3A3A3C',
                  justifyContent: 'center',
                  alignItems: 'center',
                  flexShrink: 0,
                }}>
                  <Text style={{ fontSize: 20 }}>👨‍⚕️</Text>
                </View>

                {/* Doctor info */}
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 16, fontFamily: 'Inter_700Bold', color: '#FFFFFF' }}>
                    {matchedDoctor?.name || 'Dr. Unknown'}
                  </Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 3 }}>
                    <Text style={{ fontSize: 12, color: '#8E8E93' }}>
                      {matchedDoctor?.mdcn || 'MDCN/R/00000'}
                    </Text>
                    <Text style={{ fontSize: 12, color: '#F4A261' }}>
                      ★ {Number(matchedDoctor?.rating || 5.0).toFixed(1)}
                    </Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                      <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: '#34C759' }} />
                      <Text style={{ fontSize: 12, color: '#FFFFFF' }}>
                        {matchedDoctor?.reliability || 100}%
                      </Text>
                    </View>
                  </View>
                  <Text style={{ fontSize: 12, color: '#8E8E93', marginTop: 3 }} numberOfLines={1}>
                    {matchedDoctor?.shift_summary || ''}
                  </Text>
                </View>
              </View>

              {/* Reminder text */}
              <Text style={{
                fontSize: 14,
                color: '#8E8E93',
                fontFamily: 'Inter_400Regular',
                lineHeight: 20,
                marginBottom: 20,
              }}>
                Remember to start shift under Upcoming Coverage once the doctor arrives.
              </Text>

              {/* Action buttons */}
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <TouchableOpacity
                  onPress={() => {
                    console.log('[RequesterHome] Edit Shift pressed from matched state');
                    transitionTo('config');
                  }}
                  style={{
                    flex: 1,
                    backgroundColor: '#2C2C2E',
                    borderRadius: 999,
                    paddingVertical: 14,
                    alignItems: 'center',
                  }}
                >
                  <Text style={{ fontSize: 14, fontFamily: 'Inter_600SemiBold', color: '#FFFFFF' }}>
                    Edit Shift
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => {
                    console.log('[RequesterHome] Cancel Shift pressed from matched state');
                    handleReset();
                  }}
                  style={{
                    flex: 1,
                    backgroundColor: '#2C2C2E',
                    borderRadius: 999,
                    paddingVertical: 14,
                    alignItems: 'center',
                  }}
                >
                  <Text style={{ fontSize: 14, fontFamily: 'Inter_600SemiBold', color: '#FFFFFF' }}>
                    Cancel Shift
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => {
                    console.log('[RequesterHome] Call button pressed from matched state');
                  }}
                  style={{
                    flex: 1,
                    backgroundColor: '#FFFFFF',
                    borderRadius: 999,
                    paddingVertical: 14,
                    alignItems: 'center',
                    flexDirection: 'row',
                    justifyContent: 'center',
                    gap: 6,
                  }}
                >
                  <Text style={{ fontSize: 14, fontFamily: 'Inter_700Bold', color: '#1C1C1E' }}>
                    Call
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        </Animated.View>
      )}

      {/* ── MAP BACKDROP — above the sheet, covers only the map area above it ── */}
      {(sheetState === 'searching' || sheetState === 'config' || sheetState === 'matching') && (
        <Animated.View
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            height: Animated.subtract(new Animated.Value(SCREEN_HEIGHT), sheetAnim),
          }}
        >
          <Pressable
            onPress={() => { Keyboard.dismiss(); handleReset(); }}
            style={{ flex: 1 }}
          />
        </Animated.View>
      )}

      {/* ── IDLE BOTTOM CONTAINER (white card only — tab bar is in layout) ── */}
      {sheetState === 'idle' && (
        <View style={{ position: 'absolute', bottom: 0, left: 0, right: 0 }}>
          {/* White search card */}
          <View style={{
            backgroundColor: '#1C1C1E',
            borderTopLeftRadius: 24,
            borderTopRightRadius: 24,
            paddingTop: 16,
            paddingHorizontal: 16,
            paddingBottom: whiteCardPaddingBottom,
            minHeight: 180,
            shadowColor: '#000',
            shadowOffset: { width: 0, height: -3 },
            shadowOpacity: 0.08,
            shadowRadius: 10,
            elevation: 10,
          }}>
            {/* Drag handle */}
            <View style={{ alignItems: 'center', marginBottom: 16 }}>
              <View style={{ width: 40, height: 5, borderRadius: 99, backgroundColor: '#3A3A3C' }} />
            </View>
            {/* Search capsule */}
            <TouchableOpacity
              onPress={handleSearchTap}
              activeOpacity={0.8}
              style={{ backgroundColor: '#2C2C2E', borderRadius: 28, paddingVertical: 14, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 10 }}
            >
              <Search size={18} color="#8E8E93" />
              <Text style={{ fontSize: 15, fontWeight: '700', color: '#FFFFFF' }}>Where is coverage needed?</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Date picker modal — ITEM 5.2 maximumDate */}
      <Modal
        visible={showDatePicker}
        transparent
        animationType="slide"
        onRequestClose={() => setShowDatePicker(false)}
      >
        <TouchableWithoutFeedback onPress={() => setShowDatePicker(false)}>
          <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' }}>
            <TouchableWithoutFeedback>
              <View style={{ backgroundColor: '#1C1C1E', borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingBottom: insets.bottom + 8 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'flex-end', paddingHorizontal: 16, paddingTop: 12 }}>
                  <TouchableOpacity onPress={() => {
                    console.log('[RequesterHome] Date picker Done pressed');
                    setShowDatePicker(false);
                  }}>
                    <Text style={{ fontSize: 16, fontWeight: '600', color: '#FFFFFF' }}>Done</Text>
                  </TouchableOpacity>
                </View>
                <DateTimePicker
                  value={shiftDate}
                  mode="date"
                  display="spinner"
                  minimumDate={new Date()}
                  maximumDate={maxDate}
                  style={{ backgroundColor: '#1C1C1E' }}
                  textColor="#FFFFFF"
                  onChange={(event, date) => {
                    console.log('[RequesterHome] Date picker changed:', event.type, date);
                    if (date) {
                      // WAT validation: snap back to today if before WAT today
                      const watTodayStr = watNow.toISOString().split('T')[0];
                      const selectedStr = date.toISOString().split('T')[0];
                      if (selectedStr < watTodayStr) {
                        const todayWAT = new Date(watNow);
                        todayWAT.setUTCHours(0, 0, 0, 0);
                        setShiftDate(todayWAT);
                      } else {
                        setShiftDate(date);
                      }
                    }
                  }}
                />
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      {/* Start time picker modal — ITEM 4: custom picker */}
      <CustomTimePicker
        visible={showStartTimePicker}
        initialTime={startTime}
        isForDate={shiftDate}
        shiftDate={shiftDate}
        watNow={watNow}
        onDone={(date) => {
          console.log('[RequesterHome] Start time committed:', date.toTimeString().slice(0, 5));
          setStartTime(date);
          setShowStartTimePicker(false);
        }}
        onCancel={() => {
          console.log('[RequesterHome] Start time picker cancelled');
          setShowStartTimePicker(false);
        }}
      />

      {/* End time picker modal — ITEM 4: custom picker */}
      <CustomTimePicker
        visible={showEndTimePicker}
        initialTime={endTime}
        isForDate={shiftDate}
        shiftDate={shiftDate}
        watNow={watNow}
        onDone={(date) => {
          console.log('[RequesterHome] End time committed:', date.toTimeString().slice(0, 5));
          setEndTime(date);
          setShowEndTimePicker(false);
        }}
        onCancel={() => {
          console.log('[RequesterHome] End time picker cancelled');
          setShowEndTimePicker(false);
        }}
      />
    </View>
  );
}
