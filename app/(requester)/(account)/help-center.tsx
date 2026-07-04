import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  LayoutAnimation,
  Platform,
  UIManager,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

interface AccordionSection {
  id: number;
  title: string;
  content: React.ReactNode;
}

function Bold({ children }: { children: string }) {
  return <Text style={styles.boldText}>{children}</Text>;
}

function Bullet({ text }: { text: string }) {
  return (
    <View style={styles.bulletRow}>
      <Text style={styles.bodyText}>{'• '}</Text>
      <Text style={styles.bodyText}>{text}</Text>
    </View>
  );
}

function Numbered({ num, text }: { num: number; text: string }) {
  const numStr = String(num);
  return (
    <View style={styles.bulletRow}>
      <Text style={styles.bodyText}>{numStr}</Text>
      <Text style={styles.bodyText}>{'. '}</Text>
      <Text style={styles.bodyText}>{text}</Text>
    </View>
  );
}

const sections: AccordionSection[] = [
  {
    id: 1,
    title: 'How FlashLocum Works',
    content: (
      <View>
        <Text style={styles.bodyText}>
          FlashLocum is a platform that connects pharmacies and healthcare facilities with qualified locum professionals for short-term coverage.
        </Text>
        <Text style={[styles.bodyText, { marginTop: 12 }]}>
          <Bold>For Requesters (Pharmacies/Facilities):</Bold>
        </Text>
        <Bullet text="Post coverage requests for specific dates and times" />
        <Bullet text="Browse and select from available locum professionals" />
        <Bullet text="Manage bookings and track coverage in real-time" />
        <Text style={[styles.bodyText, { marginTop: 12 }]}>
          <Bold>For Locums (Doctors/Pharmacists):</Bold>
        </Text>
        <Bullet text="Browse available coverage opportunities" />
        <Bullet text="Accept shifts that fit your schedule" />
        <Bullet text="Get paid directly through the platform" />
      </View>
    ),
  },
  {
    id: 2,
    title: 'How Payments Work',
    content: (
      <View>
        <Text style={styles.bodyText}>
          FlashLocum uses a secure, transparent payment system to ensure both requesters and locums are protected.
        </Text>
        <Text style={[styles.bodyText, { marginTop: 12 }]}>
          <Bold>Payment Process:</Bold>
        </Text>
        <Bullet text="Requesters fund the shift upfront when confirming a booking" />
        <Bullet text="Funds are held securely until the shift is completed" />
        <Bullet text="Locums receive payment within 24–48 hours after shift completion" />
        <Text style={[styles.bodyText, { marginTop: 12 }]}>
          <Bold>Payment Methods:</Bold>
        </Text>
        <Bullet text="Bank transfer" />
        <Bullet text="Card payment" />
        <Bullet text="Wallet balance" />
        <Text style={[styles.bodyText, { marginTop: 12 }]}>
          <Bold>Important Notes:</Bold>
        </Text>
        <Bullet text="All payments are processed in Nigerian Naira (NGN)" />
        <Bullet text="A small platform fee applies to each transaction" />
        <Bullet text="Refunds are processed within 3–5 business days if a shift is cancelled within the allowed window" />
      </View>
    ),
  },
  {
    id: 3,
    title: 'Ratings Score',
    content: (
      <View>
        <Text style={styles.bodyText}>
          The Ratings Score reflects the quality of service provided by a locum professional, as rated by requesters after each completed shift.
        </Text>
        <Text style={[styles.bodyText, { marginTop: 12 }]}>
          <Bold>How it works:</Bold>
        </Text>
        <Bullet text="After each completed shift, requesters are prompted to rate the locum" />
        <Bullet text="Ratings are on a scale of 1 to 5 stars" />
        <Bullet text="The overall rating is the average of all received ratings" />
        <Text style={[styles.bodyText, { marginTop: 12 }]}>
          <Bold>Why it matters:</Bold>
        </Text>
        <Bullet text="A higher rating increases a locum's visibility on the platform" />
        <Bullet text="Requesters can filter locums by rating when making a booking" />
        <Bullet text="Consistently low ratings may result in account review" />
      </View>
    ),
  },
  {
    id: 4,
    title: 'Reliability Score',
    content: (
      <View>
        <Text style={styles.bodyText}>
          The Reliability Score measures how dependable a locum professional is — based on their history of accepting, showing up for, and completing shifts.
        </Text>
        <Text style={[styles.bodyText, { marginTop: 12 }]}>
          <Bold>How it's calculated:</Bold>
        </Text>
        <Bullet text="Accepting confirmed bookings without cancelling" />
        <Bullet text="Showing up on time for shifts" />
        <Bullet text="Completing the full duration of booked shifts" />
        <Text style={[styles.bodyText, { marginTop: 12 }]}>
          <Bold>Score ranges:</Bold>
        </Text>
        <Bullet text="90–100%: Excellent — highly reliable" />
        <Bullet text="75–89%: Good — generally dependable" />
        <Bullet text="50–74%: Fair — some reliability concerns" />
        <Bullet text="Below 50%: Poor — at risk of account suspension" />
      </View>
    ),
  },
  {
    id: 5,
    title: 'Single-Day Coverage Request',
    content: (
      <View>
        <Text style={styles.bodyText}>
          A single-day coverage request is used when you need a locum for one specific day.
        </Text>
        <Text style={[styles.bodyText, { marginTop: 12 }]}>
          <Bold>Steps to post a single-day request:</Bold>
        </Text>
        <Numbered num={1} text={'Tap "New Request" on your dashboard'} />
        <Numbered num={2} text={'Select "Single Day" as the coverage type'} />
        <Numbered num={3} text="Enter the date, start time, and end time" />
        <Numbered num={4} text="Add any special notes or requirements" />
        <Numbered num={5} text="Submit and wait for locum applications" />
        <Text style={[styles.bodyText, { marginTop: 12 }]}>
          <Bold>Tips:</Bold>
        </Text>
        <Bullet text="Post requests at least 24 hours in advance for better locum availability" />
        <Bullet text="Be specific about the role and any required skills or certifications" />
        <Bullet text="You can edit the request before a locum is confirmed" />
      </View>
    ),
  },
  {
    id: 6,
    title: 'Multi-Day Coverage Request',
    content: (
      <View>
        <Text style={styles.bodyText}>
          A multi-day coverage request allows you to book a locum for several consecutive or non-consecutive days.
        </Text>
        <Text style={[styles.bodyText, { marginTop: 12 }]}>
          <Bold>Steps to post a multi-day request:</Bold>
        </Text>
        <Numbered num={1} text={'Tap "New Request" on your dashboard'} />
        <Numbered num={2} text={'Select "Multi Day" as the coverage type'} />
        <Numbered num={3} text="Choose your start and end dates" />
        <Numbered num={4} text="Set the daily working hours" />
        <Numbered num={5} text="Add notes and submit" />
        <Text style={[styles.bodyText, { marginTop: 12 }]}>
          <Bold>Key differences from single-day:</Bold>
        </Text>
        <Bullet text="You can select a date range instead of a single date" />
        <Bullet text="The total cost is calculated across all selected days" />
        <Bullet text="The same locum covers all days in the booking (no split coverage)" />
        <Text style={[styles.bodyText, { marginTop: 12 }]}>
          <Bold>Tips:</Bold>
        </Text>
        <Bullet text="Ideal for holiday cover, maternity leave, or extended absences" />
        <Bullet text="Confirm the locum's availability for the full date range before booking" />
      </View>
    ),
  },
];

