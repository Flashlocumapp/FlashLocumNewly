import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Linking,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { ChevronRight } from 'lucide-react-native';

function CardDivider() {
  return <View style={styles.cardDivider} />;
}

export default function ContactSupportScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const handleWhatsApp = () => {
    Linking.openURL('https://wa.me/2349134336851');
  };

  const handleEmail = () => {
    Linking.openURL('mailto:support@flashlocum.com');
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => {
            router.back();
          }}
          activeOpacity={0.7}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name="chevron-back" size={24} color="#1C1C1E" />
        </TouchableOpacity>
        <Text style={styles.title}>Contact Support</Text>
        <View style={styles.headerSpacer} />
      </View>

      {/* Rows */}
      <View style={styles.card}>
        <TouchableOpacity style={styles.cardRow} onPress={handleWhatsApp} activeOpacity={0.7}>
          <View style={styles.rowLeft}>
            <Ionicons name="logo-whatsapp" size={20} color="#25D366" style={styles.rowIcon} />
            <Text style={styles.rowLabel}>WhatsApp Support</Text>
          </View>
          <ChevronRight size={16} color="#8E8E93" />
        </TouchableOpacity>
        <CardDivider />
        <TouchableOpacity style={styles.cardRow} onPress={handleEmail} activeOpacity={0.7}>
          <View style={styles.rowLeft}>
            <Ionicons name="mail-outline" size={20} color="#8E8E93" style={styles.rowIcon} />
            <Text style={styles.rowLabel}>Email Support</Text>
          </View>
          <ChevronRight size={16} color="#8E8E93" />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F5F0', paddingHorizontal: 16 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    marginBottom: 8,
  },
  backButton: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    flex: 1,
    fontSize: 18,
    fontWeight: '700',
    color: '#1C1C1E',
    textAlign: 'center',
  },
  headerSpacer: { width: 36 },
  card: { backgroundColor: '#F9F9F6', borderRadius: 16, overflow: 'hidden', marginTop: 16 },
  cardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  rowLeft: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  rowIcon: { marginRight: 12 },
  rowLabel: { fontSize: 14, color: '#6B6B6B' },
  cardDivider: { height: 1, backgroundColor: '#E5E5E5', marginLeft: 16 },
});
