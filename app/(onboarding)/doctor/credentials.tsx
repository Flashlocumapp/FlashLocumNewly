import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  ScrollView,
  ActivityIndicator,
  Image,
  StyleSheet,
  Platform,
  ImageSourcePropType,
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
const MDCN_HINT = 'Enter the correct format (e.g., MDCN/X/YYYYY)';

interface PickedFile {
  uri: string;
  name: string;
  mimeType?: string;
}

function resolveImageSource(source: string | number | ImageSourcePropType | undefined): ImageSourcePropType {
  if (!source) return { uri: '' };
  if (typeof source === 'string') return { uri: source };
  return source as ImageSourcePropType;
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
  const { user, profile } = useAuth();

  const [mdcnNumber, setMdcnNumber] = useState('');
  const [mdcnError, setMdcnError] = useState('');

  const [nyscFile, setNyscFile] = useState<PickedFile | null>(null);
  const [nyscError, setNyscError] = useState('');

  const [licenceFile, setLicenceFile] = useState<PickedFile | null>(null);
  const [licenceError, setLicenceError] = useState('');

  const [selfieUri, setSelfieUri] = useState<string | null>(null);
  const [selfieError, setSelfieError] = useState('');

  const [loading, setLoading] = useState(false);
  const [submitError, setSubmitError] = useState('');

  const handleBack = () => {
    console.log('[DoctorCredentials] Back button pressed, onboarding_complete:', profile?.onboarding_complete);
    if (profile?.onboarding_complete) {
      router.replace('/(app)/(home)');
    } else {
      router.replace('/(auth)/role-select');
    }
  };

  const handleMdcnChange = (text: string) => {
    const upper = text.toUpperCase();
    setMdcnNumber(upper);
    if (upper.length > 0 && !MDCN_REGEX.test(upper)) {
      setMdcnError(MDCN_HINT);
    } else {
      setMdcnError('');
    }
  };

  const handlePickNysc = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['application/pdf', 'image/*'],
        copyToCacheDirectory: true,
      });
      if (!result.canceled && result.assets && result.assets.length > 0) {
        const asset = result.assets[0];
        setNyscFile({ uri: asset.uri, name: asset.name, mimeType: asset.mimeType ?? undefined });
        setNyscError('');
      }
    } catch {
      // silently ignore picker cancellation
    }
  };

  const handlePickLicence = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['application/pdf', 'image/*'],
        copyToCacheDirectory: true,
      });
      if (!result.canceled && result.assets && result.assets.length > 0) {
        const asset = result.assets[0];
        setLicenceFile({ uri: asset.uri, name: asset.name, mimeType: asset.mimeType ?? undefined });
        setLicenceError('');
      }
    } catch {
      // silently ignore picker cancellation
    }
  };

  const handleTakeSelfie = async () => {
    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        setSelfieError('Camera permission is required to take a selfie.');
        return;
      }
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: 'images' as ImagePicker.MediaTypeOptions,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
        cameraType: ImagePicker.CameraType.front,
      });
      if (!result.canceled && result.assets && result.assets.length > 0) {
        setSelfieUri(result.assets[0].uri);
        setSelfieError('');
      }
    } catch {
      // silently ignore camera errors
    }
  };

  const getExtension = (filename: string): string => {
    const parts = filename.split('.');
    return parts.length > 1 ? parts[parts.length - 1].toLowerCase() : 'bin';
  };

  const uploadFile = async (uri: string, path: string, mimeType?: string): Promise<string> => {
    const base64 = await FileSystem.readAsStringAsync(uri, {
      encoding: FileSystem.EncodingType.Base64,
    });

    // Convert base64 to binary using a reliable method
    const binaryString = globalThis.atob ? globalThis.atob(base64) : Buffer.from(base64, 'base64').toString('binary');
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }

    const contentType = mimeType ?? 'application/octet-stream';

    const { error } = await supabase.storage
      .from('doctor-documents')
      .upload(path, bytes.buffer, {
        upsert: true,
        contentType,
      });

    if (error) throw error;
    return path;
  };

  const handleContinue = async () => {
    if (loading) return;

    let valid = true;
    setMdcnError('');
    setNyscError('');
    setLicenceError('');
    setSelfieError('');
    setSubmitError('');

    if (!MDCN_REGEX.test(mdcnNumber)) {
      setMdcnError(MDCN_HINT);
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
    if (!valid) return;

    setLoading(true);

    try {
      const userId = user!.id;

      const nyscExt = getExtension(nyscFile!.name);
      const nyscPath = await uploadFile(
        nyscFile!.uri,
        `${userId}/nysc-cert.${nyscExt}`,
        nyscFile!.mimeType,
      );

      const licenceExt = getExtension(licenceFile!.name);
      const licencePath = await uploadFile(
        licenceFile!.uri,
        `${userId}/medical-licence.${licenceExt}`,
        licenceFile!.mimeType,
      );

      const selfiePath = await uploadFile(selfieUri!, `${userId}/selfie.jpg`, 'image/jpeg');

      const { error: doctorProfileError } = await supabase
        .from('doctor_profiles')
        .upsert({
          id: userId,
          mdcn_number: mdcnNumber,
          nysc_cert_url: nyscPath,
          medical_licence_url: licencePath,
          selfie_url: selfiePath,
        });
      if (doctorProfileError) throw doctorProfileError;

      router.push('/(onboarding)/doctor/payout');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Upload failed. Please try again.';
      setSubmitError(message);
    } finally {
      setLoading(false);
    }
  };

  const selfieSource = resolveImageSource(selfieUri ?? undefined);

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
        <Text style={styles.headerLabel}>COVER & EARN · STEP 2 OF 3</Text>
      </View>

      <ScrollView
        style={styles.flex}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 40 }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.heading}>Medical credentials</Text>
        <Text style={styles.subtitle}>Submit these so we can verify your account.</Text>

        {/* Live Selfie */}
        <View style={styles.fieldGroup}>
          <Text style={styles.fieldLabel}>Selfie</Text>
          <View style={[styles.selfieTile, selfieError ? styles.tileError : null]}>
            {selfieUri ? (
              <Image source={selfieSource} style={styles.selfiePreview} />
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
              placeholder=""
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
            <Text style={styles.hintText}>{MDCN_HINT}</Text>
          )}
        </View>

        {/* Medical Licence */}
        <View style={styles.fieldGroup}>
          <Text style={styles.fieldLabel}>Medical licence / Receipt upload</Text>
          <AnimatedPressable
            onPress={handlePickLicence}
            scaleValue={0.98}
            style={[styles.uploadTile, licenceError ? styles.tileError : null]}
          >
            {licenceFile ? (
              <View style={styles.fileRow}>
                <Text style={styles.fileName} numberOfLines={1}>{licenceFile.name}</Text>
                <AnimatedPressable
                  onPress={() => setLicenceFile(null)}
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
                  onPress={() => setNyscFile(null)}
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

        {/* Submit error */}
        {submitError ? <Text style={styles.submitError}>{submitError}</Text> : null}

        {/* Continue button */}
        <AnimatedPressable
          onPress={handleContinue}
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
            <Text style={styles.submitLabel}>Continue</Text>
          )}
        </AnimatedPressable>
      </ScrollView>
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
  tileError: {
    borderWidth: 1,
    borderColor: '#EF4444',
  },
  uploadTile: {
    backgroundColor: '#EFEFEF',
    borderRadius: 28,
    paddingHorizontal: 18,
    paddingVertical: 18,
    minHeight: 58,
    justifyContent: 'center',
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
  submitError: {
    fontSize: 14,
    color: '#EF4444',
    textAlign: 'center',
    marginBottom: 12,
  },
  submitButton: {
    marginTop: 8,
    backgroundColor: '#0A0A0A',
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
});
