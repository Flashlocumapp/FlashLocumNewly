import React, { useEffect, useRef, useState } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Animated,
} from 'react-native';

interface DeleteAccountModalProps {
  visible: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  isDeleting: boolean;
}

export default function DeleteAccountModal({
  visible,
  onCancel,
  onConfirm,
  isDeleting,
}: DeleteAccountModalProps) {
  const [inputText, setInputText] = useState('');
  const [step, setStep] = useState<'warning' | 'confirm'>('warning');

  const warningOpacity = useRef(new Animated.Value(1)).current;
  const confirmOpacity = useRef(new Animated.Value(0)).current;

  const isConfirmEnabled = inputText === 'DELETE';

  // Reset to warning step whenever modal closes
  useEffect(() => {
    if (!visible) {
      setStep('warning');
      setInputText('');
      warningOpacity.setValue(1);
      confirmOpacity.setValue(0);
    }
  }, [visible]);

  const animateToConfirm = () => {
    Animated.parallel([
      Animated.timing(warningOpacity, {
        toValue: 0,
        duration: 180,
        useNativeDriver: true,
      }),
      Animated.timing(confirmOpacity, {
        toValue: 1,
        duration: 180,
        useNativeDriver: true,
      }),
    ]).start(() => setStep('confirm'));
  };

  const handleYesDelete = () => {
    console.log('[DeleteAccountModal] "Yes, Delete My Account" pressed — advancing to confirm step');
    animateToConfirm();
  };

  const handleCancel = () => {
    console.log('[DeleteAccountModal] Cancel pressed — step:', step);
    setInputText('');
    setStep('warning');
    warningOpacity.setValue(1);
    confirmOpacity.setValue(0);
    onCancel();
  };

  const handleConfirm = () => {
    console.log('[DeleteAccountModal] Confirm Deletion pressed — input matched DELETE');
    setInputText('');
    onConfirm();
  };

  const handleRequestClose = () => {
    if (!isDeleting) {
      handleCancel();
    }
  };

  const confirmBtnBg = isConfirmEnabled ? '#FF3B30' : '#3A3A3C';

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={handleRequestClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.overlay}
      >
        <TouchableOpacity
          style={styles.overlayTouchable}
          activeOpacity={1}
          onPress={handleRequestClose}
        >
          <TouchableOpacity activeOpacity={1} onPress={() => {}}>
            <View style={styles.card}>

              {/* ── Step 1: Warning ── */}
              {step === 'warning' && (
                <Animated.View style={{ opacity: warningOpacity }}>
                  <Text style={styles.title}>Delete Account</Text>
                  <Text style={styles.message}>
                    Are you sure you want to permanently delete your account? This action cannot be undone.
                  </Text>
                  <TouchableOpacity
                    style={styles.primaryBtn}
                    onPress={handleCancel}
                    activeOpacity={0.85}
                  >
                    <Text style={styles.primaryText}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.destructiveBtn}
                    onPress={handleYesDelete}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.destructiveText}>Yes, Delete My Account</Text>
                  </TouchableOpacity>
                </Animated.View>
              )}

              {/* ── Step 2: Type to confirm ── */}
              {step === 'confirm' && (
                <Animated.View style={{ opacity: confirmOpacity }}>
                  <Text style={styles.title}>Confirm Deletion</Text>
                  <Text style={styles.message}>
                    This action is permanent and cannot be undone. Type{' '}
                    <Text style={styles.deleteWord}>DELETE</Text>
                    {' '}below to confirm.
                  </Text>

                  <TextInput
                    style={styles.input}
                    value={inputText}
                    onChangeText={(t) => {
                      setInputText(t);
                    }}
                    placeholder="Type DELETE to confirm"
                    placeholderTextColor="#636366"
                    autoCapitalize="none"
                    autoCorrect={false}
                    editable={!isDeleting}
                  />

                  {isDeleting ? (
                    <View style={styles.loadingRow}>
                      <ActivityIndicator size="small" color="#FF3B30" />
                      <Text style={styles.loadingText}>Deleting account...</Text>
                    </View>
                  ) : (
                    <>
                      <TouchableOpacity
                        style={styles.primaryBtn}
                        onPress={handleCancel}
                        activeOpacity={0.85}
                      >
                        <Text style={styles.primaryText}>Cancel</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.confirmBtn, { backgroundColor: confirmBtnBg }]}
                        onPress={handleConfirm}
                        disabled={!isConfirmEnabled}
                        activeOpacity={0.8}
                      >
                        <Text style={styles.confirmText}>Confirm Deletion</Text>
                      </TouchableOpacity>
                    </>
                  )}
                </Animated.View>
              )}

            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
  },
  overlayTouchable: {
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
  message: {
    fontSize: 14,
    color: '#8E8E93',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 28,
  },
  deleteWord: {
    fontWeight: '700',
    color: '#FF3B30',
  },
  input: {
    backgroundColor: '#2C2C2E',
    borderRadius: 999,
    paddingHorizontal: 20,
    paddingVertical: 16,
    fontSize: 15,
    color: '#FFFFFF',
    marginBottom: 16,
    textAlign: 'center',
    letterSpacing: 1,
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 16,
  },
  loadingText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#8E8E93',
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
  confirmBtn: {
    borderRadius: 999,
    paddingVertical: 16,
    alignItems: 'center',
  },
  confirmText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#FFFFFF',
  },
});
