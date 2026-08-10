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
import { useAuth } from '@/contexts/AuthContext';
import { supabase, fetchWithAuth } from '@/lib/supabase';
import { SUPABASE_URL } from '@/constants/api';
import DeleteAccountModal from '@/components/DeleteAccountModal';

function CardDivider() {
  return <View style={styles.cardDivider} />;
}

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

export default function DoctorAccountSettingsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useAuth();

  const [deleting, setDeleting] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);

  const handleDeleteAccount = () => {
    console.log('[Doctor Account Settings] Delete Account pressed — opening confirmation modal');
    setShowDeleteModal(true);
  };

  const handleConfirmDelete = async () => {
    console.log('[Doctor Account Settings] Delete Account confirmed, proceeding with deletion');
    setDeleting(true);
    try {
      // Force a fresh token before deletion — prevents 401 from expired sessions
      await supabase.auth.refreshSession();
      console.log('[Doctor Account Settings] Calling delete-account edge function');
      const res = await fetchWithAuth(
        `${SUPABASE_URL}/functions/v1/delete-account`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        },
      );
      console.log('[Doctor Account Settings] delete-account response status:', res.status);
      if (!res.ok) {
        throw new Error('Account deletion failed on server. Please try again.');
      }
      console.log('[Doctor Account Settings] Signing out after delete');
      await supabase.auth.signOut();
      router.replace('/');
    } catch (err: unknown) {
      console.error('[Doctor Account Settings] Delete account error:', err);
      setDeleting(false);
      Alert.alert('Error', 'Could not delete account. Please contact support.');
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
          onPress={() => { console.log('[Doctor Account Settings] Back pressed'); router.back(); }}
          activeOpacity={0.7}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <ChevronLeft size={24} color="#1C1C1E" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Account Settings</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView
        style={styles.container}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 32 }]}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.sectionHeader}>DANGER ZONE</Text>
        <Card>
          <ActionRow label="Delete Account" onPress={handleDeleteAccount} labelRed chevronRed />
        </Card>
      </ScrollView>

      <DeleteAccountModal
        visible={showDeleteModal}
        onCancel={() => setShowDeleteModal(false)}
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
  cardDivider: { height: 1, backgroundColor: '#E5E5E5', marginLeft: 16 },
  rowLabel: { fontSize: 14, color: '#6B6B6B', flex: 1 },
  rowLabelRed: { color: '#E63946' },
});
