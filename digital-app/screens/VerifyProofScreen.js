/**
 * VerifyProofScreen.js — two-hop QR challenge/response (D-09), Phase 8 Plan 05.
 *
 * Step 1 of 2 ("Share Your Challenge"): verifier picks requested fields via
 * the shared AttributeChecklist (Plan 08-04), then POSTs zkp-backend
 * /session/nonce (backend-issued, never client-invented — anti-replay,
 * T-08-13) and renders {nonce, sessionId, requestedFields} as a QR.
 *
 * Step 2 of 2 ("Scan Their Proof"): verifier scans/enters the prover's
 * returned {proof, publicSignals, sessionId} and runs the live check:
 * POST /verify-onchain (cryptographic + nonce check) + POST /credential-info
 * (revocation check). Open Question 3 / T-08-14: NEVER call /verify here —
 * /verify and /verify-onchain each independently call validateAndConsume,
 * so calling both against the same sessionId double-consumes the nonce and
 * the second call always fails with "nonce_already_used". /verify-onchain
 * alone is the strictly-stronger on-chain check (re-runs Groth16 via the
 * deployed contract) — this preserves VerifyProof.js's original lines 17-20
 * rationale comment, carried forward below.
 *
 * Both hops support scan-or-manual parity (D-09): "Scan QR" button +
 * "Or enter code manually" text-link in the same footer, mirroring
 * QRScannerScreen.js's footer gap:16 button stack.
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
  Alert,
} from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { BACKEND_URL } from '../environment';
import { AttributeChecklist, CHECKLIST_LABELS, ATTR_DISPLAY_LABELS } from './GenerateProofScreen';
import { verifyRevealedBinding } from '../utils/identityEncoding';

// Public-signal layout (identity.circom lines 22-30, frozen):
// [0] pubHash [1] nonce [2] currentDateInt [3] isOver18 [4] isPostgrad
// [5..11] revealedValue[7] [12..18] revealMask[7], both in ATTR_KEYS order
// (name, rollNo, dob, programmeLevel, discipline, batch, email).
const ATTR_KEYS = ['name', 'rollNo', 'dob', 'programmeLevel', 'discipline', 'batch', 'email'];
const REVEAL_MASK_OFFSET = 12;

function decodeRevealedFields(publicSignals) {
  if (!Array.isArray(publicSignals) || publicSignals.length < REVEAL_MASK_OFFSET + 7) return [];
  return ATTR_KEYS.filter((key, i) => String(publicSignals[REVEAL_MASK_OFFSET + i]) === '1').map(
    key => ATTR_DISPLAY_LABELS[key]
  );
}

// ponytail: the nonce is one-time-use per sessionId (zkp-backend/lib/nonceStore.js),
// and /verify + /verify-onchain both independently consume it — so only one can
// run per proof. /verify-onchain is the authoritative check (re-runs Groth16 on
// Sepolia), so the separate off-chain /verify pre-check is dropped rather than
// threading a second nonce through (Open Question 3, T-08-14).

function mapInvalidReason(reason, registry) {
  if (registry && registry.found && registry.revoked) {
    return 'This credential has been revoked.';
  }
  if (reason === 'nonce_expired') {
    return 'This proof has expired (older than 15 minutes). Ask for a new one.';
  }
  if (reason === 'nonce_mismatch') {
    return "Nonce Mismatch — this proof wasn't generated for this challenge.";
  }
  if (reason === 'nonce_already_used') {
    return 'This challenge has already been used. Ask for a new one.';
  }
  if (reason === 'unknown_session') {
    return "This challenge wasn't recognized. Ask for a new one.";
  }
  if (reason === 'invalid_proof') {
    return 'This proof failed cryptographic verification.';
  }
  return reason
    ? `Verification failed: ${reason}`
    : 'This proof could not be verified for an unspecified reason.';
}

export default function VerifyProofScreen({ navigation, route }) {
  const [hop, setHop] = useState(1);

  // Step 1 state
  const [checked, setChecked] = useState({});
  const [creatingChallenge, setCreatingChallenge] = useState(false);
  const [challenge, setChallenge] = useState(null); // { nonce, sessionId, requestedFields }
  const [challengeError, setChallengeError] = useState(null);

  // Step 2 state
  const [manualProofText, setManualProofText] = useState('');
  const [showManualProofInput, setShowManualProofInput] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [verifyResult, setVerifyResult] = useState(null); // { valid, reasonText, details, revealedFields }

  // Picked up after QRScannerScreen navigates back here with a scanned proof.
  useEffect(() => {
    const scanned = route?.params?.scannedProofPayload;
    if (scanned) {
      setHop(2);
      runVerification(scanned);
      navigation.setParams({ scannedProofPayload: undefined });
    }
  }, [route?.params?.scannedProofPayload]);

  const handleToggleAttribute = label => {
    setChecked(prev => ({ ...prev, [label]: !prev[label] }));
  };

  const handleCreateChallenge = async () => {
    setChallengeError(null);
    setCreatingChallenge(true);
    try {
      const response = await fetch(`${BACKEND_URL}/session/nonce`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.message || 'Failed to create challenge');
      }
      const requestedFields = CHECKLIST_LABELS.filter(label => checked[label]);
      setChallenge({
        nonce: data.nonce,
        sessionId: data.sessionId,
        requestedFields,
      });
    } catch (error) {
      setChallengeError(
        "Couldn't create a challenge. Check your connection and try again."
      );
    } finally {
      setCreatingChallenge(false);
    }
  };

  const handleScanProof = () => {
    navigation.navigate('QRScannerScreen');
  };

  const handleManualProofSubmit = () => {
    try {
      const payload = JSON.parse(manualProofText);
      if (!payload.proof || !payload.publicSignals) {
        Alert.alert(
          'Invalid QR Code',
          "Couldn't read that QR code. Make sure it's a valid PrivdID proof and try again."
        );
        return;
      }
      runVerification(payload);
    } catch (error) {
      Alert.alert(
        'Invalid QR Code',
        "Couldn't read that QR code. Make sure it's a valid PrivdID proof and try again."
      );
    }
  };

  const runVerification = async payload => {
    setVerifying(true);
    setVerifyResult(null);
    try {
      const { proof, publicSignals, sessionId, revealed } = payload;

      // Authoritative cryptographic + nonce check. Do NOT also call /verify —
      // see header comment / T-08-14.
      const verifyOnChainRes = await fetch(`${BACKEND_URL}/verify-onchain`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ proof, publicSignals, sessionId }),
      });
      const verifyOnChainData = await verifyOnChainRes.json();

      // Revocation check, independent of the cryptographic result.
      let registry = { found: false };
      try {
        const pubHash = publicSignals[0];
        const registryRes = await fetch(`${BACKEND_URL}/credential-info`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ pubHash }),
        });
        if (registryRes.ok) {
          registry = await registryRes.json();
        }
      } catch {
        registry = { found: false };
      }

      const cryptoValid = !!verifyOnChainData.valid;
      const revoked = registry.found && registry.revoked;

      // Bind the shared plaintext to the proof: re-derive each revealed field
      // and confirm it equals the proof's revealedValue[] public signal. A
      // valid proof says nothing about whether the QR's `revealed` object is
      // honest, so a mismatch here means tampered/forged disclosure -> reject.
      const hasRevealed = revealed && Object.keys(revealed).length > 0;
      const binding = hasRevealed
        ? verifyRevealedBinding(revealed, publicSignals)
        : { ok: true, mismatched: [] };

      const overallValid = cryptoValid && !revoked && binding.ok;

      if (overallValid) {
        setVerifyResult({
          valid: true,
          // Actual plaintext the prover chose to share (from the QR); falls
          // back to field-name-only when an older proof carries no `revealed`.
          revealedValues: revealed && Object.keys(revealed).length ? revealed : null,
          revealedFields: decodeRevealedFields(publicSignals),
          details: {
            issuer: 'PrivdID — IIITDM Jabalpur',
            timestamp: new Date().toISOString(),
            onChain: true,
            registryFound: registry.found,
          },
        });
      } else if (cryptoValid && !revoked && !binding.ok) {
        // Proof is cryptographically sound but the shared values don't match
        // what it commits to — surface this distinctly from a bad proof.
        setVerifyResult({
          valid: false,
          reasonText:
            'The shared details do not match the proof. The values may have been altered — do not trust them.',
        });
      } else {
        const reasonText = mapInvalidReason(verifyOnChainData.reason, registry);
        setVerifyResult({ valid: false, reasonText });
      }
    } catch (error) {
      setVerifyResult({
        valid: false,
        reasonText:
          "Couldn't read that QR code. Make sure it's a valid PrivdID proof and try again.",
      });
    } finally {
      setVerifying(false);
    }
  };

  const handleReset = () => {
    // This screen is popped on navigate-away, so no need to clear local state.
    // A student reaches it from their Dashboard (student in params); a public
    // verifier reaches it from WelcomeScreen with none. popTo returns to the
    // existing screen up the stack with its original params intact — no reset
    // jank, and DashboardScreen keeps the `student` it already has.
    navigation.popTo(route?.params?.student ? 'DashboardScreen' : 'WelcomeScreen');
  };

  const hopBadge = (
    <View style={styles.hopBadgeWrapper}>
      <View style={styles.hopBadge}>
        <Text style={styles.hopBadgeText}>Step {hop} of 2</Text>
      </View>
    </View>
  );

  // ---------- STEP 2 result view ----------
  if (verifyResult) {
    return (
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {hopBadge}
        <View style={styles.card}>
          {verifyResult.valid ? (
            <>
              <Text style={[styles.resultHeading, styles.validHeading]}>Proof Valid</Text>
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Issuer</Text>
                <Text style={styles.detailValue}>{verifyResult.details.issuer}</Text>
              </View>
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Timestamp</Text>
                <Text style={styles.detailValue}>
                  {new Date(verifyResult.details.timestamp).toLocaleString()}
                </Text>
              </View>
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>On-Chain</Text>
                <Text style={styles.detailValue}>Verified</Text>
              </View>
              {verifyResult.revealedValues ? (
                Object.entries(verifyResult.revealedValues).map(([key, value]) => (
                  <View style={styles.detailRow} key={key}>
                    <Text style={styles.detailLabel}>{ATTR_DISPLAY_LABELS[key] || key}</Text>
                    <Text style={styles.detailValue}>{String(value)}</Text>
                  </View>
                ))
              ) : (
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Revealed Fields</Text>
                  <Text style={styles.detailValue}>
                    {verifyResult.revealedFields?.length
                      ? verifyResult.revealedFields.join(', ')
                      : 'None'}
                  </Text>
                </View>
              )}
            </>
          ) : (
            <>
              <Text style={[styles.resultHeading, styles.invalidHeading]}>Proof Invalid</Text>
              <Text style={styles.reasonText}>{verifyResult.reasonText}</Text>
            </>
          )}

          <TouchableOpacity style={styles.secondaryButton} onPress={handleReset}>
            <Text style={styles.secondaryButtonText}>
              {route?.params?.student ? 'Back to Dashboard' : 'Done'}
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    );
  }

  // ---------- STEP 2 (scan/enter the prover's proof) ----------
  if (hop === 2) {
    return (
      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        {hopBadge}
        <Text style={styles.screenHeading}>Verify Proof</Text>
        <View style={styles.card}>
          <Text style={styles.heading}>Scan Their Proof</Text>
          <Text style={styles.body}>
            Scan the proof QR code they shared back, or enter it manually.
          </Text>

          {verifying ? (
            <ActivityIndicator color="#3b82f6" size="large" style={styles.spinner} />
          ) : (
            <>
              <View style={styles.footer}>
                <TouchableOpacity style={styles.scanButton} onPress={handleScanProof}>
                  <Text style={styles.scanButtonText}>Scan QR</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => setShowManualProofInput(v => !v)}
                >
                  <Text style={styles.manualLink}>Or enter code manually</Text>
                </TouchableOpacity>
              </View>

              {showManualProofInput && (
                <View>
                  <TextInput
                    style={styles.input}
                    placeholder='{"proof": {...}, "publicSignals": [...], "sessionId": "..."}'
                    value={manualProofText}
                    onChangeText={setManualProofText}
                    multiline
                    numberOfLines={6}
                    textAlignVertical="top"
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                  <TouchableOpacity
                    style={styles.generateButton}
                    onPress={handleManualProofSubmit}
                  >
                    <Text style={styles.generateButtonText}>Verify</Text>
                  </TouchableOpacity>
                </View>
              )}
            </>
          )}
        </View>
      </ScrollView>
    );
  }

  // ---------- STEP 1 (create the challenge) ----------
  return (
    <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
      {hopBadge}
      <Text style={styles.screenHeading}>Verify Proof</Text>
      <View style={styles.card}>
        <Text style={styles.heading}>Share Your Challenge</Text>
        <Text style={styles.body}>
          Choose what you want proven, then share this QR code with the person you're
          verifying.
        </Text>

        <View style={styles.infoBox}>
          <Text style={styles.infoText}>
            Nothing is saved — this check happens live and isn't stored anywhere.
          </Text>
        </View>

        {!challenge && (
          <AttributeChecklist checked={checked} onToggle={handleToggleAttribute} />
        )}

        {challengeError ? <Text style={styles.errorText}>{challengeError}</Text> : null}

        {!challenge ? (
          <TouchableOpacity
            style={[styles.generateButton, creatingChallenge && styles.disabledButton]}
            onPress={handleCreateChallenge}
            disabled={creatingChallenge}
          >
            {creatingChallenge ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.generateButtonText}>Create Challenge</Text>
            )}
          </TouchableOpacity>
        ) : (
          <>
            <View style={styles.qrWrapper}>
              <QRCode
                value={JSON.stringify({
                  nonce: challenge.nonce,
                  sessionId: challenge.sessionId,
                  requestedFields: challenge.requestedFields,
                })}
                size={220}
                backgroundColor="#ffffff"
                ecl="M"
              />
            </View>

            <View style={styles.footer}>
              <TouchableOpacity style={styles.scanButton} onPress={() => setHop(2)}>
                <Text style={styles.scanButtonText}>Continue to Step 2</Text>
              </TouchableOpacity>
            </View>
          </>
        )}
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
  hopBadgeWrapper: {
    alignItems: 'center',
    marginBottom: 12,
  },
  hopBadge: {
    backgroundColor: '#3b82f6',
    borderRadius: 999,
    paddingVertical: 6,
    paddingHorizontal: 16,
  },
  hopBadgeText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700',
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
  heading: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1e293b',
    marginBottom: 8,
    textAlign: 'center',
  },
  body: {
    fontSize: 15,
    color: '#64748b',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 16,
  },
  infoBox: {
    backgroundColor: '#eff6ff',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#bfdbfe',
    marginBottom: 16,
  },
  infoText: {
    fontSize: 13,
    color: '#1e40af',
    lineHeight: 20,
    textAlign: 'center',
  },
  errorText: {
    fontSize: 13,
    color: '#ef4444',
    marginTop: 8,
    textAlign: 'center',
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
  qrWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ffffff',
    padding: 16,
    borderRadius: 12,
    marginVertical: 20,
  },
  footer: {
    alignItems: 'center',
    gap: 16,
    marginTop: 12,
  },
  scanButton: {
    backgroundColor: '#3b82f6',
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: 24,
    alignItems: 'center',
  },
  scanButtonText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '700',
  },
  manualLink: {
    color: '#3b82f6',
    fontSize: 14,
    fontWeight: '600',
    textDecorationLine: 'underline',
  },
  input: {
    borderWidth: 1.5,
    borderColor: '#e2e8f0',
    borderRadius: 10,
    padding: 14,
    fontSize: 14,
    color: '#1f2937',
    backgroundColor: '#f9fafb',
    marginTop: 16,
    fontFamily: 'monospace',
    minHeight: 120,
  },
  spinner: {
    marginVertical: 24,
  },
  resultHeading: {
    fontSize: 22,
    fontWeight: '700',
    marginBottom: 16,
    textAlign: 'center',
  },
  validHeading: {
    color: '#22c55e',
  },
  invalidHeading: {
    color: '#ef4444',
  },
  reasonText: {
    fontSize: 15,
    color: '#64748b',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 8,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  detailLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#64748b',
  },
  detailValue: {
    fontSize: 15,
    color: '#1e293b',
    fontWeight: '500',
  },
  secondaryButton: {
    backgroundColor: '#ffffff',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#e2e8f0',
    marginTop: 24,
  },
  secondaryButtonText: {
    color: '#64748b',
    fontSize: 15,
    fontWeight: '600',
  },
});
