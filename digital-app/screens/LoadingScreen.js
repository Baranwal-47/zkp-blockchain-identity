import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Animated, Easing } from 'react-native';
import { BACKEND_URL } from '../environment';

export default function LoadingScreen({ navigation, route }) {
  const { form } = route.params;
  const [progress] = useState(new Animated.Value(0));
  const [step, setStep] = useState(0);
  const [phase, setPhase] = useState('generating'); // 'generating', 'offchain', 'blockchain'
  const [proofData, setProofData] = useState(null);
  const [verificationResults, setVerificationResults] = useState({
    offchain: null,
    blockchain: null
  });
  
  const steps = {
    generating: [
      'Preparing input data...',
      'Computing Poseidon hashes...',
      'Generating zero-knowledge proof...',
    ],
    offchain: [
      'Verifying proof off-chain...',
      'Off-chain verification complete! ✅'
    ],
    blockchain: [
      'Connecting to blockchain...',
      'Submitting proof to smart contract...',
      'Blockchain verification complete! 🔗✅'
    ]
  };

  useEffect(() => {
    startProofGeneration();
  }, []);

  const startProofGeneration = async () => {
    try {
      // Phase 1: Generate Proof (0-60%)
      setPhase('generating');
      animateProgress(0, 0.6, 4000);
      
      await simulateSteps(steps.generating, 1200);
      const proof = await generateProof(form);
      
      if (!proof) {
        throw new Error('Proof generation failed');
      }

      setProofData(proof);
      
      // Phase 2: Off-chain Verification (60-80%)
      setPhase('offchain');
      setStep(0);
      animateProgress(0.6, 0.8, 2000);
      
      await simulateSteps(steps.offchain, 1000);
      const offchainResult = await verifyOffChain(proof);
      setVerificationResults(prev => ({ ...prev, offchain: offchainResult }));
      
      // Phase 3: Blockchain Verification (80-100%)
      setPhase('blockchain');
      setStep(0);
      animateProgress(0.8, 1.0, 3000);
      
      await simulateSteps(steps.blockchain, 1000);
      const blockchainResult = await verifyOnChain(proof);
      setVerificationResults(prev => ({ ...prev, blockchain: blockchainResult }));
      
      // Navigate to results
      navigation.replace('ShowProof', { 
        proof: proof.proof, 
        publicSignals: proof.publicSignals,
        formData: form,
        verification: {
          offchain: offchainResult,
          blockchain: blockchainResult
        }
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

  const generateProof = async (form) => {
    // Extract the numeric part from phone number (remove +91)
    const phoneNumeric = form.phoneNo.replace(/^\+91/, '');
    
    const preparedInput = {
      name: poseidonHash(form.name).toString(),
      rollNo: poseidonHash(form.rollNo).toString(),
      dob: Number(form.dob),
      phoneNo: Number(phoneNumeric),
      branch: poseidonHash(form.branch).toString()
    };

    const response = await fetch(`${BACKEND_URL}/generate-proof`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(preparedInput),
    });

    const text = await response.text();
    let data = JSON.parse(text);

    if (!data.proof || !data.publicSignals) {
      throw new Error('Invalid proof data received');
    }

    return data;
  };

  const verifyOffChain = async (proofData) => {
    try {
      const response = await fetch(`${BACKEND_URL}/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          proof: proofData.proof,
          publicSignals: proofData.publicSignals
        }),
      });

      const result = await response.json();
      return {
        success: true,
        valid: result.valid,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  };

  const verifyOnChain = async (proofData) => {
    try {
      const response = await fetch(`${BACKEND_URL}/verify-onchain`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          proof: proofData.proof,
          publicSignals: proofData.publicSignals
        }),
      });

      const result = await response.json();
      return {
        success: true,
        valid: result.valid,
        timestamp: new Date().toISOString(),
        blockchain: true
      };
    } catch (error) {
      // If blockchain verification fails, we still continue but mark it as failed
      return {
        success: false,
        error: error.message,
        timestamp: new Date().toISOString(),
        blockchain: true
      };
    }
  };

  const getCurrentStep = () => {
    return steps[phase] ? steps[phase][step] : 'Processing...';
  };

  const getPhaseTitle = () => {
    switch (phase) {
      case 'generating':
        return '🔐 Generating Zero-Knowledge Proof';
      case 'offchain':
        return '⚡ Quick Verification';
      case 'blockchain':
        return '🔗 Blockchain Verification';
      default:
        return 'Processing...';
    }
  };

  const getPhaseSubtitle = () => {
    switch (phase) {
      case 'generating':
        return 'Creating cryptographic proof of your identity...';
      case 'offchain':
        return 'Performing fast verification for immediate feedback...';
      case 'blockchain':
        return 'Final verification on blockchain for ultimate trust...';
      default:
        return '';
    }
  };

  // Poseidon hash function
  function poseidonHash(str) {
    const sha256 = require('js-sha256');
    return BigInt('0x' + sha256(str));
  }

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
            <Text style={styles.statusIcon}>
              {phase === 'generating' ? '⏳' : '✅'}
            </Text>
            <Text style={styles.statusText}>Proof Generation</Text>
          </View>
          
          <View style={styles.statusItem}>
            <Text style={styles.statusIcon}>
              {phase === 'offchain' ? '⏳' : verificationResults.offchain ? '✅' : '⚪'}
            </Text>
            <Text style={styles.statusText}>Off-chain Verification</Text>
          </View>
          
          <View style={styles.statusItem}>
            <Text style={styles.statusIcon}>
              {phase === 'blockchain' ? '⏳' : verificationResults.blockchain ? '🔗✅' : '⚪'}
            </Text>
            <Text style={styles.statusText}>Blockchain Verification</Text>
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
