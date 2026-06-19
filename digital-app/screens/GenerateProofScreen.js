/**
 * GenerateProofScreen.js — checklist (consent) + manual nonce + /generate-proof
 * call + result QR (Phase 8 Plan 04).
 *
 * Checkbox-to-reveal-key mapping (Task 1 checkpoint, resolved: map-a):
 *   "Name"             -> name: true
 *   "Degree Program"   -> programmeLevel: true
 *   "Graduation Year"  -> batch: true
 *   "Full Credential"  -> all 7 circuit reveal keys true
 *   "Enrollment Status"-> NOT a circuit reveal key at all. It is a pure
 *                         display-gate label, satisfied out-of-band by the
 *                         existing /credential-info found && !revoked check
 *                         (same mechanism as ViewCredentialsScreen's D-05
 *                         Blockchain Status badge). Checking it sets no
 *                         reveal{} boolean.
 *
 * The circuit cryptographically enforces that unrevealed attributes never
 * appear in publicSignals (revealMask/revealedValue) — REVEAL_KEY_MAP only
 * controls which booleans the app sends, it cannot over-disclose beyond
 * what the circuit allows (T-08-10).
 *
 * Pitfall 2 (RESEARCH.md): salts MUST be passed through explicitly from the
 * decrypted credential — never omit, or the proof will pass /verify but
 * fail /verify-onchain (merkleRoot mismatch).
 * Pitfall 3 (RESEARCH.md): the decrypted credential's `dobInt` key MUST be
 * remapped to the request's `dob` key.
 *
 * Never logs the DEK, private key, or decrypted plaintext (T-08-04/T-08-07).
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { ADMIN_BACKEND_URL, BACKEND_URL } from '../environment';
import { unwrapDEK } from '../utils/dek';
import { decryptCredentialBlob } from '../utils/credentialCrypto';

const IPFS_GATEWAY_BASE = 'https://gateway.pinata.cloud/ipfs/';

// All 7 circuit reveal keys — "Full Credential" sets every one of these true.
const ALL_REVEAL_KEYS = [
  'name',
  'rollNo',
  'dob',
  'programmeLevel',
  'discipline',
  'batch',
  'email',
];

// Task 1 checkpoint decision (map-a): checkbox label -> circuit reveal key(s).
// "Enrollment Status" intentionally maps to an empty array — it sets no
// reveal{} boolean; it is a display-only concept satisfied by the existing
// /credential-info non-revocation check, never disclosed via the circuit.
export const REVEAL_KEY_MAP = {
  Name: ['name'],
  'Enrollment Status': [],
  'Degree Program': ['programmeLevel'],
  'Graduation Year': ['batch'],
  'Full Credential': ALL_REVEAL_KEYS,
};

export const CHECKLIST_LABELS = Object.keys(REVEAL_KEY_MAP);

/**
 * buildRevealMap(checkedLabels) -> { name, rollNo, dob, programmeLevel,
 *   discipline, batch, email } booleans, derived from REVEAL_KEY_MAP.
 * Exported so Plan 08-05's Verify-Proof Step 1 (challenge-out) and Step 2
 * (prove-back) can reuse the exact same mapping logic.
 */
export function buildRevealMap(checkedLabels) {
  const reveal = ALL_REVEAL_KEYS.reduce((acc, key) => {
    acc[key] = false;
    return acc;
  }, {});
  checkedLabels.forEach(label => {
    const keys = REVEAL_KEY_MAP[label] || [];
    keys.forEach(key => {
      reveal[key] = true;
    });
  });
  return reveal;
}

/**
 * AttributeChecklist — reusable 44px-min-height checkbox list, exported for
 * Plan 08-05's Verify-Proof Step 1 (challenge-out) to reuse.
 */
