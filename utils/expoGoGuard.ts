/**
 * TEMPORARY: OneSignal is disabled in Expo Go because react-native-onesignal
 * depends on native modules that Expo Go does not include.
 *
 * IS_EXPO_GO is true only when running inside the Expo Go client (executionEnvironment
 * === 'storeClient'). It is false for EAS development builds, APK/AAB builds,
 * TestFlight, and production — all of which include the native OneSignal module.
 *
 * To re-enable full native push testing: delete this file and remove all
 * `if (IS_EXPO_GO)` guards that reference it.
 */
import Constants from 'expo-constants';

export const IS_EXPO_GO =
  Constants.executionEnvironment === 'storeClient';
