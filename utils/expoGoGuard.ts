/**
 * TEMPORARY: OneSignal is disabled in Expo Go because react-native-onesignal
 * depends on native modules that Expo Go does not include.
 *
 * IS_EXPO_GO is hardcoded to true while Expo Go preview is needed.
 *
 * To re-enable full OneSignal in native builds, replace the hardcoded true with:
 *   import Constants from 'expo-constants';
 *   export const IS_EXPO_GO = Constants.executionEnvironment === 'storeClient';
 *
 * Or delete this file and remove all IS_EXPO_GO guards.
 */

// TEMPORARY — replace with Constants check when native push testing resumes
export const IS_EXPO_GO = true;
