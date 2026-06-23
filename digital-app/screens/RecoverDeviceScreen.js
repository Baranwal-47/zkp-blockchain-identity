import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { ADMIN_BACKEND_URL } from '../environment';
import { generateAndStoreKeypair, getStoredPublicKeyHexForRetry } from '../utils/keypair';

// 11-02 (Phase 11 device-loss redesign): student-driven half of the recovery
// flow. The admin no longer types the student's new pubkey — the student
// generates a fresh on-device keypair here (reusing the SAME
// generateAndStoreKeypair()/getStoredPublicKeyHexForRetry() pair the original
// ClaimCredentialScreen uses) and posts ONLY the public key into their open
// recovery session via POST /api/recovery/:sessionId/student-pubkey. The
// custodian shares and this pubkey can land in either order — the backend
// completes the operation whichever arrives last.
export default function RecoverDeviceScreen({ route, navigation }) {
  const { sessionId, student } = route.params;

  // 'intro' | 'generating' | 'generated' | 'submitting' | 'submitted' | 'error'
  const [status, setStatus] = useState('intro');
  const [errorMessage, setErrorMessage] = useState(null);
  const [hasGeneratedKey, setHasGeneratedKey] = useState(false);
  const [pendingResult, setPendingResult] = useState(null); // { status: 'pending'|'complete', waitingOnPubKey }

  const generateKeys = async () => {
    setStatus('generating');
    try {
      await generateAndStoreKeypair();
      setHasGeneratedKey(true);
      setStatus('generated');
    } catch (error) {
      setErrorMessage(
        error.message || 'Something went wrong while generating your keys. Try again.'
      );
      setStatus('error');
    }
  };

  const submitNewPubKey = async () => {
    setStatus('submitting');
    try {
      const pubKeyHex = hasGeneratedKey
        ? await getStoredPublicKeyHexForRetry()
        : (await generateAndStoreKeypair()).pubKeyHex;
      setHasGeneratedKey(true);

      const response = await fetch(
        `${ADMIN_BACKEND_URL}/api/recovery/${sessionId}/student-pubkey`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ pubKeyHex }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Submitting your new device key failed');
      }

      setPendingResult(data);
      setStatus('submitted');
    } catch (error) {
      setErrorMessage(
        error.message ||
          'Something went wrong while securing your new device key. Check your connection and try again.'
      );
      setStatus('error');
    }
  };

  if (status === 'error') {
    return (
      <View style={styles.container}>
        <View style={styles.card}>
          <Text style={styles.errorHeading}>Couldn't Complete Recovery</Text>
          <Text style={styles.body}>{errorMessage}</Text>
          <TouchableOpacity
            style={styles.retryButton}
            onPress={hasGeneratedKey ? submitNewPubKey : generateKeys}
          >
            <Text style={styles.retryButtonText}>Try Again</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  if (status === 'generating' || status === 'submitting') {
    return (
      <View style={styles.container}>
        <View style={styles.card}>
          <ActivityIndicator color="#3b82f6" size="large" style={styles.spinner} />
          <Text style={styles.heading}>
            {status === 'generating' ? 'Generating your new keys…' : 'Submitting your new device key…'}
          </Text>
          <Text style={styles.body}>
            {status === 'generating'
              ? 'Creating a fresh public/private key pair on this device.'
              : 'Sending your new public key to the recovery session.'}
          </Text>
        </View>
      </View>
    );
  }

  if (status === 'generated') {
    return (
      <View style={styles.container}>
        <View style={styles.card}>
          <Text style={styles.checkmark}>✅</Text>
          <Text style={styles.heading}>New Keys Generated</Text>
          <Text style={styles.body}>
            A new public/private key pair has been created on this device. Your private key is
            stored securely here only — it is never sent over the network.
          </Text>
          <TouchableOpacity style={styles.retryButton} onPress={submitNewPubKey}>
            <Text style={styles.retryButtonText}>Continue</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  if (status === 'submitted') {
    const complete = pendingResult?.status === 'complete';
    return (
      <View style={styles.container}>
        <View style={styles.card}>
          <Text style={styles.checkmark}>{complete ? '✅' : '⏳'}</Text>
          <Text style={styles.heading}>{complete ? 'Recovery Complete' : 'New Key Submitted'}</Text>
          <Text style={styles.body}>
            {complete
              ? 'Your new device key is now live. You can sign in and use your credential on this device.'
              : 'Your new device key was recorded. Recovery will complete once a custodian (Registrar or Dean) submits their share — you do not need to do anything else.'}
          </Text>
          <TouchableOpacity
            style={styles.retryButton}
            onPress={() => navigation.navigate('LoginScreen')}
          >
            <Text style={styles.retryButtonText}>Back to Login</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // status === 'intro'
  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <Text style={styles.heading}>Recover Your Device Access</Text>
        <Text style={styles.body}>
          A recovery session has been opened for {student?.name || 'your account'} after a device
          loss. To restore access, generate a fresh key pair on this device — only this device
          will hold the private key.
        </Text>
        <TouchableOpacity style={styles.retryButton} onPress={generateKeys}>
          <Text style={styles.retryButtonText}>Generate New Keys</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  card: {
    width: '100%',
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07,
    shadowRadius: 8,
    elevation: 3,
  },
  spinner: {
    marginBottom: 16,
  },
  checkmark: {
    fontSize: 40,
    marginBottom: 8,
  },
  heading: {
    fontSize: 22,
    fontWeight: '700',
    color: '#1e293b',
    marginBottom: 8,
    textAlign: 'center',
  },
  errorHeading: {
    fontSize: 22,
    fontWeight: '700',
    color: '#ef4444',
    marginBottom: 8,
    textAlign: 'center',
  },
  body: {
    fontSize: 15,
    color: '#64748b',
    textAlign: 'center',
    lineHeight: 22,
  },
  retryButton: {
    backgroundColor: '#3b82f6',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 24,
    width: '100%',
    shadowColor: '#3b82f6',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  retryButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
  },
});
