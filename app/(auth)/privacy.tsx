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
    body: 'FlashLocum ("FlashLocum", "we", "us", or "our") respects your privacy and is committed to protecting your personal information.\n\nThis Privacy Policy explains what information we collect, how we use it, how we protect it, and your rights when you use the FlashLocum platform.\n\nBy creating an account or using FlashLocum, you agree to the practices described in this Privacy Policy.',
  },
  {
    heading: '1. Information We Collect',
    body: 'Depending on your role and how you use FlashLocum, we may collect the following information.',
  },
  {
    heading: 'Personal Information',
    body: '· Full Name\n· Phone Number\n· Gender\n· Email Address (if provided)\n· Profile Photograph',
  },
  {
    heading: 'Professional Verification Information (Doctors)',
    body: 'To verify medical practitioners, we may collect:\n\n· MDCN Registration Number\n· NYSC Certificate\n· Medical Licence\n· Annual Licence Renewal Certificate or Proof of Renewal\n· Other verification documents where required\n\nThese documents are collected solely for identity verification, professional verification, fraud prevention, regulatory compliance, and platform safety.',
  },
  {
    heading: 'Banking Information',
    body: 'To facilitate payments, we may collect:\n\n· Bank Name\n· Account Number\n· Account Name\n\nWe may use approved payment providers to validate your account information and process payments.\n\nFlashLocum does not collect or store payment card numbers, CVV codes, ATM PINs, internet banking passwords, or other payment credentials.',
  },
  {
    heading: 'Shift and Platform Activity',
    body: 'We collect information relating to your use of FlashLocum, including:\n\n· Coverage requests\n· Accepted shifts\n· Completed shifts\n· Shift history\n· Ratings\n· Reliability scores\n· Payment records\n· Communications relating to shifts',
  },
  {
    heading: 'Device Information',
    body: 'We may automatically collect:\n\n· Device type\n· Operating system\n· App version\n· Device identifiers\n· Crash reports\n· Diagnostic information',
  },
  {
    heading: 'Location Information',
    body: 'When you choose to go online or use location-enabled features, FlashLocum may collect your approximate or precise location to:\n\n· Display nearby available doctors\n· Match doctors with requesters\n· Coordinate shift requests\n· Improve platform functionality\n\nLocation information is collected only where necessary to provide FlashLocum services.',
  },
  {
    heading: '2. How We Use Your Information',
    body: 'We use your information to:\n\n· Create and manage your account\n· Verify professional qualifications\n· Match doctors with requesters\n· Coordinate shift activities\n· Process payments\n· Prevent fraud, abuse, and unauthorised access\n· Improve platform security\n· Calculate ratings and reliability scores\n· Provide customer support\n· Improve our services\n· Comply with applicable legal and regulatory obligations',
  },
  {
    heading: '3. Sharing Your Information',
    body: 'We do not sell your personal information.\n\nWe may share information only where necessary with:\n\n· Approved payment service providers\n· Identity or professional verification providers\n· Cloud infrastructure providers\n· Government or regulatory authorities where required by law\n· Law enforcement agencies where legally required\n\nDoctors and requesters may also see limited information about one another where reasonably necessary to coordinate confirmed shifts.\n\nWhere we share personal information with trusted third-party service providers, we require them to protect your information appropriately and use it only for the services they provide to FlashLocum.',
  },
  {
    heading: '4. Data Security',
    body: 'We implement reasonable technical, administrative, and organisational safeguards to protect your information against:\n\n· Unauthorised access\n· Loss\n· Misuse\n· Alteration\n· Disclosure\n\nVerification documents are stored securely and are accessible only to authorised personnel who require access for legitimate business purposes.\n\nWhile we take reasonable steps to protect your information, no electronic system or method of transmission over the internet can guarantee absolute security.',
  },
  {
    heading: '5. Data Retention',
    body: 'We retain your information only for as long as necessary to:\n\n· Provide FlashLocum services\n· Meet legal and regulatory obligations\n· Resolve disputes\n· Prevent fraud\n· Enforce our agreements\n\nCertain records may be retained after account closure where required by applicable law.',
  },
  {
    heading: '6. Your Rights',
    body: 'Subject to applicable law, you may request to:\n\n· Access your personal information\n· Correct inaccurate information\n· Update your account details\n· Delete information that is no longer required\n· Close your FlashLocum account\n\nCertain information may need to be retained where required by law or for regulatory, fraud prevention, security, or dispute resolution purposes.',
  },
  {
    heading: '7. Third-Party Services',
    body: 'FlashLocum integrates with trusted third-party service providers that support platform operations, including payment processing, cloud infrastructure, communications, analytics, and identity verification where applicable.\n\nThese providers process information in accordance with their own privacy policies and applicable laws.',
  },
  {
    heading: "8. Children's Privacy",
    body: 'FlashLocum is intended only for adults aged 18 years and above.\n\nWe do not knowingly collect personal information from anyone under the age of 18.\n\nIf we become aware that information has been collected from a child, we will take appropriate steps to remove it.',
  },
  {
    heading: '9. Changes to This Privacy Policy',
    body: 'We may update this Privacy Policy from time to time.\n\nWhere significant changes are made, we will notify users through the platform or by other appropriate means.\n\nContinued use of FlashLocum after the updated Privacy Policy becomes effective constitutes acceptance of those changes.',
  },
  {
    heading: '10. Contact Us',
    body: 'If you have any questions about this Privacy Policy or our data practices, please contact us:\n\nFlashLocum Ltd\n44B, Abeokuta Street, Off Anifowoshe, Ikeja, Lagos, Nigeria\n\nEmail: support@flashlocum.com',
  },
];

export default function PrivacyScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const handleBack = () => {
    console.log('[Privacy] Back button pressed');
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
        <Text style={styles.headerLabel}>PRIVACY POLICY</Text>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 60 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Title block */}
        <Text style={styles.docTitle}>FlashLocum Privacy Policy</Text>
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
