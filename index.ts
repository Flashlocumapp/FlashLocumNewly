// MUST be first — before errorLogger, polyfills, expo-router/entry
// Prevents CONTENT_APPEARED / RCTContentDidAppearNotification from auto-hiding
// the native splash before JS has a chance to call preventAutoHideAsync.
import * as SplashScreen from 'expo-splash-screen';
SplashScreen.preventAutoHideAsync().catch(() => {});

import './utils/errorLogger';
import './utils/polyfills/alert';
import 'expo-router/entry';
