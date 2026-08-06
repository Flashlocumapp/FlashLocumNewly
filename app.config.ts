import appJson from './app.json';
import { ExpoConfig } from 'expo/config';

/**
 * isExpoGo = true  → strips onesignal-expo-plugin so Expo Go doesn't show
 *                    the "Not compatible with Expo Go" screen during dev.
 * isExpoGo = false → passes all plugins through unchanged for native builds.
 *
 * Set to false for all EAS / TestFlight builds.
 */
const isExpoGo = false; // Production — all plugins active

const config: ExpoConfig = {
  ...(appJson.expo as unknown as ExpoConfig),
  extra: {
    ...(appJson.expo.extra as Record<string, unknown>),
    eas: {
      projectId: '2e1c9549-69cf-4cd3-b5ca-4b922181897b',
    },
  },
  plugins: isExpoGo
    ? (appJson.expo.plugins as any[]).filter((p) => {
        const name = Array.isArray(p) ? p[0] : p;
        return name !== 'onesignal-expo-plugin';
      })
    : (appJson.expo.plugins as any[]),
};

export default config;
