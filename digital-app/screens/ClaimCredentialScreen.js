import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { ADMIN_BACKEND_URL } from '../environment';
import { generateAndStoreKeypair, getStoredPublicKeyHexForRetry } from '../utils/keypair';

export default function ClaimCredentialScreen({ route, navigation }) {
  const { student } = route.params;

  const [status, setStatus] = useState('loading'); // 'loading' | 'error'
  const [errorMessage, setErrorMessage] = useState(null);
  const [hasGeneratedKey, setHasGeneratedKey] = useState(false);

  const attemptClaim = async () => {
    setStatus('loading');
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

      navigation.navigate('StudentProfile', { student: data.student });
    } catch (error) {
      setErrorMessage(
        error.message ||
          'Something went wrong while securing your credential. Check your connection and try again.'
      );
      setStatus('error');
    }
  };

  useEffect(() => {
    attemptClaim();
  }, []); // D-01: fire on mount, no confirmation tap

  if (status === 'error') {
    return (
      <View style={styles.container}>
        <View style={styles.card}>
          <Text style={styles.errorHeading}>Couldn't Complete Setup</Text>
          <Text style={styles.body}>
            Something went wrong while securing your credential. Check your connection and try
            again.
          </Text>
          <TouchableOpacity style={styles.retryButton} onPress={attemptClaim}>
            <Text style={styles.retryButtonText}>Try Again</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <ActivityIndicator color="#3b82f6" size="large" style={styles.spinner} />
        <Text style={styles.heading}>Securing your credential…</Text>
        <Text style={styles.body}>
          Generating your private key on this device. This stays on your phone and is never sent
          anywhere.
        </Text>
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
