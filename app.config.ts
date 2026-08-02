import appJson from './app.json';
import { ExpoConfig } from 'expo/config';

/**
 * TEMPORARY: onesignal-expo-plugin is excluded when EXPO_PUBLIC_IS_EXPO_GO=true
 * so the Expo Go compatibility warning is suppressed.
 *
 * For all native builds (EAS dev build, APK, TestFlight, production) the plugin
 * is always included. Remove the filter below when Expo Go support is no longer needed.
 */
const isExpoGo = process.env.EXPO_PUBLIC_IS_EXPO_GO === 'true';

const config: ExpoConfig = {
  ...(appJson.expo as unknown as ExpoConfig),
  plugins: isExpoGo
    ? (appJson.expo.plugins as any[]).filter(
        (p) => {
          const name = Array.isArray(p) ? p[0] : p;
          return name !== 'onesignal-expo-plugin';
        }
      )
    : (appJson.expo.plugins as any[]),
};

export default config;
