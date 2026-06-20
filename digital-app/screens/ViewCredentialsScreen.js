import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { ADMIN_BACKEND_URL, BACKEND_URL } from '../environment';
import { unwrapDEK } from '../utils/dek';
import { decryptCredentialBlob } from '../utils/credentialCrypto';

const IPFS_GATEWAY_BASE = 'https://gateway.pinata.cloud/ipfs/';

// dobInt is YYYYMMDD as an integer (e.g. 20041014) — the circuit's encoding.
function formatDobInt(dobInt) {
  const s = String(dobInt);
  return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
}

// D-05 mapping: found && !revoked -> Verified; found && revoked -> Revoked;
// network/throw on the status check ONLY -> Unable to verify (never red,
// never fails the whole screen — T-08-08).
const BLOCKCHAIN_STATUS = {
  verified: { label: 'Blockchain Status: Verified', color: '#22c55e' },
  revoked: { label: 'Blockchain Status: Revoked', color: '#ef4444' },
  unable: { label: 'Blockchain Status: Unable to verify', color: '#64748b' },
};

export default function ViewCredentialsScreen({ route, navigation }) {
  const { rollNo } = route.params;

  const [status, setStatus] = useState('loading'); // 'loading' | 'error' | 'ready'
  const [errorMessage, setErrorMessage] = useState(null);
  const [credential, setCredential] = useState(null);
  const [blockchainStatus, setBlockchainStatus] = useState(BLOCKCHAIN_STATUS.unable);

  const checkBlockchainStatus = async (merkleRoot) => {
    // Isolated from the main try/catch below — a status-check failure must
    // never blank the already-decrypted credential (T-08-08).
    try {
      const response = await fetch(`${BACKEND_URL}/credential-info`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pubHash: merkleRoot }),
      });
      const data = await response.json();
      if (data.found && !data.revoked) {
        setBlockchainStatus(BLOCKCHAIN_STATUS.verified);
      } else if (data.found && data.revoked) {
        setBlockchainStatus(BLOCKCHAIN_STATUS.revoked);
      } else {
        setBlockchainStatus(BLOCKCHAIN_STATUS.unable);
      }
    } catch {
      setBlockchainStatus(BLOCKCHAIN_STATUS.unable);
    }
  };

  const loadCredential = async () => {
    setStatus('loading');
    setErrorMessage(null);
    try {
      // 1. fetch CIDs via GET /credential/:rollNo/blobs (Plan 08-01)
      const blobsRes = await fetch(
        `${ADMIN_BACKEND_URL}/api/students/credential/${rollNo}/blobs`
      );
      const blobsData = await blobsRes.json();
      if (!blobsRes.ok) {
        throw new Error(blobsData.message || 'Failed to fetch credential blobs');
      }
      const { ciphertextCID, dekEnvelopeCID } = blobsData;

      // 2. fetch both objects from the IPFS gateway
      const [ciphertextBlob, dekEnvelopeJson] = await Promise.all([
        fetch(`${IPFS_GATEWAY_BASE}${ciphertextCID}`).then(r => r.json()),
        fetch(`${IPFS_GATEWAY_BASE}${dekEnvelopeCID}`).then(r => r.json()),
      ]);
      // Pinata's pinJSONToIPFS always wraps content as JSON, so the envelope
      // is pinned as { dekEnvelope: "<base64>" }, not a bare base64 string.
      const dekEnvelopeBase64 = dekEnvelopeJson.dekEnvelope;

      // 3. unwrap the DEK on-device (Plan 08-02)
      const dek = await unwrapDEK(dekEnvelopeBase64);

      // 4. decrypt the credential on-device (Plan 08-02)
      const cred = decryptCredentialBlob(ciphertextBlob, dek);

      setCredential(cred);
      setStatus('ready');

      // 5. live on-chain status (D-05) — isolated, cannot fail the screen
      checkBlockchainStatus(cred.merkleRoot);
    } catch (error) {
      // unwrapDEK throws this exact message when no key exists in this
      // device's SecureStore — i.e. the key pair was generated on a
      // different device and never left it (by design).
      const isMissingKey = error.message === 'unwrapDEK: no stored private key found';
      setErrorMessage(
        isMissingKey
          ? 'Your private key is not available on this device. It was generated on the device where you first claimed your credential, and never leaves that device.'
          : error.message || "Couldn't load your credential. Check your connection and try again."
      );
      setStatus('error');
    }
  };

  useEffect(() => {
    loadCredential();
  }, []);

  if (status === 'error') {
    return (
      <View style={styles.container}>
        <View style={styles.card}>
          <Text style={styles.errorHeading}>Couldn't Load Credential</Text>
          <Text style={styles.body}>{errorMessage}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={loadCredential}>
            <Text style={styles.retryButtonText}>Try Again</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  if (status === 'loading') {
    return (
      <View style={styles.container}>
        <View style={styles.card}>
          <ActivityIndicator color="#3b82f6" size="large" style={styles.spinner} />
          <Text style={styles.heading}>Decrypting your credential…</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <Text style={styles.heading}>Your Credential</Text>

        <View style={styles.attributeRow}>
          <Text style={styles.attributeLabel}>Name</Text>
          <Text style={styles.attributeValue}>{credential.name}</Text>
        </View>
        <View style={styles.attributeRow}>
          <Text style={styles.attributeLabel}>Roll No</Text>
          <Text style={styles.attributeValue}>{credential.rollNo}</Text>
        </View>
        <View style={styles.attributeRow}>
          <Text style={styles.attributeLabel}>Program</Text>
          <Text style={styles.attributeValue}>{credential.programmeLevel}</Text>
        </View>
        <View style={styles.attributeRow}>
          <Text style={styles.attributeLabel}>Branch</Text>
          <Text style={styles.attributeValue}>{credential.discipline}</Text>
        </View>
        <View style={styles.attributeRow}>
          <Text style={styles.attributeLabel}>Batch</Text>
          <Text style={styles.attributeValue}>{credential.batch}</Text>
        </View>
        <View style={styles.attributeRow}>
          <Text style={styles.attributeLabel}>Date of Birth</Text>
          <Text style={styles.attributeValue}>{formatDobInt(credential.dobInt)}</Text>
        </View>
        <View style={styles.attributeRow}>
          <Text style={styles.attributeLabel}>Email</Text>
          <Text style={styles.attributeValue}>{credential.email}</Text>
        </View>
        <View style={styles.attributeRow}>
          <Text style={styles.attributeLabel}>Status</Text>
          <Text style={styles.attributeValue}>Active</Text>
        </View>

        <Text style={[styles.blockchainBadge, { color: blockchainStatus.color }]}>
          {blockchainStatus.label}
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
    marginBottom: 16,
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
  attributeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  attributeLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#64748b',
  },
  attributeValue: {
    fontSize: 15,
    color: '#1e293b',
    fontWeight: '600',
  },
  blockchainBadge: {
    fontSize: 13,
    fontWeight: '700',
    marginTop: 20,
    textAlign: 'center',
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
