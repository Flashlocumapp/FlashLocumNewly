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

export default function HelpCenterScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [openId, setOpenId] = useState<number | null>(null);

  const toggle = (id: number) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setOpenId(prev => (prev === id ? null : id));
  };

  const sections = [
    {
      id: 1,
      title: 'How FlashLocum Works',
      body: () => (
        <View>
          <Text style={styles.bodyText}>Hospitals create coverage requests for doctors.</Text>
          <View style={styles.bulletRow}>
            <Text style={styles.bodyText}>{'• '}</Text>
            <Text style={styles.bodyText}>Requesters post shift requests.</Text>
          </View>
          <View style={styles.bulletRow}>
            <Text style={styles.bodyText}>{'• '}</Text>
            <Text style={styles.bodyText}>Doctors accept or decline requests.</Text>
          </View>
          <View style={styles.bulletRow}>
            <Text style={styles.bodyText}>{'• '}</Text>
            <Text style={styles.bodyText}>Only accepted doctors appear on the shift.</Text>
          </View>
          <Text style={[styles.bodyText, { marginTop: 10 }]}>
            <Text style={styles.boldText}>Requesters manage the shift lifecycle:</Text>
          </Text>
          <View style={styles.bulletRow}>
            <Text style={styles.bodyText}>{'• '}</Text>
            <Text style={styles.bodyText}>Start Shift</Text>
          </View>
          <View style={styles.bulletRow}>
            <Text style={styles.bodyText}>{'• '}</Text>
            <Text style={styles.bodyText}>Pause Shift</Text>
          </View>
          <View style={styles.bulletRow}>
            <Text style={styles.bodyText}>{'• '}</Text>
            <Text style={styles.bodyText}>End Shift</Text>
          </View>
          <Text style={[styles.bodyText, { marginTop: 10 }]}>
            <Text style={styles.boldText}>A request can be:</Text>
          </Text>
          <View style={styles.bulletRow}>
            <Text style={styles.bodyText}>{'• '}</Text>
            <Text style={styles.bodyText}>Single-day</Text>
          </View>
          <View style={styles.bulletRow}>
            <Text style={styles.bodyText}>{'• '}</Text>
            <Text style={styles.bodyText}>Multi-day (up to 14 days)</Text>
          </View>
        </View>
      ),
    },
    {
      id: 2,
      title: 'How Payments Work',
      body: () => (
        <View>
          <Text style={styles.bodyText}>Requesters pay for doctor coverage.</Text>

          <Text style={[styles.subHeading, { marginTop: 12 }]}>Single-day shifts</Text>
          <View style={styles.bulletRow}>
            <Text style={styles.bodyText}>{'• '}</Text>
            <Text style={styles.bodyText}>Payment is made at the end of the shift</Text>
          </View>
          <View style={styles.bulletRow}>
            <Text style={styles.bodyText}>{'• '}</Text>
            <Text style={styles.bodyText}>After requester clicks End Shift</Text>
          </View>
          <View style={styles.bulletRow}>
            <Text style={styles.bodyText}>{'• '}</Text>
            <Text style={styles.bodyText}>Payment is confirmed via Monnify</Text>
          </View>
          <Text style={[styles.bodyText, { marginTop: 8 }]}>
            <Text style={styles.boldText}>After confirmation:</Text>
          </Text>
          <View style={styles.bulletRow}>
            <Text style={styles.bodyText}>{'• '}</Text>
            <Text style={styles.bodyText}>Shift is closed</Text>
          </View>
          <View style={styles.bulletRow}>
            <Text style={styles.bodyText}>{'• '}</Text>
            <Text style={styles.bodyText}>Doctor is paid by FlashLocum</Text>
          </View>
          <View style={styles.bulletRow}>
            <Text style={styles.bodyText}>{'• '}</Text>
            <Text style={styles.bodyText}>Ratings are triggered for both sides</Text>
          </View>
          <Text style={[styles.bodyText, { marginTop: 8 }]}>
            If payment is not completed within 15 minutes of clicking End Shift, the shift remains open and billing continues in additional 15-minute blocks until payment is successfully completed.
          </Text>

          <Text style={[styles.subHeading, { marginTop: 14 }]}>Multi-day shifts</Text>
          <View style={styles.bulletRow}>
            <Text style={styles.bodyText}>{'• '}</Text>
            <Text style={styles.bodyText}>A multi-day shift can last up to 14 consecutive days</Text>
          </View>
          <View style={styles.bulletRow}>
            <Text style={styles.bodyText}>{'• '}</Text>
            <Text style={styles.bodyText}>Payment is made only at the end of the entire shift</Text>
          </View>
          <View style={styles.bulletRow}>
            <Text style={styles.bodyText}>{'• '}</Text>
            <Text style={styles.bodyText}>There is no daily payment</Text>
          </View>
          <View style={styles.bulletRow}>
            <Text style={styles.bodyText}>{'• '}</Text>
            <Text style={styles.bodyText}>There is no payment during pause or resume</Text>
          </View>
          <Text style={[styles.bodyText, { marginTop: 8 }]}>
            <Text style={styles.boldText}>At the end of the shift:</Text>
          </Text>
          <View style={styles.bulletRow}>
            <Text style={styles.bodyText}>{'• '}</Text>
            <Text style={styles.bodyText}>Requester clicks End Shift</Text>
          </View>
          <View style={styles.bulletRow}>
            <Text style={styles.bodyText}>{'• '}</Text>
            <Text style={styles.bodyText}>Payment is made once for the full duration</Text>
          </View>
          <Text style={[styles.bodyText, { marginTop: 8 }]}>
            <Text style={styles.boldText}>After payment confirmation:</Text>
          </Text>
          <View style={styles.bulletRow}>
            <Text style={styles.bodyText}>{'• '}</Text>
            <Text style={styles.bodyText}>Shift is closed permanently</Text>
          </View>
          <View style={styles.bulletRow}>
            <Text style={styles.bodyText}>{'• '}</Text>
            <Text style={styles.bodyText}>Doctor is paid by FlashLocum</Text>
          </View>
          <View style={styles.bulletRow}>
            <Text style={styles.bodyText}>{'• '}</Text>
            <Text style={styles.bodyText}>Ratings are triggered for both sides</Text>
          </View>
          <Text style={[styles.bodyText, { marginTop: 8 }]}>
            If payment is not completed within 15 minutes of clicking End Shift, the shift remains open and billing continues in additional 15-minute blocks until payment is successfully completed.
          </Text>
        </View>
      ),
    },
    {
      id: 3,
      title: 'Ratings Score',
      body: () => (
        <View>
          <Text style={styles.subHeading}>How your Rating Score is calculated</Text>
          <View style={styles.bulletRow}>
            <Text style={styles.bodyText}>{'• '}</Text>
            <Text style={styles.bodyText}>After every completed shift, doctors and requesters can rate each other from 1–5 stars.</Text>
          </View>
          <View style={styles.bulletRow}>
            <Text style={styles.bodyText}>{'• '}</Text>
            <Text style={styles.bodyText}>Your Rating Score shows the average of your most recent ratings.</Text>
          </View>
          <View style={styles.bulletRow}>
            <Text style={styles.bodyText}>{'• '}</Text>
            <Text style={styles.bodyText}>All users start with a 5.0 rating when they join FlashLocum.</Text>
          </View>

          <Text style={[styles.subHeading, { marginTop: 14 }]}>Why is my Rating Score important?</Text>
          <View style={styles.bulletRow}>
            <Text style={styles.bodyText}>{'• '}</Text>
            <Text style={styles.bodyText}>Your Rating Score helps build trust on the platform.</Text>
          </View>
          <View style={styles.bulletRow}>
            <Text style={styles.bodyText}>{'• '}</Text>
            <Text style={styles.bodyText}>Doctors may be more likely to accept requests from highly rated hospitals.</Text>
          </View>
          <View style={styles.bulletRow}>
            <Text style={styles.bodyText}>{'• '}</Text>
            <Text style={styles.bodyText}>A strong rating reflects professionalism, reliability, communication, and overall shift experience.</Text>
          </View>

          <Text style={[styles.subHeading, { marginTop: 14 }]}>Tips for maintaining a high Rating Score</Text>
          <View style={styles.bulletRow}>
            <Text style={styles.bodyText}>{'• '}</Text>
            <Text style={styles.bodyText}><Text style={styles.boldText}>Be professional</Text> — communicate clearly and respectfully before, during, and after shifts.</Text>
          </View>
          <View style={styles.bulletRow}>
            <Text style={styles.bodyText}>{'• '}</Text>
            <Text style={styles.bodyText}><Text style={styles.boldText}>Provide accurate information</Text> — ensure shift details, expectations, and requirements are clear.</Text>
          </View>
          <View style={styles.bulletRow}>
            <Text style={styles.bodyText}>{'• '}</Text>
            <Text style={styles.bodyText}><Text style={styles.boldText}>Honour commitments</Text> — avoid cancelling accepted bookings unless absolutely necessary.</Text>
          </View>
          <View style={styles.bulletRow}>
            <Text style={styles.bodyText}>{'• '}</Text>
            <Text style={styles.bodyText}><Text style={styles.boldText}>Maintain good communication</Text> — keep doctors informed of important updates or unexpected issues.</Text>
          </View>
          <View style={styles.bulletRow}>
            <Text style={styles.bodyText}>{'• '}</Text>
            <Text style={styles.bodyText}><Text style={styles.boldText}>Create a positive experience</Text> — treat doctors professionally and respectfully throughout the coverage period.</Text>
          </View>

          <Text style={[styles.subHeading, { marginTop: 14 }]}>Minimum Rating Requirement</Text>
          <View style={styles.bulletRow}>
            <Text style={styles.bodyText}>{'• '}</Text>
            <Text style={styles.bodyText}>Requesters should maintain a Rating Score of at least 3.5.</Text>
          </View>
          <View style={styles.bulletRow}>
            <Text style={styles.bodyText}>{'• '}</Text>
            <Text style={styles.bodyText}>Consistently low ratings may result in account review or platform restrictions.</Text>
          </View>
        </View>
      ),
    },
    {
      id: 4,
      title: 'Reliability Score',
      body: () => (
        <View>
          <Text style={styles.subHeading}>How your Reliability Score is calculated</Text>
          <View style={styles.bulletRow}>
            <Text style={styles.bodyText}>{'• '}</Text>
            <Text style={styles.bodyText}>Your Reliability Score measures how consistently you honour accepted shift commitments.</Text>
          </View>
          <View style={styles.bulletRow}>
            <Text style={styles.bodyText}>{'• '}</Text>
            <Text style={styles.bodyText}>Only cancellations made AFTER a doctor has accepted a shift affect Reliability.</Text>
          </View>
          <View style={styles.bulletRow}>
            <Text style={styles.bodyText}>{'• '}</Text>
            <Text style={styles.bodyText}>Cancelling a request before acceptance does not affect your Reliability Score.</Text>
          </View>
          <View style={styles.bulletRow}>
            <Text style={styles.bodyText}>{'• '}</Text>
            <Text style={styles.bodyText}>All users start with 100% Reliability when they join FlashLocum.</Text>
          </View>

          <Text style={[styles.subHeading, { marginTop: 14 }]}>Why is my Reliability Score important?</Text>
          <View style={styles.bulletRow}>
            <Text style={styles.bodyText}>{'• '}</Text>
            <Text style={styles.bodyText}>Reliability helps doctors know they can depend on you.</Text>
          </View>
          <View style={styles.bulletRow}>
            <Text style={styles.bodyText}>{'• '}</Text>
            <Text style={styles.bodyText}>Doctors prefer reliable hospitals.</Text>
          </View>
          <View style={styles.bulletRow}>
            <Text style={styles.bodyText}>{'• '}</Text>
            <Text style={styles.bodyText}>Higher reliability improves trust and platform experience.</Text>
          </View>

          <Text style={[styles.subHeading, { marginTop: 14 }]}>Tips for maintaining a high Reliability Score</Text>
          <View style={styles.bulletRow}>
            <Text style={styles.bodyText}>{'• '}</Text>
            <Text style={styles.bodyText}><Text style={styles.boldText}>Only create shifts you intend to fill</Text> — avoid creating requests that may later be cancelled.</Text>
          </View>
          <View style={styles.bulletRow}>
            <Text style={styles.bodyText}>{'• '}</Text>
            <Text style={styles.bodyText}><Text style={styles.boldText}>Avoid last-minute cancellations</Text> — late cancellations disrupt doctors who have already committed their time.</Text>
          </View>
          <View style={styles.bulletRow}>
            <Text style={styles.bodyText}>{'• '}</Text>
            <Text style={styles.bodyText}><Text style={styles.boldText}>Plan ahead</Text> — confirm staffing requirements before creating requests.</Text>
          </View>
          <View style={styles.bulletRow}>
            <Text style={styles.bodyText}>{'• '}</Text>
            <Text style={styles.bodyText}><Text style={styles.boldText}>Communicate early</Text> — if circumstances change, notify the doctor as soon as possible.</Text>
          </View>

          <Text style={[styles.subHeading, { marginTop: 14 }]}>Minimum Reliability Requirement</Text>
          <View style={styles.bulletRow}>
            <Text style={styles.bodyText}>{'• '}</Text>
            <Text style={styles.bodyText}>Minimum Reliability Score: 75%.</Text>
          </View>
          <View style={styles.bulletRow}>
            <Text style={styles.bodyText}>{'• '}</Text>
            <Text style={styles.bodyText}>Accounts that repeatedly cancel accepted shifts may be reviewed or restricted.</Text>
          </View>
        </View>
      ),
    },
    {
      id: 5,
      title: 'Single-Day Coverage Request',
      body: () => (
        <View>
          <Text style={styles.bodyText}>
            <Text style={styles.boldText}>Flow:</Text>
          </Text>
          <View style={styles.bulletRow}>
            <Text style={styles.bodyText}>{'• '}</Text>
            <Text style={styles.bodyText}>Create request → Doctor accepts → Start Shift → End Shift</Text>
          </View>
          <View style={styles.bulletRow}>
            <Text style={styles.bodyText}>{'• '}</Text>
            <Text style={styles.bodyText}>Payment is made after shift ends</Text>
          </View>
          <View style={styles.bulletRow}>
            <Text style={styles.bodyText}>{'• '}</Text>
            <Text style={styles.bodyText}>Rating is completed after payment confirmation</Text>
          </View>
        </View>
      ),
    },
    {
      id: 6,
      title: 'Multi-Day Coverage Request',
      body: () => (
        <View>
          <Text style={styles.bodyText}>
            <Text style={styles.boldText}>Flow:</Text>
          </Text>
          <View style={styles.bulletRow}>
            <Text style={styles.bodyText}>{'• '}</Text>
            <Text style={styles.bodyText}>Create request (e.g. Mon–Wed)</Text>
          </View>
          <View style={styles.bulletRow}>
            <Text style={styles.bodyText}>{'• '}</Text>
            <Text style={styles.bodyText}>Doctor accepts assignment</Text>
          </View>
          <View style={styles.bulletRow}>
            <Text style={styles.bodyText}>{'• '}</Text>
            <Text style={styles.bodyText}>Start Shift → Pause/Resume → End Shift</Text>
          </View>
          <View style={styles.bulletRow}>
            <Text style={styles.bodyText}>{'• '}</Text>
            <Text style={styles.bodyText}>No partial payments during the shift</Text>
          </View>
          <View style={styles.bulletRow}>
            <Text style={styles.bodyText}>{'• '}</Text>
            <Text style={styles.bodyText}>Payment happens only at final End Shift</Text>
          </View>
          <View style={styles.bulletRow}>
            <Text style={styles.bodyText}>{'• '}</Text>
            <Text style={styles.bodyText}>Rating happens once at the end</Text>
          </View>

          <View style={styles.importantBox}>
            <Text style={styles.importantLabel}>IMPORTANT</Text>
            <View style={styles.bulletRow}>
              <Text style={styles.importantBody}>{'• '}</Text>
              <Text style={styles.importantBody}>Requesters cannot modify payment rules</Text>
            </View>
            <View style={styles.bulletRow}>
              <Text style={styles.importantBody}>{'• '}</Text>
              <Text style={styles.importantBody}>All payments are triggered only after final confirmation</Text>
            </View>
            <View style={styles.bulletRow}>
              <Text style={styles.importantBody}>{'• '}</Text>
              <Text style={styles.importantBody}>Ratings and reliability updates happen only after payment confirmation</Text>
            </View>
            <View style={styles.bulletRow}>
              <Text style={styles.importantBody}>{'• '}</Text>
              <Text style={styles.importantBody}>Doctors must complete shifts to be eligible for payment</Text>
            </View>
          </View>
        </View>
      ),
    },
  ];

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.back()}
          activeOpacity={0.7}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name="chevron-back" size={24} color="#1C1C1E" />
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
          {sections.map((section, index) => {
            const isOpen = openId === section.id;
            const chevronRotation = isOpen ? '180deg' : '0deg';
            return (
              <View key={section.id}>
                <TouchableOpacity
                  style={styles.accordionHeader}
                  onPress={() => toggle(section.id)}
                  activeOpacity={0.7}
                >
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
                    {section.body()}
                  </View>
                )}
                {index < sections.length - 1 && <View style={styles.sectionDivider} />}
              </View>
            );
          })}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F5F0' },
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
    color: '#1C1C1E',
    textAlign: 'center',
  },
  headerSpacer: { width: 36 },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 16 },
  subtitle: {
    fontSize: 14,
    color: '#6B6B6B',
    marginBottom: 20,
    lineHeight: 20,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  accordionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  accordionTitle: {
    fontSize: 15,
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
  subHeading: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1C1C1E',
    lineHeight: 22,
    marginBottom: 4,
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
  importantBox: {
    backgroundColor: '#FFF8E1',
    borderWidth: 1,
    borderColor: '#FFD54F',
    borderRadius: 12,
    padding: 12,
    marginTop: 16,
  },
  importantLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#E65100',
    marginBottom: 6,
  },
  importantBody: {
    fontSize: 14,
    color: '#5D4037',
    lineHeight: 22,
  },
});