function AccordionItem({ section, isOpen, onToggle }: { section: AccordionSection; isOpen: boolean; onToggle: () => void }) {
  const chevronRotation = isOpen ? '180deg' : '0deg';

  return (
    <View>
      <TouchableOpacity style={styles.accordionHeader} onPress={onToggle} activeOpacity={0.7}>
        <Text style={styles.accordionTitle}>{section.title}</Text>
        <Ionicons
          name="chevron-down"
          size={18}
          color="#8E8E93"
          style={{ transform: [{ rotate: chevronRotation }] }}
        />
      </TouchableOpacity>
      {isOpen && (
        <View style={styles.accordionBody}>
          {section.content}
        </View>
      )}
    </View>
  );
}

export default function HelpCenterScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [openSection, setOpenSection] = useState<number | null>(null);

  const handleToggle = (id: number) => {
    console.log('[HelpCenter] Accordion section toggled:', id);
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setOpenSection((prev) => (prev === id ? null : id));
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => {
            console.log('[HelpCenter] Back pressed');
            router.back();
          }}
          activeOpacity={0.7}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name="chevron-back" size={24} color="#FFFFFF" />
        </TouchableOpacity>
        <Text style={styles.title}>Help Center</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 32 }]}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.subtitle}>
          Everything requesters need to know about using FlashLocum.
        </Text>

        <View style={styles.card}>
          {sections.map((section, index) => (
            <View key={section.id}>
              <AccordionItem
                section={section}
                isOpen={openSection === section.id}
                onToggle={() => handleToggle(section.id)}
              />
              {index < sections.length - 1 && <View style={styles.sectionDivider} />}
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#1C1C1E' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 16,
    marginBottom: 4,
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
    color: '#FFFFFF',
    textAlign: 'center',
  },
  headerSpacer: { width: 36 },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 16 },
  subtitle: {
    fontSize: 14,
    color: '#8E8E93',
    marginBottom: 20,
    lineHeight: 20,
  },
  card: { backgroundColor: '#F9F9F6', borderRadius: 16, overflow: 'hidden' },
  accordionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  accordionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1C1C1E',
    flex: 1,
    marginRight: 8,
  },
  accordionBody: {
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  bodyText: {
    fontSize: 14,
    color: '#6B6B6B',
    lineHeight: 22,
  },
  boldText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1C1C1E',
    lineHeight: 22,
  },
  bulletRow: {
    flexDirection: 'row',
    paddingLeft: 8,
    marginTop: 2,
  },
  sectionDivider: {
    height: 1,
    backgroundColor: '#E5E5E5',
    marginLeft: 16,
  },
});
