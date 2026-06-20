import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { ADMIN_BACKEND_URL } from '../environment';
import { generateAndStoreKeypair, getStoredPublicKeyHexForRetry } from '../utils/keypair';

export default function ClaimCredentialScreen({ route, navigation }) {
  const { student } = route.params;

  // 'intro' | 'generating' | 'generated' | 'claiming' | 'error'
  const [status, setStatus] = useState('intro');
  const [errorMessage, setErrorMessage] = useState(null);
  const [hasGeneratedKey, setHasGeneratedKey] = useState(false);

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

  const attemptClaim = async () => {
    setStatus('claiming');
    try {
      const pubKeyHex = hasGeneratedKey
        ? await getStoredPublicKeyHexForRetry()
        : (await generateAndStoreKeypair()).pubKeyHex;
      setHasGeneratedKey(true);

      const response = await fetch(`${ADMIN_BACKEND_URL}/api/students/${student.id}/pubkey`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pubKeyHex }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Claim failed');
      }

      navigation.navigate('DashboardScreen', { student: data.student });
    } catch (error) {
      setErrorMessage(
        error.message ||
          'Something went wrong while securing your credential. Check your connection and try again.'
      );
      setStatus('error');
    }
  };

  if (status === 'error') {
    return (
      <View style={styles.container}>
        <View style={styles.card}>
          <Text style={styles.errorHeading}>Couldn't Complete Setup</Text>
          <Text style={styles.body}>{errorMessage}</Text>
          <TouchableOpacity
            style={styles.retryButton}
            onPress={hasGeneratedKey ? attemptClaim : generateKeys}
          >
            <Text style={styles.retryButtonText}>Try Again</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  if (status === 'generating' || status === 'claiming') {
    return (
      <View style={styles.container}>
        <View style={styles.card}>
          <ActivityIndicator color="#3b82f6" size="large" style={styles.spinner} />
          <Text style={styles.heading}>
            {status === 'generating' ? 'Generating your keys…' : 'Securing your credential…'}
          </Text>
          <Text style={styles.body}>
            {status === 'generating'
              ? 'Creating your public/private key pair on this device.'
              : 'Sending your public key and wrapping your credential to it.'}
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
          <Text style={styles.heading}>Keys Generated</Text>
          <Text style={styles.body}>
            Your public and private key pair has been created. Your private key is stored
            securely on this device only — it is never sent over the network, and is required to
            access your credential.
          </Text>
          <TouchableOpacity style={styles.retryButton} onPress={attemptClaim}>
            <Text style={styles.retryButtonText}>Continue</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // status === 'intro'
  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <Text style={styles.heading}>Claim Your Credential</Text>
        <Text style={styles.body}>
          Before you can access your digital ID, you need to claim your credential. This
          generates a private key on this device and uses it to securely unlock your encrypted
          credential — only this device will be able to decrypt it.
        </Text>
        <TouchableOpacity style={styles.retryButton} onPress={generateKeys}>
          <Text style={styles.retryButtonText}>Generate Keys</Text>
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
