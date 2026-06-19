// RETIRED (Phase 08 Plan 05): this screen is no longer registered in App.js
// and nothing navigates to it. Its sole role — animated proof-generation
// progress after the old manual IdentityForm/ShowProof flow — is fully
// absorbed by GenerateProofScreen.js's own inline loading state (Plan 08-04).
// Left in place (not deleted) since this plan's files_modified lists it for
// edit, not removal; safe to delete in a future cleanup pass.

import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Animated, Easing } from 'react-native';
import { BACKEND_URL } from '../environment';

export default function LoadingScreen({ navigation, route }) {
  const { form } = route.params;
  const [progress] = useState(new Animated.Value(0));
  const [step, setStep] = useState(0);
  const [phase, setPhase] = useState('generating');

  // ponytail: nonce is single-use (zkp-backend/lib/nonceStore.js) and is baked
  // into the proof at generation time, so the holder's device cannot also
  // consume it here — verification happens once, later, in VerifyProof.js.
  const steps = {
    generating: [
      'Requesting verification session...',
      'Preparing input data...',
      'Generating zero-knowledge proof...',
    ],
  };

  useEffect(() => {
    startProofGeneration();
  }, []);

  const startProofGeneration = async () => {
    try {
      setPhase('generating');
      animateProgress(0, 1.0, 4000);

      await simulateSteps(steps.generating, 1200);
      const result = await generateProof(form);

      if (!result) {
        throw new Error('Proof generation failed');
      }

      // Navigate to results — verification happens later, once, when a
      // verifier scans the QR (VerifyProof.js), not here on the holder's device.
      navigation.replace('ShowProof', {
        proof: result.proof,
        publicSignals: result.publicSignals,
        sessionId: result.sessionId,
        formData: form,
      });

    } catch (error) {
      console.error('Error in proof pipeline:', error);
      navigation.navigate('ErrorScreen', { 
        error: error.message,
        canRetry: true,
        formData: form
      });
    }
  };

  const animateProgress = (from, to, duration) => {
    progress.setValue(from);
    Animated.timing(progress, {
      toValue: to,
      duration: duration,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  };

  const simulateSteps = async (stepArray, interval) => {
    for (let i = 0; i < stepArray.length; i++) {
      setStep(i);
      if (i < stepArray.length - 1) {
        await new Promise(resolve => setTimeout(resolve, interval));
      }
    }
  };

  const todayInt = () => {
    const d = new Date();
    return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  };

  const generateProof = async (form) => {
    const nonceRes = await fetch(`${BACKEND_URL}/session/nonce`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    const { nonce, sessionId } = await nonceRes.json();

    const attrs = {
      name: form.name,
      rollNo: form.rollNo,
      dob: form.dob,
      programmeLevel: form.programmeLevel,
      discipline: form.discipline,
      batch: form.batch,
      email: form.email,
    };
    // Reveal everything except dob/email — isOver18 (derived server-side)
    // covers the age claim without exposing the raw date of birth.
    const reveal = {
      name: true,
      rollNo: true,
      dob: false,
      programmeLevel: true,
      discipline: true,
      batch: true,
      email: false,
    };

    const startTime = performance.now();
    const response = await fetch(`${BACKEND_URL}/generate-proof`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ attrs, reveal, nonce, currentDateInt: todayInt() }),
    });
    const endTime = performance.now();
    console.log(`Proof generation API call took ${((endTime - startTime) / 1000).toFixed(2)} s`);

    const text = await response.text();
    const data = JSON.parse(text);

    if (!response.ok || !data.proof || !data.publicSignals) {
      throw new Error(data.error || 'Invalid proof data received');
    }

    return { proof: data.proof, publicSignals: data.publicSignals, sessionId };
  };

  const getCurrentStep = () => {
    return steps[phase] ? steps[phase][step] : 'Processing...';
  };

  const getPhaseTitle = () => '🔐 Generating Zero-Knowledge Proof';

  const getPhaseSubtitle = () => 'Creating cryptographic proof of your identity...';

  const progressWidth = progress.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%'],
  });

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <View style={styles.logoContainer}>
          <Text style={styles.logo}>🔐</Text>
          <Text style={styles.title}>{getPhaseTitle()}</Text>
        </View>

        <View style={styles.progressContainer}>
          <View style={styles.progressBar}>
            <Animated.View style={[styles.progressFill, { width: progressWidth }]} />
          </View>
          <Text style={styles.progressText}>{Math.round(progress._value * 100)}%</Text>
        </View>

        <Text style={styles.stepText}>{getCurrentStep()}</Text>
        
        <Text style={styles.subtitle}>
          {getPhaseSubtitle()}
        </Text>

        {/* Verification Status Indicators */}
        <View style={styles.statusContainer}>
          <View style={styles.statusItem}>
            <Text style={styles.statusIcon}>⏳</Text>
            <Text style={styles.statusText}>Proof Generation</Text>
          </View>
        </View>
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
  },
  content: {
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  logoContainer: {
    alignItems: 'center',
    marginBottom: 40,
  },
  logo: {
    fontSize: 60,
    marginBottom: 16,
  },
  title: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#1e293b',
    textAlign: 'center',
    marginBottom: 8,
  },
  progressContainer: {
    width: '100%',
    alignItems: 'center',
    marginBottom: 30,
  },
  progressBar: {
    width: '100%',
    height: 8,
    backgroundColor: '#e2e8f0',
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 8,
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#3b82f6',
    borderRadius: 4,
  },
  progressText: {
    fontSize: 14,
    color: '#64748b',
    fontWeight: '600',
  },
  stepText: {
    fontSize: 16,
    color: '#3b82f6',
    fontWeight: '600',
    marginBottom: 20,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 14,
    color: '#64748b',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 30,
  },
  statusContainer: {
    width: '100%',
    gap: 12,
  },
  statusItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  statusIcon: {
    fontSize: 20,
    marginRight: 12,
    width: 30,
    textAlign: 'center',
  },
  statusText: {
    fontSize: 14,
    color: '#374151',
    fontWeight: '500',
    flex: 1,
  },
});
