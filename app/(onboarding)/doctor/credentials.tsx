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
} from 'react-native';
import Svg, { Path, Rect } from 'react-native-svg';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { AnimatedPressable } from '@/components/AnimatedPressable';

const MDCN_REGEX = /^MDCN\/R\/\d{5,6}$/;

interface PickedFile {
  uri: string;
  name: string;
  mimeType?: string;
}

function UploadIcon() {
  return (
    <Svg width={28} height={28} viewBox="0 0 24 24" fill="none">
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

function CameraIcon() {
  return (
    <Svg width={28} height={28} viewBox="0 0 24 24" fill="none">
      <Path
        d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"
        stroke="#8A8A8A"
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="M12 17a4 4 0 100-8 4 4 0 000 8z"
        stroke="#8A8A8A"
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
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

  const [loading, setLoading] = useState(false);
  const [submitError, setSubmitError] = useState('');

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
    const response = await fetch(uri);
    const blob = await response.blob();
    const { error } = await supabase.storage
      .from('doctor-documents')
      .upload(path, blob, { upsert: true, contentType: mimeType });
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

  const mdcnIsValid = MDCN_REGEX.test(mdcnNumber);

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
        <Text style={styles.headerLabel}>COVER & EARN</Text>
      </View>

      <ScrollView
        style={styles.flex}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 40 }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.heading}>Medical credentials</Text>
        <Text style={styles.subtitle}>
          Your details are reviewed by our team before activation.
        </Text>

        {/* MDCN Number */}
        <View style={styles.fieldGroup}>
          <Text style={styles.fieldLabel}>MDCN Number</Text>
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

        {/* NYSC Certificate */}
        <View style={styles.fieldGroup}>
          <Text style={styles.fieldLabel}>NYSC Certificate</Text>
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
              <View style={styles.uploadPlaceholder}>
                <UploadIcon />
                <Text style={styles.uploadText}>Upload PDF or image</Text>
              </View>
            )}
          </AnimatedPressable>
          {nyscError ? <Text style={styles.inlineError}>{nyscError}</Text> : null}
        </View>

        {/* Medical Licence */}
        <View style={styles.fieldGroup}>
          <Text style={styles.fieldLabel}>Medical Licence / Receipt</Text>
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
              <View style={styles.uploadPlaceholder}>
                <UploadIcon />
                <Text style={styles.uploadText}>Upload PDF or image</Text>
              </View>
            )}
          </AnimatedPressable>
          {licenceError ? <Text style={styles.inlineError}>{licenceError}</Text> : null}
        </View>

        {/* Live Selfie */}
        <View style={styles.fieldGroup}>
          <Text style={styles.fieldLabel}>Live Selfie</Text>
          <AnimatedPressable
            onPress={handleTakeSelfie}
            scaleValue={0.98}
            style={[styles.uploadTile, selfieError ? styles.tileError : null]}
          >
            {selfieUri ? (
              <View style={styles.selfieRow}>
                <Image source={{ uri: selfieUri }} style={styles.selfiePreview} />
                <Text style={styles.retakeText}>Retake</Text>
              </View>
            ) : (
              <View style={styles.uploadPlaceholder}>
                <CameraIcon />
                <Text style={styles.uploadText}>Take a selfie</Text>
              </View>
            )}
          </AnimatedPressable>
          {selfieError ? <Text style={styles.inlineError}>{selfieError}</Text> : null}
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
            <Text style={styles.submitLabel}>Submit & verify</Text>
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
    borderRadius: 14,
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
  uploadTile: {
    backgroundColor: '#EFEFEF',
    borderRadius: 14,
    padding: 20,
    minHeight: 80,
    justifyContent: 'center',
  },
  tileError: {
    borderWidth: 1,
    borderColor: '#EF4444',
  },
  uploadPlaceholder: {
    alignItems: 'center',
    gap: 8,
  },
  uploadText: {
    fontSize: 14,
    color: '#8A8A8A',
    fontWeight: '500',
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
  selfieRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  selfiePreview: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#DDDDDD',
  },
  retakeText: {
    fontSize: 14,
    color: '#0A0A0A',
    fontWeight: '500',
    textDecorationLine: 'underline',
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
