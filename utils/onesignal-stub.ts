/**
 * TEMPORARY: No-op stub for react-native-onesignal.
 * Metro resolves react-native-onesignal to this file when IS_EXPO_GO is true,
 * so TurboModuleRegistry.getEnforcing("OneSignal") is never called in Expo Go.
 *
 * To re-enable OneSignal: remove the resolveRequest hook in metro.config.js.
 * This file can then be deleted.
 */

const noop = () => {};
const noopAsync = async () => {};

const noopHandler = {
  addEventListener: noop,
  removeEventListener: noop,
  hasPermission: noopAsync,
  requestPermission: noopAsync,
  clearAll: noop,
};

export const OneSignal = {
  initialize: noop,
  login: noop,
  logout: noop,
  setConsentGiven: noop,
  setConsentRequired: noop,
  Notifications: {
    ...noopHandler,
    permissionNative: noopAsync,
    canRequestPermission: noopAsync,
    registerForProvisionalAuthorization: noop,
  },
  InAppMessages: {
    addTrigger: noop,
    removeTrigger: noop,
    clearTriggers: noop,
    setPaused: noop,
    addClickListener: noop,
    removeClickListener: noop,
    addWillDisplayListener: noop,
    removeWillDisplayListener: noop,
    addDidDisplayListener: noop,
    removeDidDisplayListener: noop,
    addWillDismissListener: noop,
    removeWillDismissListener: noop,
    addDidDismissListener: noop,
    removeDidDismissListener: noop,
  },
  Location: {
    requestPermission: noop,
    isShared: noopAsync,
    setShared: noop,
  },
  User: {
    addTag: noop,
    removeTag: noop,
    addTags: noop,
    removeTags: noop,
    getTags: noopAsync,
    addAlias: noop,
    removeAlias: noop,
    addAliases: noop,
    removeAliases: noop,
    addEmail: noop,
    removeEmail: noop,
    addSms: noop,
    removeSms: noop,
    pushSubscription: {
      id: null,
      token: null,
      optedIn: false,
      optIn: noop,
      optOut: noop,
      addEventListener: noop,
      removeEventListener: noop,
    },
  },
  Debug: {
    setLogLevel: noop,
    setAlertLevel: noop,
  },
  LiveActivities: {
    enter: noopAsync,
    exit: noopAsync,
    setPushToStartToken: noopAsync,
    removePushToStartToken: noopAsync,
    setupDefault: noop,
    startDefault: noopAsync,
  },
};

export const LogLevel = {
  None: 0,
  Fatal: 1,
  Error: 2,
  Warn: 3,
  Info: 4,
  Debug: 5,
  Verbose: 6,
};

export default { OneSignal, LogLevel };
