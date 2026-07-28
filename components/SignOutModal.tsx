import React from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';

interface SignOutModalProps {
  visible: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

export default function SignOutModal({ visible, onCancel, onConfirm }: SignOutModalProps) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onCancel}
    >
      <TouchableOpacity
        style={styles.overlay}
        activeOpacity={1}
        onPress={onCancel}
      >
        <TouchableOpacity activeOpacity={1} onPress={() => {}}>
          <View style={styles.card}>
            <Text style={styles.title}>Sign Out?</Text>
            <Text style={styles.subtitle}>
              You will need to sign back in to access your account.
            </Text>

            <TouchableOpacity
              style={styles.primaryBtn}
              onPress={() => {
                console.log('[SignOutModal] "Stay Signed In" pressed');
                onCancel();
              }}
              activeOpacity={0.85}
            >
              <Text style={styles.primaryText}>Stay Signed In</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.destructiveBtn}
              onPress={() => {
                console.log('[SignOutModal] "Sign Out" confirmed');
                onConfirm();
              }}
              activeOpacity={0.8}
            >
              <Text style={styles.destructiveText}>Sign Out</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  card: {
    backgroundColor: '#1C1C1E',
    borderRadius: 24,
    padding: 28,
    width: '100%',
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: '#FFFFFF',
    textAlign: 'center',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    color: '#8E8E93',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 28,
  },
  primaryBtn: {
    backgroundColor: '#F9F9F6',
    borderRadius: 999,
    paddingVertical: 16,
    alignItems: 'center',
    marginBottom: 12,
  },
  primaryText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1C1C1E',
  },
  destructiveBtn: {
    backgroundColor: '#2C2C2E',
    borderRadius: 999,
    paddingVertical: 16,
    alignItems: 'center',
  },
  destructiveText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#FF3B30',
  },
});
