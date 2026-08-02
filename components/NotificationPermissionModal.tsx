import React from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Pressable,
} from 'react-native';

interface Props {
  visible: boolean;
  role: 'doctor' | 'requester';
  onContinue: () => void;
  onDismiss: () => void;
}

export default function NotificationPermissionModal({ visible, role, onContinue, onDismiss }: Props) {
  const isDoctorRole = role === 'doctor';
  const messageText = isDoctorRole
    ? "Turn on notifications so you don't miss new coverage requests and important shift updates."
    : "Turn on notifications so you know when a doctor accepts your request and when a shift is approaching.";

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onDismiss}
    >
      <Pressable style={styles.backdrop} onPress={onDismiss}>
        <Pressable onPress={(e) => e.stopPropagation()}>
          <View style={styles.card}>
            <View style={styles.iconContainer}>
              <Text style={styles.bellIcon}>🔔</Text>
            </View>

            <Text style={styles.title}>Stay in the Loop</Text>
            <Text style={styles.message}>{messageText}</Text>

            <TouchableOpacity
              style={styles.primaryButton}
              onPress={() => {
                console.log('[NotificationPermissionModal] Turn On Notifications pressed role=', role);
                onContinue();
              }}
              activeOpacity={0.85}
            >
              <Text style={styles.primaryButtonText}>Turn On Notifications</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.dismissButton}
              onPress={() => {
                console.log('[NotificationPermissionModal] Not Now pressed role=', role);
                onDismiss();
              }}
              activeOpacity={0.7}
            >
              <Text style={styles.dismissButtonText}>Not Now</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  card: {
    backgroundColor: '#1C1C1E',
    borderRadius: 24,
    padding: 28,
    width: '100%',
    alignItems: 'center',
  },
  iconContainer: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#1E3A5F',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  bellIcon: {
    fontSize: 36,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 12,
    textAlign: 'center',
  },
  message: {
    fontSize: 15,
    color: '#EBEBF5CC',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 28,
  },
  primaryButton: {
    backgroundColor: '#2563EB',
    borderRadius: 999,
    paddingVertical: 16,
    paddingHorizontal: 32,
    alignItems: 'center',
    width: '100%',
    marginBottom: 12,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  dismissButton: {
    paddingVertical: 10,
    alignItems: 'center',
  },
  dismissButtonText: {
    color: '#8E8E93',
    fontSize: 15,
    fontWeight: '500',
  },
});
