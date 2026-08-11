import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  StyleSheet,
  ScrollView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ChevronLeft, ChevronRight } from 'lucide-react-native';
import { supabase, fetchWithAuth } from '@/lib/supabase';
import { SUPABASE_URL } from '@/constants/api';
import DeleteAccountModal from '@/components/DeleteAccountModal';
import { logLifecycleStarted, logLifecycleCompleted, logLifecycleFailed } from '@/utils/errorLogger';

function Card({ children }: { children: React.ReactNode }) {
  return <View style={styles.card}>{children}</View>;
}

function ActionRow({ label, onPress, labelRed, chevronRed }: { label: string; onPress: () => void; labelRed?: boolean; chevronRed?: boolean }) {
  return (
    <TouchableOpacity style={styles.cardRow} onPress={onPress} activeOpacity={0.7}>
      <Text style={[styles.rowLabel, labelRed && styles.rowLabelRed]}>{label}</Text>
      <ChevronRight size={16} color={chevronRed ? '#E63946' : '#8E8E93'} />
    </TouchableOpacity>
  );
}

export default function RequesterPersonalDataScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [deleting, setDeleting] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);

  const handleDeleteAccount = () => {
    console.log('[Requester Personal Data] Delete Account pressed');
    setShowDeleteModal(true);
  };

  const handleConfirmDelete = async () => {
    console.log('[Requester Personal Data] Confirm delete account');
    setDeleting(true);
    let deleteActionId: string | null = null;
    try {
      try {
        deleteActionId = logLifecycleStarted('DELETE_ACCOUNT', { screen: 'PersonalData' });
      } catch { /* logging must never block the action */ }
      await supabase.auth.refreshSession();
      const res = await fetchWithAuth(`${SUPABASE_URL}/functions/v1/delete-account`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      if (!res.ok) throw new Error('Account deletion failed on server. Please try again.');
      logLifecycleCompleted('DELETE_ACCOUNT', deleteActionId ?? '', { screen: 'PersonalData' });
      await supabase.auth.signOut();
      router.replace('/');
    } catch (err: unknown) {
      setDeleting(false);
      Alert.alert('Error', 'Could not delete account. Please contact support.');
      logLifecycleFailed('DELETE_ACCOUNT', deleteActionId, {
        severity: 'critical',
        screen: 'PersonalData',
        failure_stage: 'edge_function',
        message: err instanceof Error ? err.message : String(err),
      });
    }
  };

  if (deleting) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#1C1C1E" />
        <Text style={styles.deletingText}>Deleting account...</Text>
      </View>
    );
  }

  return (
    <>
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => {
            console.log('[Requester Personal Data] Back pressed');
            router.back();
          }}
          activeOpacity={0.7}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <ChevronLeft size={24} color="#1C1C1E" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Your Personal Data</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView
        style={styles.container}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 32 }]}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.sectionHeader}>ACCOUNT CONTROL</Text>
        <Card>
          <ActionRow label="Delete Account" onPress={handleDeleteAccount} labelRed chevronRed />
        </Card>
      </ScrollView>

      <DeleteAccountModal
        visible={showDeleteModal}
        onCancel={() => {
          console.log('[Requester Personal Data] Delete modal cancelled');
          setShowDeleteModal(false);
        }}
        onConfirm={handleConfirmDelete}
        isDeleting={deleting}
      />
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F7F7F5' },
  scrollContent: { paddingHorizontal: 16, paddingTop: 8 },
  loadingContainer: { flex: 1, backgroundColor: '#F7F7F5', alignItems: 'center', justifyContent: 'center' },
  deletingText: { marginTop: 16, fontSize: 14, color: '#8E8E93' },
  header: {
    backgroundColor: '#FFFFFF',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E5E5E5',
  },
  backButton: { width: 32, alignItems: 'flex-start' },
  headerTitle: { flex: 1, textAlign: 'center', fontSize: 17, fontWeight: '700', color: '#1C1C1E' },
  headerSpacer: { width: 32 },
  sectionHeader: { fontSize: 11, fontWeight: '700', color: '#8E8E93', letterSpacing: 1, marginBottom: 8, marginTop: 24, marginLeft: 4 },
  card: { backgroundColor: '#FFFFFF', borderRadius: 16, overflow: 'hidden' },
  cardRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14 },
  rowLabel: { fontSize: 14, color: '#6B6B6B', flex: 1 },
  rowLabelRed: { color: '#E63946' },
});
