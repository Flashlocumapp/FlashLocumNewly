import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  ScrollView,
  ActivityIndicator,
  Image,
  StyleSheet,
  Platform,
  Modal,
  TouchableOpacity,
} from 'react-native';
import Svg, { Path, Circle } from 'react-native-svg';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { AnimatedPressable } from '@/components/AnimatedPressable';

const MDCN_REGEX = /^MDCN\/R\/\d{5,6}$/;

const NIGERIAN_BANKS = [
  { name: 'Access Bank', code: '044' },
  { name: 'Citibank Nigeria', code: '023' },
  { name: 'Ecobank Nigeria', code: '050' },
  { name: 'Fidelity Bank', code: '070' },
  { name: 'First Bank of Nigeria', code: '011' },
  { name: 'First City Monument Bank', code: '214' },
  { name: 'Globus Bank', code: '00103' },
  { name: 'Guaranty Trust Bank', code: '058' },
  { name: 'Heritage Bank', code: '030' },
  { name: 'Keystone Bank', code: '082' },
  { name: 'Parallex Bank', code: '526' },
  { name: 'Polaris Bank', code: '076' },
  { name: 'Providus Bank', code: '101' },
  { name: 'Stanbic IBTC Bank', code: '221' },
  { name: 'Standard Chartered Bank', code: '068' },
  { name: 'Sterling Bank', code: '232' },
  { name: 'SunTrust Bank', code: '100' },
  { name: 'Union Bank of Nigeria', code: '032' },
  { name: 'United Bank for Africa', code: '033' },
  { name: 'Unity Bank', code: '215' },
  { name: 'Wema Bank', code: '035' },
  { name: 'Zenith Bank', code: '057' },
];

interface PickedFile {
  uri: string;
  name: string;
  mimeType?: string;
}

function UploadIcon() {
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
      <Path
        d="M12 16V4M12 4L8 8M12 4L16 8"
        stroke="#8A8A8A"
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="M4 20h16"
        stroke="#8A8A8A"
        strokeWidth={1.8}
        strokeLinecap="round"
      />
    </Svg>
  );
}

function RemoveIcon() {
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
      <Path
        d="M18 6L6 18M6 6l12 12"
        stroke="#8A8A8A"
        strokeWidth={2}
        strokeLinecap="round"
      />
    </Svg>
  );
}

function AvatarPlaceholderIcon() {
  return (
    <Svg width={32} height={32} viewBox="0 0 24 24" fill="none">
      <Circle cx="12" cy="8" r="4" stroke="#ADADAD" strokeWidth={1.8} />
      <Path
        d="M4 20c0-4 3.582-7 8-7s8 3 8 7"
        stroke="#ADADAD"
        strokeWidth={1.8}
        strokeLinecap="round"
      />
    </Svg>
  );
}

