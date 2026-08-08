// utils/prevent-splash.ts
// This module has NO other imports by design.
// Metro's Babel transform hoists ALL static imports to the top of each module's
// compiled output. A side-effect call (non-import statement) stays in place —
// after all hoisted requires. So if this file had other imports, preventAutoHideAsync
// would still run after them.
// By having only one import here, the require('expo-splash-screen') is hoisted to
// the top and the call executes immediately when this module evaluates — before
// errorLogger, polyfills, or expo-router/entry are required.
import * as SplashScreen from 'expo-splash-screen';
SplashScreen.preventAutoHideAsync().catch(() => {});
