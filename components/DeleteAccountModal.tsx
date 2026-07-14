import React, { useState } from 'react';
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

  const isConfirmEnabled = inputText === 'DELETE';

  const handleCancel = () => {
    console.log('[DeleteAccountModal] Cancel pressed');
    setInputText('');
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
