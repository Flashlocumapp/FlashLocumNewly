// prevent-splash MUST be the first import.
// It is a single-import module so preventAutoHideAsync() executes before
// errorLogger, polyfills, or expo-router/entry are evaluated.
import './utils/prevent-splash';

import './utils/errorLogger';
import './utils/polyfills/alert';
import 'expo-router/entry';
