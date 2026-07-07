// ============================================================
// ONESIGNAL TEMPORARILY DISABLED FOR EXPO GO TESTING
// Re-enable when Apple Developer account is approved:
//   1. Restore the original contents of this file (git history)
//   2. Re-add the onesignal-expo-plugin to app.json plugins
// ============================================================

import React, { createContext, useContext, useCallback, ReactNode } from "react";

export interface NotificationContextType {
  hasPermission: boolean;
  permissionDenied: boolean;
  loading: boolean;
  isWeb: boolean;
  requestPermission: () => Promise<boolean>;
  sendTag: (key: string, value: string) => void;
  deleteTag: (key: string) => void;
  lastNotification: Record<string, unknown> | null;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

interface NotificationProviderProps {
  children: ReactNode;
}

export function NotificationProvider({ children }: NotificationProviderProps) {
  const requestPermission = useCallback(async (): Promise<boolean> => {
    console.log("[Notifications] requestPermission called (OneSignal disabled for Expo Go)");
    return false;
  }, []);

  const sendTag = useCallback((_key: string, _value: string) => {
    // no-op
  }, []);

  const deleteTag = useCallback((_key: string) => {
    // no-op
  }, []);

  return (
    <NotificationContext.Provider
      value={{
        hasPermission: false,
        permissionDenied: false,
        loading: false,
        isWeb: false,
        requestPermission,
        sendTag,
        deleteTag,
        lastNotification: null,
      }}
    >
      {children}
    </NotificationContext.Provider>
  );
}

export function useNotifications() {
  const context = useContext(NotificationContext);
  if (context === undefined) {
    throw new Error("useNotifications must be used within NotificationProvider");
  }
  return context;
}
