import Constants from 'expo-constants';

/**
 * True only when running inside Expo Go (storeClient execution environment).
 * False in all native builds: APK, AAB, and iOS IPA.
 *
 * Used to gate react-native-onesignal and other native-only modules that
 * Expo Go does not include.
 */
export const IS_EXPO_GO =
  Constants.executionEnvironment === 'storeClient';