export default function DoctorCredentials() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user, refreshProfile } = useAuth();

  const [mdcnNumber, setMdcnNumber] = useState('');
  const [mdcnError, setMdcnError] = useState('');

  const [nyscFile, setNyscFile] = useState<PickedFile | null>(null);
  const [nyscError, setNyscError] = useState('');

  const [licenceFile, setLicenceFile] = useState<PickedFile | null>(null);
  const [licenceError, setLicenceError] = useState('');

  const [selfieUri, setSelfieUri] = useState<string | null>(null);
  const [selfieError, setSelfieError] = useState('');

  // Bank state
  const [selectedBank, setSelectedBank] = useState<{ name: string; code: string } | null>(null);
  const [bankModalVisible, setBankModalVisible] = useState(false);
  const [accountNumber, setAccountNumber] = useState('');
  const [accountName, setAccountName] = useState('');
  const [accountNameLoading, setAccountNameLoading] = useState(false);
  const [accountNameError, setAccountNameError] = useState('');
  const [bankError, setBankError] = useState('');
  const [accountNumberError, setAccountNumberError] = useState('');

  const [loading, setLoading] = useState(false);
  const [submitError, setSubmitError] = useState('');

  const lookupAccountName = async (bank: { name: string; code: string }, accNum: string) => {
    console.log('[DoctorCredentials] Looking up account name for bank:', bank.name, 'account:', accNum);
    setAccountNameLoading(true);
    setAccountNameError('');
    setAccountName('');
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const response = await fetch(
        'https://juilousufwlsiqdcgllu.supabase.co/functions/v1/monnify-verify-account',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session?.access_token}`,
          },
          body: JSON.stringify({ accountNumber: accNum, bankCode: bank.code }),
        }
      );
      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || 'Verification failed');
      }
      const result = await response.json();
      if (result.error) throw new Error(result.error);

      const returnedName = (result.accountName || '').toLowerCase();
      const registrationName = (user?.user_metadata?.full_name || user?.email || '').toLowerCase();

      const stripped = (s: string) => s.replace(/\b(dr|mr|mrs|ms|prof|sir)\b\.?\s*/gi, '').trim();
      const cleanReturned = stripped(returnedName);
      const cleanRegistration = stripped(registrationName);

      const regTokens = cleanRegistration.split(/\s+/).filter((t: string) => t.length > 1);
      const matchCount = regTokens.filter((token: string) => cleanReturned.includes(token)).length;

      if (regTokens.length > 0 && matchCount === 0) {
        setAccountNameError('Account name mismatch. Please provide a bank account that matches your registration profile name.');
        setAccountName('');
      } else {
        console.log('[DoctorCredentials] Account name verified:', result.accountName);
        setAccountName(result.accountName);
      }
    } catch (err: any) {
      console.log('[DoctorCredentials] Account lookup error:', err?.message);
      setAccountNameError(err?.message || 'Could not verify account. Please try again.');
    } finally {
      setAccountNameLoading(false);
    }
  };

  useEffect(() => {
    if (selectedBank && accountNumber.length === 10) {
      lookupAccountName(selectedBank, accountNumber);
    } else {
      setAccountName('');
      setAccountNameError('');
    }
    // lookupAccountName is stable (defined outside effect, refs only state setters)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedBank, accountNumber]);

  const handleBack = () => {
    console.log('[DoctorCredentials] Back button pressed');
    router.back();
  };

  const handleMdcnChange = (text: string) => {
    const upper = text.toUpperCase();
    setMdcnNumber(upper);
    if (upper.length > 0 && !MDCN_REGEX.test(upper)) {
      setMdcnError('Invalid format. Use MDCN/R/YYYYYY (5–6 digits)');
    } else {
      setMdcnError('');
    }
  };

  const handlePickNysc = async () => {
    console.log('[DoctorCredentials] NYSC certificate upload tapped');
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['application/pdf', 'image/*'],
        copyToCacheDirectory: true,
      });
      if (!result.canceled && result.assets && result.assets.length > 0) {
        const asset = result.assets[0];
        console.log('[DoctorCredentials] NYSC file selected:', asset.name);
        setNyscFile({ uri: asset.uri, name: asset.name, mimeType: asset.mimeType ?? undefined });
        setNyscError('');
      }
    } catch (err) {
      console.log('[DoctorCredentials] NYSC pick error:', err);
    }
  };

  const handlePickLicence = async () => {
    console.log('[DoctorCredentials] Medical licence upload tapped');
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['application/pdf', 'image/*'],
        copyToCacheDirectory: true,
      });
      if (!result.canceled && result.assets && result.assets.length > 0) {
        const asset = result.assets[0];
        console.log('[DoctorCredentials] Licence file selected:', asset.name);
        setLicenceFile({ uri: asset.uri, name: asset.name, mimeType: asset.mimeType ?? undefined });
        setLicenceError('');
      }
    } catch (err) {
      console.log('[DoctorCredentials] Licence pick error:', err);
    }
  };

  const handleTakeSelfie = async () => {
    console.log('[DoctorCredentials] Take selfie tapped');
    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        setSelfieError('Camera permission is required to take a selfie.');
        return;
      }
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: 'images',
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
        cameraType: ImagePicker.CameraType.front,
      });
      if (!result.canceled && result.assets && result.assets.length > 0) {
        console.log('[DoctorCredentials] Selfie taken');
        setSelfieUri(result.assets[0].uri);
        setSelfieError('');
      }
    } catch (err) {
      console.log('[DoctorCredentials] Selfie error:', err);
    }
  };

  const getExtension = (filename: string): string => {
    const parts = filename.split('.');
    return parts.length > 1 ? parts[parts.length - 1].toLowerCase() : 'bin';
  };

  const uploadFile = async (uri: string, path: string, mimeType?: string): Promise<string> => {
    console.log('[DoctorCredentials] Reading file as base64:', path);
    const base64 = await FileSystem.readAsStringAsync(uri, {
      encoding: FileSystem.EncodingType.Base64,
    });
    const binaryString = atob(base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    console.log('[DoctorCredentials] Uploading to storage:', path, 'size:', bytes.length);
    const { error } = await supabase.storage
      .from('doctor-documents')
      .upload(path, bytes, { upsert: true, contentType: mimeType ?? 'application/octet-stream' });
    if (error) throw error;
    return path;
  };

  const handleSubmit = async () => {
    if (loading) return;

    console.log('[DoctorCredentials] Submit & verify pressed');

    let valid = true;
    setMdcnError('');
    setNyscError('');
    setLicenceError('');
    setSelfieError('');
    setBankError('');
    setAccountNumberError('');
    setAccountNameError('');
    setSubmitError('');

    if (!MDCN_REGEX.test(mdcnNumber)) {
      setMdcnError('Invalid format. Use MDCN/R/YYYYYY (5–6 digits)');
      valid = false;
    }
    if (!nyscFile) {
      setNyscError('Please upload your NYSC certificate');
      valid = false;
    }
    if (!licenceFile) {
      setLicenceError('Please upload your medical licence');
      valid = false;
    }
    if (!selfieUri) {
      setSelfieError('Please take a selfie');
      valid = false;
    }
    if (!selectedBank) {
      setBankError('Please select a bank');
      valid = false;
    }
    if (accountNumber.length !== 10) {
      setAccountNumberError('Account number must be exactly 10 digits');
      valid = false;
    }
    if (!accountName) {
      setAccountNameError('Please verify your account name before submitting');
      valid = false;
    }
    if (!valid) return;

    setLoading(true);

    try {
      const userId = user!.id;

      console.log('[DoctorCredentials] Uploading NYSC certificate...');
      const nyscExt = getExtension(nyscFile!.name);
      const nyscPath = await uploadFile(
        nyscFile!.uri,
        `${userId}/nysc-cert.${nyscExt}`,
        nyscFile!.mimeType,
      );

      console.log('[DoctorCredentials] Uploading medical licence...');
      const licenceExt = getExtension(licenceFile!.name);
      const licencePath = await uploadFile(
        licenceFile!.uri,
        `${userId}/medical-licence.${licenceExt}`,
        licenceFile!.mimeType,
      );

      console.log('[DoctorCredentials] Uploading selfie...');
      const selfiePath = await uploadFile(selfieUri!, `${userId}/selfie.jpg`, 'image/jpeg');

      console.log('[DoctorCredentials] Saving doctor_profiles record...');
      const { error: doctorProfileError } = await supabase
        .from('doctor_profiles')
        .upsert({
          id: userId,
          mdcn_number: mdcnNumber,
          nysc_cert_url: nyscPath,
          medical_licence_url: licencePath,
          selfie_url: selfiePath,
          bank_name: selectedBank?.name,
          bank_code: selectedBank?.code,
          account_number: accountNumber,
          account_name: accountName,
        });
      if (doctorProfileError) throw doctorProfileError;

      console.log('[DoctorCredentials] Marking onboarding complete...');
      const { error: profileError } = await supabase
        .from('profiles')
        .upsert({ id: userId, onboarding_complete: true });
      if (profileError) throw profileError;

      console.log('[DoctorCredentials] All done, refreshing profile and navigating to home');
      await refreshProfile();
      router.replace('/(app)/(home)');
    } catch (err: any) {
      console.log('[DoctorCredentials] Submit error:', err?.message);
      setSubmitError(err?.message || 'Upload failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const bankDisplayValue = selectedBank ? selectedBank.name : 'Select bank...';
  const accountNamePlaceholder = 'Pick a bank and enter your 10-digit account';

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
        <Text style={styles.headerLabel}>COVER & EARN · STEP 2 OF 2</Text>
      </View>

      <ScrollView
        style={styles.flex}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 40 }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.heading}>Verification requirements</Text>
        <Text style={styles.subtitle}>
          Submit these so we can verify your account. Usually reviewed within an hour.
        </Text>

        {/* Live Selfie */}
        <View style={styles.fieldGroup}>
          <Text style={styles.fieldLabel}>Selfie</Text>
          <View style={[styles.selfieTile, selfieError ? styles.tileError : null]}>
            {selfieUri ? (
              <Image source={{ uri: selfieUri }} style={styles.selfiePreview} />
            ) : (
              <View style={styles.selfieAvatarCircle}>
                <AvatarPlaceholderIcon />
              </View>
            )}
            <View style={styles.selfieTextBlock}>
              <Text style={styles.selfieTitle}>Live selfie required</Text>
              <Text style={styles.selfieSubtitle}>Front camera only</Text>
            </View>
            <AnimatedPressable
              onPress={handleTakeSelfie}
              scaleValue={0.95}
              style={styles.captureButton}
            >
              <Text style={styles.captureButtonText}>{selfieUri ? 'Retake' : 'Capture'}</Text>
            </AnimatedPressable>
          </View>
          {selfieError ? <Text style={styles.inlineError}>{selfieError}</Text> : null}
        </View>

        {/* MDCN Number */}
        <View style={styles.fieldGroup}>
          <Text style={styles.fieldLabel}>MDCN number</Text>
          <View style={[styles.inputContainer, mdcnError ? styles.inputError : null]}>
            <TextInput
              style={styles.input}
              placeholder="MDCN/R/123456"
              placeholderTextColor="#ADADAD"
              value={mdcnNumber}
              onChangeText={handleMdcnChange}
              autoCapitalize="characters"
              autoCorrect={false}
            />
          </View>
          {mdcnError ? (
            <Text style={styles.inlineError}>{mdcnError}</Text>
          ) : (
            <Text style={styles.hintText}>Format: MDCN/R/YYYYYY</Text>
          )}
        </View>

        {/* Medical Licence */}
        <View style={styles.fieldGroup}>
          <Text style={styles.fieldLabel}>License / Payment receipt upload</Text>
          <AnimatedPressable
            onPress={handlePickLicence}
            scaleValue={0.98}
            style={[styles.uploadTile, licenceError ? styles.tileError : null]}
          >
            {licenceFile ? (
              <View style={styles.fileRow}>
                <Text style={styles.fileName} numberOfLines={1}>{licenceFile.name}</Text>
                <AnimatedPressable
                  onPress={() => {
                    console.log('[DoctorCredentials] Licence file removed');
                    setLicenceFile(null);
                  }}
                  scaleValue={0.9}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <RemoveIcon />
                </AnimatedPressable>
              </View>
            ) : (
              <View style={styles.uploadRow}>
                <Text style={styles.uploadText}>Tap to upload PDF or image</Text>
                <UploadIcon />
              </View>
            )}
          </AnimatedPressable>
          {licenceError ? <Text style={styles.inlineError}>{licenceError}</Text> : null}
        </View>

        {/* NYSC Certificate */}
        <View style={styles.fieldGroup}>
          <Text style={styles.fieldLabel}>NYSC certificate upload</Text>
          <AnimatedPressable
            onPress={handlePickNysc}
            scaleValue={0.98}
            style={[styles.uploadTile, nyscError ? styles.tileError : null]}
          >
            {nyscFile ? (
              <View style={styles.fileRow}>
                <Text style={styles.fileName} numberOfLines={1}>{nyscFile.name}</Text>
                <AnimatedPressable
                  onPress={() => {
                    console.log('[DoctorCredentials] NYSC file removed');
                    setNyscFile(null);
                  }}
                  scaleValue={0.9}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <RemoveIcon />
                </AnimatedPressable>
              </View>
            ) : (
              <View style={styles.uploadRow}>
                <Text style={styles.uploadText}>Tap to upload PDF or image</Text>
                <UploadIcon />
              </View>
            )}
          </AnimatedPressable>
          {nyscError ? <Text style={styles.inlineError}>{nyscError}</Text> : null}
        </View>

        {/* Bank name */}
        <View style={styles.fieldGroup}>
          <Text style={styles.fieldLabel}>Bank name</Text>
          <AnimatedPressable
            onPress={() => {
              console.log('[DoctorCredentials] Bank dropdown tapped');
              setBankModalVisible(true);
              setBankError('');
            }}
            scaleValue={0.98}
            style={[styles.dropdownContainer, bankError ? styles.inputError : null]}
          >
            <Text style={[styles.dropdownText, !selectedBank && styles.dropdownPlaceholder]}>
              {bankDisplayValue}
            </Text>
          </AnimatedPressable>
          {bankError ? <Text style={styles.inlineError}>{bankError}</Text> : null}
        </View>

        {/* Account number */}
        <View style={styles.fieldGroup}>
          <Text style={styles.fieldLabel}>Account number</Text>
          <View style={[styles.inputContainer, accountNumberError ? styles.inputError : null]}>
            <TextInput
              style={styles.input}
              placeholder="0123456789"
              placeholderTextColor="#ADADAD"
              value={accountNumber}
              onChangeText={text => {
                const digits = text.replace(/\D/g, '').slice(0, 10);
                setAccountNumber(digits);
                setAccountNumberError('');
              }}
              keyboardType="number-pad"
              maxLength={10}
            />
          </View>
          {accountNumberError ? <Text style={styles.inlineError}>{accountNumberError}</Text> : null}
        </View>

        {/* Account name */}
        <View style={styles.fieldGroup}>
          <Text style={styles.fieldLabel}>Account name</Text>
          <View style={[styles.inputContainer, accountNameError ? styles.inputError : null]}>
            {accountNameLoading ? (
              <View style={styles.accountNameLoadingRow}>
                <ActivityIndicator size="small" color="#8A8A8A" />
                <Text style={styles.accountNameLoadingText}>Verifying...</Text>
              </View>
            ) : (
              <Text style={[styles.input, !accountName && styles.accountNamePlaceholder]}>
                {accountName || accountNamePlaceholder}
              </Text>
            )}
          </View>
          {accountNameError ? <Text style={styles.inlineError}>{accountNameError}</Text> : null}
        </View>

        {/* Submit error */}
        {submitError ? <Text style={styles.submitError}>{submitError}</Text> : null}

        {/* Submit button */}
        <AnimatedPressable
          onPress={handleSubmit}
          disabled={loading}
          scaleValue={0.97}
          style={[styles.submitButton, loading && styles.submitButtonDisabled]}
        >
          {loading ? (
            <View style={styles.loadingRow}>
              <ActivityIndicator color="#FFFFFF" />
              <Text style={styles.loadingLabel}>Uploading...</Text>
            </View>
          ) : (
            <Text style={styles.submitLabel}>Submit</Text>
          )}
        </AnimatedPressable>
      </ScrollView>

      {/* Bank selection modal */}
      <Modal
        visible={bankModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setBankModalVisible(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setBankModalVisible(false)}
        >
          <View style={styles.modalSheet}>
            <Text style={styles.modalTitle}>Select bank</Text>
            <ScrollView showsVerticalScrollIndicator={false} bounces={false}>
              {NIGERIAN_BANKS.map((bank, index) => (
                <View key={bank.code}>
                  <TouchableOpacity
                    style={styles.modalOption}
                    onPress={() => {
                      console.log('[DoctorCredentials] Bank selected:', bank.name);
                      setSelectedBank(bank);
                      setBankModalVisible(false);
                      setBankError('');
                    }}
                  >
                    <Text style={[
                      styles.modalOptionText,
                      selectedBank?.code === bank.code && styles.modalOptionSelected,
                    ]}>
                      {bank.name}
                    </Text>
                    {selectedBank?.code === bank.code && (
                      <Text style={styles.checkmark}>✓</Text>
                    )}
                  </TouchableOpacity>
                  {index < NIGERIAN_BANKS.length - 1 && <View style={styles.modalDivider} />}
                </View>
              ))}
            </ScrollView>
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F7F7F5',
  },
  flex: {
    flex: 1,
  },
  headerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingVertical: 16,
    backgroundColor: '#F7F7F5',
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
  scrollContent: {
    paddingHorizontal: 28,
    paddingTop: 8,
  },
  heading: {
    fontSize: 30,
    fontWeight: '800',
    color: '#0A0A0A',
    letterSpacing: -0.5,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 15,
    color: '#8A8A8A',
    marginBottom: 32,
    lineHeight: 22,
  },
  fieldGroup: {
    marginBottom: 24,
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: '500',
    color: '#6A6A6A',
    marginBottom: 8,
  },
  inputContainer: {
    backgroundColor: '#EFEFEF',
    borderRadius: 28,
    paddingHorizontal: 18,
    paddingVertical: 16,
  },
  inputError: {
    borderWidth: 1,
    borderColor: '#EF4444',
  },
  input: {
    fontSize: 16,
    color: '#0A0A0A',
    padding: 0,
    margin: 0,
  },
  hintText: {
    fontSize: 12,
    color: '#ADADAD',
    marginTop: 6,
  },
  inlineError: {
    fontSize: 12,
    color: '#EF4444',
    marginTop: 6,
  },
  // Selfie tile — horizontal row layout
  selfieTile: {
    backgroundColor: '#EFEFEF',
    borderRadius: 28,
    paddingHorizontal: 16,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
  },
  selfieAvatarCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#E0E0E0',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  selfiePreview: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#DDDDDD',
    marginRight: 14,
  },
  selfieTextBlock: {
    flex: 1,
  },
  selfieTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0A0A0A',
    marginBottom: 2,
  },
  selfieSubtitle: {
    fontSize: 12,
    color: '#ADADAD',
  },
  captureButton: {
    backgroundColor: '#0A0A0A',
    borderRadius: 50,
    paddingHorizontal: 18,
    paddingVertical: 10,
  },
  captureButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  // Upload tiles
  uploadTile: {
    backgroundColor: '#EFEFEF',
    borderRadius: 28,
    paddingHorizontal: 18,
    paddingVertical: 18,
    minHeight: 58,
    justifyContent: 'center',
  },
  tileError: {
    borderWidth: 1,
    borderColor: '#EF4444',
  },
  uploadRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  uploadText: {
    fontSize: 15,
    color: '#ADADAD',
  },
  fileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  fileName: {
    fontSize: 14,
    color: '#0A0A0A',
    fontWeight: '500',
    flex: 1,
    marginRight: 12,
  },
  // Dropdown
  dropdownContainer: {
    backgroundColor: '#EFEFEF',
    borderRadius: 28,
    paddingHorizontal: 18,
    paddingVertical: 16,
  },
  dropdownText: {
    fontSize: 16,
    color: '#0A0A0A',
  },
  dropdownPlaceholder: {
    color: '#ADADAD',
  },
  // Account name field
  accountNamePlaceholder: {
    color: '#ADADAD',
  },
  accountNameLoadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  accountNameLoadingText: {
    fontSize: 14,
    color: '#8A8A8A',
  },
  // Submit
  submitError: {
    fontSize: 14,
    color: '#EF4444',
    textAlign: 'center',
    marginBottom: 12,
  },
  submitButton: {
    marginTop: 8,
    backgroundColor: '#6B7280',
    borderRadius: 50,
    paddingVertical: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitButtonDisabled: {
    opacity: 0.55,
  },
  submitLabel: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  loadingLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  // Bank modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 24,
    paddingTop: 20,
    paddingBottom: 40,
    maxHeight: '70%',
  },
  modalTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#8A8A8A',
    textAlign: 'center',
    marginBottom: 16,
    letterSpacing: 0.5,
  },
  modalOption: {
    paddingVertical: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  modalOptionText: {
    fontSize: 16,
    color: '#0A0A0A',
    fontWeight: '400',
  },
  modalOptionSelected: {
    fontWeight: '700',
    color: '#0A0A0A',
  },
  checkmark: {
    fontSize: 16,
    color: '#0A0A0A',
    fontWeight: '700',
  },
  modalDivider: {
    height: 1,
    backgroundColor: '#F0F0F0',
  },
});