export function AttributeChecklist({ checked, onToggle, note }) {
  return (
    <View>
      <Text style={styles.checklistHeading}>Choose what to share</Text>
      {note ? <Text style={styles.requestedNote}>{note}</Text> : null}
      {CHECKLIST_LABELS.map(label => {
        const isChecked = !!checked[label];
        return (
          <TouchableOpacity
            key={label}
            style={styles.checklistRow}
            onPress={() => onToggle(label)}
            activeOpacity={0.7}
          >
            <View style={[styles.checkboxGlyphBox, isChecked && styles.checkboxGlyphBoxChecked]}>
              <Text style={styles.checkboxGlyph}>{isChecked ? '☑' : '☐'}</Text>
            </View>
            <Text style={styles.checklistLabel}>{label}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

export default function GenerateProofScreen({ route, navigation }) {
  const { rollNo, requestedFields, fromVerifierRequest } = route.params || {};

  const initialChecked = {};
  if (fromVerifierRequest && Array.isArray(requestedFields)) {
    requestedFields.forEach(label => {
      if (CHECKLIST_LABELS.includes(label)) {
        initialChecked[label] = true;
      }
    });
  }

  const [checked, setChecked] = useState(initialChecked);
  const [nonce, setNonce] = useState('');
  const [loading, setLoading] = useState(false);
  const [validationError, setValidationError] = useState(null);
  const [submitError, setSubmitError] = useState(null);
  const [result, setResult] = useState(null); // { proof, publicSignals }

  const handleToggle = label => {
    setChecked(prev => ({ ...prev, [label]: !prev[label] }));
  };

  const handleGenerateProof = async () => {
    setValidationError(null);
    setSubmitError(null);

    const checkedLabels = CHECKLIST_LABELS.filter(label => checked[label]);
    if (checkedLabels.length === 0) {
      setValidationError('Select at least one attribute to generate a proof.');
      return;
    }

    setLoading(true);
    try {
      // 1. fetch CIDs (Plan 08-01)
      const blobsRes = await fetch(
        `${ADMIN_BACKEND_URL}/api/students/credential/${rollNo}/blobs`
      );
      const blobsData = await blobsRes.json();
      if (!blobsRes.ok) {
        throw new Error(blobsData.message || 'Failed to fetch credential blobs');
      }
      const { ciphertextCID, dekEnvelopeCID } = blobsData;

      // 2. fetch both objects from the IPFS gateway
      const [ciphertextBlob, dekEnvelopeBase64] = await Promise.all([
        fetch(`${IPFS_GATEWAY_BASE}${ciphertextCID}`).then(r => r.json()),
        fetch(`${IPFS_GATEWAY_BASE}${dekEnvelopeCID}`).then(r => r.text()),
      ]);

      // 3. unwrap DEK on-device (Plan 08-02)
      const dek = await unwrapDEK(dekEnvelopeBase64);

      // 4. decrypt credential on-device (Plan 08-02)
      const cred = decryptCredentialBlob(ciphertextBlob, dek);

      // 5. build the exact /generate-proof request (RESEARCH.md Pattern 4)
      const attrs = {
        name: cred.name,
        rollNo: cred.rollNo,
        dob: cred.dobInt, // Pitfall 3: remap dobInt -> dob
        programmeLevel: cred.programmeLevel,
        discipline: cred.discipline,
        batch: cred.batch,
        email: cred.email,
      };

      const reveal = buildRevealMap(checkedLabels);
      const currentDateInt = Number(
        new Date().toISOString().slice(0, 10).replace(/-/g, '')
      );

      const response = await fetch(`${BACKEND_URL}/generate-proof`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          attrs,
          salts: cred.salts, // Pitfall 2: never omit
          reveal,
          nonce: nonce.trim(),
          currentDateInt,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.message || 'Failed to generate proof');
      }

      setResult({ proof: data.proof, publicSignals: data.publicSignals });
    } catch (error) {
      setSubmitError(
        error.message
          ? `Couldn't generate proof. Check your challenge code and try again.`
          : `Couldn't generate proof. Check your challenge code and try again.`
      );
    } finally {
      setLoading(false);
    }
  };

  const handleTryAgain = () => {
    setSubmitError(null);
    setResult(null);
  };

  if (result) {
    const qrValue = JSON.stringify({
      proof: result.proof,
      publicSignals: result.publicSignals,
    });

    return (
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.card}>
          <Text style={styles.heading}>Proof Ready</Text>
          <Text style={styles.body}>
            Share this QR code with your verifier, or use Verify Proof's Step 2 to send it
            directly.
          </Text>

          <View style={styles.qrWrapper}>
            <QRCode value={qrValue} size={220} backgroundColor="#ffffff" />
          </View>

          <View style={styles.infoBox}>
            <Text style={styles.infoText}>
              This proof is valid for 15 minutes after generation.
            </Text>
          </View>
        </View>
      </ScrollView>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
      <Text style={styles.screenHeading}>Generate Proof</Text>

      <View style={styles.card}>
        <AttributeChecklist
          checked={checked}
          onToggle={handleToggle}
          note={
            fromVerifierRequest ? 'Requested by verifier — review before sharing' : null
          }
        />

        {validationError ? <Text style={styles.errorText}>{validationError}</Text> : null}

        <Text style={styles.label}>Verifier Challenge Code</Text>
        <TextInput
          style={styles.input}
          placeholder="Paste the code from your verifier"
          value={nonce}
          onChangeText={setNonce}
          autoCapitalize="none"
          autoCorrect={false}
          placeholderTextColor="#9ca3af"
        />

        {submitError ? (
          <View>
            <Text style={styles.errorText}>{submitError}</Text>
          </View>
        ) : null}

        <TouchableOpacity
          style={[styles.generateButton, loading && styles.disabledButton]}
          onPress={submitError ? handleTryAgain : handleGenerateProof}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.generateButtonText}>
              {submitError ? 'Try Again' : 'Generate Proof'}
            </Text>
          )}
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    flexGrow: 1,
    backgroundColor: '#f8fafc',
    padding: 24,
  },
  screenHeading: {
    fontSize: 22,
    fontWeight: '700',
    color: '#1e293b',
    marginBottom: 16,
    textAlign: 'center',
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07,
    shadowRadius: 8,
    elevation: 3,
  },
  checklistHeading: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1e293b',
    marginBottom: 8,
  },
  requestedNote: {
    fontSize: 13,
    color: '#64748b',
    marginBottom: 12,
  },
  checklistRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 44,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  checkboxGlyphBox: {
    width: 28,
    height: 28,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  checkboxGlyphBoxChecked: {},
  checkboxGlyph: {
    fontSize: 22,
    color: '#3b82f6',
  },
  checklistLabel: {
    fontSize: 15,
    color: '#1e293b',
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 8,
    marginTop: 20,
  },
  input: {
    borderWidth: 1.5,
    borderColor: '#e2e8f0',
    borderRadius: 10,
    padding: 14,
    fontSize: 15,
    color: '#1f2937',
    backgroundColor: '#f9fafb',
  },
  errorText: {
    fontSize: 13,
    color: '#ef4444',
    marginTop: 8,
  },
  generateButton: {
    backgroundColor: '#3b82f6',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 24,
    shadowColor: '#3b82f6',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  disabledButton: {
    backgroundColor: '#93c5fd',
    shadowOpacity: 0,
    elevation: 0,
  },
  generateButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
  },
  heading: {
    fontSize: 22,
    fontWeight: '700',
    color: '#1e293b',
    marginBottom: 12,
    textAlign: 'center',
  },
  body: {
    fontSize: 15,
    color: '#64748b',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 20,
  },
  qrWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ffffff',
    padding: 16,
    borderRadius: 12,
    marginBottom: 20,
  },
  infoBox: {
    backgroundColor: '#eff6ff',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#bfdbfe',
  },
  infoText: {
    fontSize: 13,
    color: '#1e40af',
    lineHeight: 20,
    textAlign: 'center',
  },
});
