import appJson from './app.json';
import { ExpoConfig } from 'expo/config';

/**
 * TEMPORARY: onesignal-expo-plugin is always excluded here so Expo Go
 * does not show the "Not compatible with Expo Go" screen.
 *
 * Native builds (EAS dev build, APK, AAB, TestFlight, production) use
 * app.json directly and always include the plugin — this file only affects
 * the Expo Go / Metro dev-server config path.
 *
 * To re-enable: set isExpoGo = false, or delete this file entirely.
 */
const isExpoGo = false; // Production — onesignal-expo-plugin is active

const config: ExpoConfig = {
  ...(appJson.expo as unknown as ExpoConfig),
  extra: {
    ...(appJson.expo.extra as Record<string, unknown> ?? {}),
    eas: {
      projectId: '2e1c9549-69cf-4cd3-b5ca-4b922181897b',
    },
  },
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
