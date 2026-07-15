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
import { COLORS, SPACING, RADIUS, TYPOGRAPHY } from '@/constants/Theme';

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

  const confirmBtnBg = isConfirmEnabled ? COLORS.danger : '#C7C7CC';
  const confirmBtnOpacity = isConfirmEnabled ? 1 : 0.7;

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
        <View style={styles.overlay}>
          <View style={styles.card}>

            {/* ── Step 1: Warning ── */}
            {step === 'warning' && (
              <Animated.View style={{ opacity: warningOpacity }}>
                <Text style={styles.warningIcon}>⚠️</Text>
                <Text style={styles.title}>Delete Account</Text>
                <Text style={styles.message}>
                  Are you sure you want to permanently delete your account? This action cannot be undone.
                </Text>
                <View style={styles.buttons}>
                  <TouchableOpacity
                    style={styles.cancelBtn}
                    onPress={handleCancel}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.cancelText}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.yesDeleteBtn]}
                    onPress={handleYesDelete}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.yesDeleteText}>Yes, Delete My Account</Text>
                  </TouchableOpacity>
                </View>
              </Animated.View>
            )}

            {/* ── Step 2: Type to confirm ── */}
            {step === 'confirm' && (
              <Animated.View style={{ opacity: confirmOpacity }}>
                <Text style={styles.title}>Delete Account</Text>
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
                  placeholderTextColor="#ADADAD"
                  autoCapitalize="none"
                  autoCorrect={false}
                  editable={!isDeleting}
                />

                {isDeleting ? (
                  <View style={styles.loadingRow}>
                    <ActivityIndicator size="small" color={COLORS.danger} />
                    <Text style={styles.loadingText}>Deleting account...</Text>
                  </View>
                ) : (
                  <View style={styles.buttons}>
                    <TouchableOpacity
                      style={styles.cancelBtn}
                      onPress={handleCancel}
                      activeOpacity={0.7}
                    >
                      <Text style={styles.cancelText}>Cancel</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[
                        styles.confirmBtn,
                        { backgroundColor: confirmBtnBg, opacity: confirmBtnOpacity },
                      ]}
                      onPress={handleConfirm}
                      disabled={!isConfirmEnabled}
                      activeOpacity={0.8}
                    >
                      <Text style={styles.confirmText}>Confirm Deletion</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </Animated.View>
            )}

          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: SPACING.xl,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: RADIUS.xl,
    paddingHorizontal: SPACING.xl,
    paddingTop: SPACING.xl,
    paddingBottom: SPACING.xxl,
    width: '100%',
    maxWidth: 380,
  },
  // ── Step 1 styles ──
  warningIcon: {
    fontSize: 40,
    textAlign: 'center',
    marginBottom: SPACING.sm,
  },
  yesDeleteBtn: {
    flex: 1,
    backgroundColor: COLORS.danger,
    borderRadius: RADIUS.full,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  yesDeleteText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
    textAlign: 'center',
  },
  // ── Shared styles ──
  title: {
    ...TYPOGRAPHY.h3,
    color: '#1C1C1E',
    textAlign: 'center',
    marginBottom: SPACING.sm,
  },
  message: {
    ...TYPOGRAPHY.body,
    color: '#6B6B6B',
    textAlign: 'center',
    marginBottom: SPACING.lg,
    lineHeight: 22,
  },
  deleteWord: {
    fontFamily: 'Inter_700Bold',
    color: '#1C1C1E',
  },
  input: {
    backgroundColor: '#EFEFEF',
    borderRadius: RADIUS.full,
    paddingHorizontal: SPACING.base,
    paddingVertical: 14,
    fontSize: 16,
    color: '#0A0A0A',
    marginBottom: SPACING.base,
    textAlign: 'center',
    letterSpacing: 1,
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    paddingVertical: SPACING.md,
  },
  loadingText: {
    ...TYPOGRAPHY.bodyMedium,
    color: '#8E8E93',
  },
  buttons: {
    flexDirection: 'row',
    gap: SPACING.sm,
    marginTop: SPACING.xs,
  },
  cancelBtn: {
    flex: 1,
    backgroundColor: '#EFEFEF',
    borderRadius: RADIUS.full,
    paddingVertical: 14,
    alignItems: 'center',
  },
  cancelText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1C1C1E',
  },
  confirmBtn: {
    flex: 1,
    borderRadius: RADIUS.full,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});
