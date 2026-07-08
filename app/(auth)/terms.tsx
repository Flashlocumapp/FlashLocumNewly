import React from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AnimatedPressable } from '@/components/AnimatedPressable';

type Section = {
  heading?: string;
  body: string;
};

const SECTIONS: Section[] = [
  {
    body: 'These Terms of Service ("Terms") govern your access to and use of the FlashLocum platform ("FlashLocum", "we", "us", or "our").',
  },
  {
    body: 'By creating an account, accessing, or using FlashLocum, you agree to be bound by these Terms. If you do not agree, you should not use the platform.',
  },
  {
    body: 'Your use of FlashLocum is also governed by our Privacy Policy.',
  },
  {
    heading: '1. About FlashLocum',
    body: 'FlashLocum is a technology platform that connects verified post-NYSC medical doctors with hospitals, clinics, healthcare organizations, and other approved requesters seeking temporary locum medical cover.\n\nThe platform allows users to: Request temporary medical coverage · Accept or decline locum opportunities · Coordinate shift schedules · Facilitate payments after completed shifts · Maintain ratings and reliability scores\n\nFlashLocum is a technology platform only. FlashLocum is not: A hospital · A healthcare provider · A medical practice · An employer · A recruitment or staffing agency',
  },
  {
    heading: '2. Eligibility',
    body: 'To use FlashLocum, you must: Be at least 18 years old · Provide accurate and complete registration information · Maintain the accuracy of your account information · Comply with all applicable laws and professional regulations.\n\nDoctors must: Be qualified post-NYSC medical practitioners · Successfully complete FlashLocum\'s verification process before accepting shifts.\n\nWe reserve the right to approve, reject, suspend, restrict, or terminate accounts at our discretion where necessary to protect the integrity and safety of the platform.',
  },
  {
    heading: '3. Platform Role',
    body: 'FlashLocum provides technology that enables requesters and doctors to find and coordinate temporary medical cover.\n\nFlashLocum does not: Employ doctors · Supervise medical treatment · Control clinical decisions · Guarantee that requests will be accepted · Guarantee the availability of doctors.\n\nAll medical services are provided independently by the attending doctor. Doctors remain solely responsible for their professional judgment, patient care, compliance with applicable medical regulations, and any medical services provided during a shift.',
  },
  {
    heading: '4. Bookings',
    body: 'Requesters may create coverage requests through the platform. Doctors may choose to accept or decline available requests. A booking is considered confirmed only after a doctor successfully accepts the request. FlashLocum does not guarantee that every request will receive an accepted doctor.',
  },
  {
    heading: '5. Payments',
    body: 'Payments are processed through FlashLocum\'s approved payment partners. Payments are made only through the platform. Depending on platform configuration, payments may be automatically split between the doctor and FlashLocum, and platform service fees may apply. FlashLocum is not responsible for payments made outside the platform. Payment confirmation is determined solely by the official payment provider.',
  },
  {
    heading: '6. Ratings and Reliability',
    body: 'After completed shifts, users may provide ratings and feedback. FlashLocum also maintains reliability scores based on attendance and cancellation behaviour. These scores help improve trust, quality, and future matching across the platform. FlashLocum reserves the right to adjust scoring methods where necessary to prevent abuse, fraud, manipulation, or unfair outcomes.',
  },
  {
    heading: '7. Cancellations',
    body: 'Doctors and requesters may cancel bookings in accordance with platform rules. Repeated cancellations or failure to honour accepted bookings may result in: Reduced reliability scores · Temporary restrictions · Account suspension · Permanent removal from the platform.',
  },
  {
    heading: '8. Prohibited Activities',
    body: 'Users must not: Provide false information or fraudulent credentials · Misrepresent professional qualifications · Attempt payment fraud or financial abuse · Circumvent FlashLocum by arranging payments outside the platform · Interfere with platform security or operations · Use FlashLocum for unlawful purposes.',
  },
  {
    heading: '9. Intellectual Property',
    body: 'FlashLocum, including its software, branding, logos, designs, graphics, and platform content, is owned by FlashLocum Ltd and is protected by applicable intellectual property laws. Users may not copy, modify, distribute, or reproduce any part of the platform without prior written permission.',
  },
  {
    heading: '10. Limitation of Liability',
    body: 'To the maximum extent permitted by law, FlashLocum is not liable for: Medical outcomes or clinical decisions · The actions or omissions of doctors or requesters · Missed shifts or cancellations · Indirect, incidental, special, or consequential losses · Loss of revenue, business, or opportunities arising from use of the platform.',
  },
  {
    heading: '11. Account Suspension or Termination',
    body: 'We may suspend, restrict, or terminate accounts where users: Violate these Terms · Breach applicable laws or regulations · Engage in fraudulent or abusive behaviour · Pose a risk to other users or the integrity of the platform.',
  },
  {
    heading: '12. Changes to These Terms',
    body: 'We may update these Terms from time to time. Where changes are significant, we will notify users through the platform or other appropriate means. Continued use of FlashLocum after updated Terms become effective constitutes acceptance of those changes.',
  },
  {
    heading: '13. Governing Law',
    body: 'These Terms are governed by the laws of the Federal Republic of Nigeria.',
  },
  {
    heading: '14. Contact Us',
    body: 'If you have any questions regarding these Terms, please contact us:\nEmail: support@flashlocum.com',
  },
];

export default function TermsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const handleBack = () => {
    console.log('[Terms] Back button pressed');
    router.back();
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.headerBar}>
        <AnimatedPressable
          onPress={handleBack}
          scaleValue={0.9}
          style={styles.backButtonWrap}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <View style={styles.backCircle}>
            <Text style={styles.backChevron}>‹</Text>
          </View>
        </AnimatedPressable>
        <Text style={styles.headerLabel}>TERMS OF SERVICE</Text>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 60 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Title block */}
        <Text style={styles.docTitle}>FlashLocum Terms of Service</Text>
        <Text style={styles.effectiveDate}>Effective Date: 01 July 2026</Text>

        {SECTIONS.map((section, index) => {
          const key = String(index);
          return (
            <View key={key} style={styles.section}>
              {section.heading ? (
                <Text style={styles.sectionHeading}>{section.heading}</Text>
              ) : null}
              <Text style={styles.sectionBody}>{section.body}</Text>
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F7F7F5',
  },
  headerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingVertical: 16,
  },
  backButtonWrap: {
    position: 'absolute',
    left: 24,
  },
  backCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#EFEFEF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  backChevron: {
    fontSize: 24,
    color: '#0A0A0A',
    lineHeight: 28,
    marginTop: -2,
  },
  headerLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#8A8A8A',
    letterSpacing: 1.5,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 28,
  },
  docTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#0A0A0A',
    letterSpacing: -0.3,
    marginBottom: 4,
  },
  effectiveDate: {
    fontSize: 13,
    color: '#8A8A8A',
    marginBottom: 28,
  },
  section: {
    marginBottom: 20,
  },
  sectionHeading: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0A0A0A',
    marginBottom: 6,
  },
  sectionBody: {
    fontSize: 14,
    color: '#4A4A4A',
    lineHeight: 22,
  },
});
