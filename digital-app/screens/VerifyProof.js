import React, { useState } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  TouchableOpacity, 
  ActivityIndicator,
  ScrollView,
  Alert 
} from 'react-native';
import { BACKEND_URL } from '../environment';

export default function VerifyProof({ route, navigation }) {
  const { proof, publicSignals, revealedDetails, privacySettings, generatedAt, proofType } = route.params || {};
  const [result, setResult] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [verificationPhase, setVerificationPhase] = useState('ready'); // 'ready', 'offchain', 'blockchain', 'complete'
  const [verificationResults, setVerificationResults] = useState({
    offchain: null,
    blockchain: null
  });

  if (!proof || !publicSignals) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorIcon}>❌</Text>
        <Text style={styles.errorTitle}>Missing Proof Data</Text>
        <Text style={styles.errorText}>Please go back and try again.</Text>
        <TouchableOpacity 
          style={styles.button} 
          onPress={() => navigation.goBack()}
        >
          <Text style={styles.buttonText}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const handleVerify = async () => {
    setIsLoading(true);
    setResult(null);
    setVerificationResults({ offchain: null, blockchain: null });
    
    try {
      // Phase 1: Off-chain Verification
      setVerificationPhase('offchain');
      const offchainResult = await verifyOffChain();
      setVerificationResults(prev => ({ ...prev, offchain: offchainResult }));

      // Phase 2: Blockchain Verification
      setVerificationPhase('blockchain');
      const blockchainResult = await verifyOnChain();
      setVerificationResults(prev => ({ ...prev, blockchain: blockchainResult }));

      // Set final result
      setVerificationPhase('complete');
      const finalResult = {
        offchain: offchainResult,
        blockchain: blockchainResult,
        overallValid: offchainResult.valid && blockchainResult.valid
      };
      setResult(finalResult);

    } catch (err) {
      setResult({ error: err.message });
      Alert.alert('Verification Failed', err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const verifyOffChain = async () => {
    const response = await fetch(`${BACKEND_URL}/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ proof, publicSignals }),
    });
    
    if (!response.ok) {
      throw new Error(`Off-chain verification failed: ${response.status}`);
    }
    
    const data = await response.json();
    return {
      valid: data.valid,
      timestamp: new Date().toISOString(),
      method: 'off-chain'
    };
  };

  const verifyOnChain = async () => {
    const response = await fetch(`${BACKEND_URL}/verify-onchain`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ proof, publicSignals }),
    });
    
    if (!response.ok) {
      throw new Error(`Blockchain verification failed: ${response.status}`);
    }
    
    const data = await response.json();
    return {
      valid: data.valid,
      timestamp: new Date().toISOString(),
      method: 'blockchain'
    };
  };

  const handleStartOver = () => {
    navigation.reset({
      index: 0,
      routes: [{ name: 'IdentityForm' }],
    });
  };

  const handleGoBack = () => {
    navigation.goBack();
  };

  const renderDetailBadge = () => {
    if (result && result.overallValid) {
      return <Text style={styles.validatedBadge}>✅ Validated</Text>;
    } else if (result && !result.overallValid) {
      return <Text style={styles.invalidBadge}>❌ Invalid</Text>;
    } else {
      return <Text style={styles.pendingBadge}>📋 Pending Validation</Text>;
    }
  };

  const renderResult = () => {
    if (result === null) return null;

    // Handle error case
    if (result.error) {
      return (
        <View style={styles.resultContainer}>
          <Text style={styles.errorResultIcon}>⚠️</Text>
          <Text style={styles.errorResultTitle}>Verification Failed</Text>
          <Text style={styles.errorResultText}>{result.error}</Text>
          
          <View style={styles.errorDetails}>
            <Text style={styles.errorDetailsTitle}>🔍 What This Means:</Text>
            <Text style={styles.errorDetailsItem}>
              • The cryptographic proof could not be validated
            </Text>
            <Text style={styles.errorDetailsItem}>
              • This may indicate tampered or invalid proof data
            </Text>
            <Text style={styles.errorDetailsItem}>
              • The identity claims cannot be trusted
            </Text>
            <Text style={styles.errorDetailsItem}>
              • Verification networks may be experiencing issues
            </Text>
          </View>

          <View style={styles.securityWarning}>
            <Text style={styles.securityWarningText}>
              🚨 Security Alert: Do not trust this proof until verification succeeds
            </Text>
          </View>
        </View>
      );
    }

    // Handle dual verification results
    if (result.offchain && result.blockchain) {
      const isFullyValid = result.overallValid;
      const offchainValid = result.offchain.valid;
      const blockchainValid = result.blockchain.valid;

      return (
        <View style={styles.resultContainer}>
          <Text style={styles.successResultIcon}>
            {isFullyValid ? '🔗✅' : (offchainValid || blockchainValid) ? '⚠️' : '❌'}
          </Text>
          <Text style={styles.successResultTitle}>
            {isFullyValid ? 'Fully Verified!' : 'Partial Verification'}
          </Text>
          <Text style={styles.successResultText}>
            {isFullyValid 
              ? `The proof has been verified through both off-chain cryptography and blockchain validation. This confirms the holder is a valid student with authentic academic credentials through zero-knowledge verification.${revealedDetails ? ' The shared details below have been cryptographically verified.' : ''}`
              : 'Some verification steps completed, but not all methods confirmed validity.'
            }
          </Text>
          
          {/* What was verified */}
          {isFullyValid && (
            <View style={styles.verificationSummary}>
              <Text style={styles.summaryTitle}>✅ Verified Claims:</Text>
              <Text style={styles.summaryItem}>🎓 Valid student status</Text>
              <Text style={styles.summaryItem}>📋 Authentic roll number</Text>
              <Text style={styles.summaryItem}>🏫 Valid department/branch</Text>
              <Text style={styles.summaryItem}>📱 Verified contact details</Text>
              <Text style={styles.summaryItem}>🆔 Consistent identity hash</Text>
            </View>
          )}
          
          {/* Verification Breakdown */}
          <View style={styles.verificationBreakdown}>
            <Text style={styles.detailTitle}>Verification Results:</Text>
            
            <View style={styles.verificationMethod}>
              <Text style={styles.methodIcon}>⚡</Text>
              <View style={styles.methodDetails}>
                <Text style={styles.methodName}>Off-chain Verification</Text>
                <Text style={[
                  styles.methodStatus,
                  offchainValid ? styles.successStatus : styles.errorStatus
                ]}>
                  {offchainValid ? '✅ Valid' : '❌ Invalid'}
                </Text>
              </View>
            </View>

            <View style={styles.verificationMethod}>
              <Text style={styles.methodIcon}>🔗</Text>
              <View style={styles.methodDetails}>
                <Text style={styles.methodName}>Blockchain Verification</Text>
                <Text style={[
                  styles.methodStatus,
                  blockchainValid ? styles.blockchainSuccessStatus : styles.errorStatus
                ]}>
                  {blockchainValid ? '🔗✅ Verified on-chain' : '❌ Invalid'}
                </Text>
              </View>
            </View>

            <View style={styles.trustLevel}>
              <Text style={styles.trustText}>
                🏆 Trust Level: {isFullyValid ? 'Maximum (Blockchain + Crypto)' : 
                  blockchainValid ? 'High (Blockchain Only)' : 
                  offchainValid ? 'Medium (Crypto Only)' : 'None - Invalid Proof'}
              </Text>
            </View>

            {/* Warning for partial verification */}
            {!isFullyValid && (offchainValid || blockchainValid) && (
              <View style={styles.partialWarning}>
                <Text style={styles.partialWarningText}>
                  ⚠️ Partial Verification: Only some validation methods succeeded. Use caution when trusting this proof.
                </Text>
              </View>
            )}

            {/* Critical warning when both fail */}
            {!offchainValid && !blockchainValid && (
              <View style={styles.criticalWarning}>
                <Text style={styles.criticalWarningText}>
                  🚨 Critical: Both verification methods failed. This proof should not be trusted.
                </Text>
              </View>
            )}
          </View>
        </View>
      );
    }

    // Legacy single verification (fallback)
    if (typeof result === 'boolean') {
      return (
        <View style={styles.resultContainer}>
          <Text style={styles.successResultIcon}>{result ? '✅' : '❌'}</Text>
          <Text style={styles.successResultTitle}>
            {result ? 'Proof Verified!' : 'Invalid Proof'}
          </Text>
          <Text style={styles.successResultText}>
            {result 
              ? 'The zero-knowledge proof is valid. The identity has been verified without revealing any personal information.'
              : 'The proof could not be verified. This may indicate tampered data or an invalid proof.'
            }
          </Text>
        </View>
      );
    }

    return null;
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Text style={styles.headerIcon}>�</Text>
        <Text style={styles.title}>Proof Details</Text>
        <Text style={styles.subtitle}>
          Review the shared information and validate the authenticity of this zero-knowledge proof.
        </Text>
      </View>

        {/* Shared Identity Details with Privacy Context */}
        {revealedDetails && Object.keys(revealedDetails).length > 0 ? (
          <View style={styles.identityDetails}>
            <Text style={styles.identityTitle}>� Shared Identity Information</Text>
            <Text style={styles.identitySubtitle}>
              The following details have been voluntarily shared by the student:
            </Text>
            
            {revealedDetails.name && (
              <View style={styles.identityItem}>
                <Text style={styles.identityLabel}>Full Name:</Text>
                <Text style={styles.identityValue}>{revealedDetails.name}</Text>
                {renderDetailBadge()}
              </View>
            )}
            
            {revealedDetails.rollNo && (
              <View style={styles.identityItem}>
                <Text style={styles.identityLabel}>Roll Number:</Text>
                <Text style={styles.identityValue}>{revealedDetails.rollNo}</Text>
                {renderDetailBadge()}
              </View>
            )}
            
            {revealedDetails.branch && (
              <View style={styles.identityItem}>
                <Text style={styles.identityLabel}>Branch/Department:</Text>
                <Text style={styles.identityValue}>{revealedDetails.branch}</Text>
                {renderDetailBadge()}
              </View>
            )}
            
            {revealedDetails.dob && (
              <View style={styles.identityItem}>
                <Text style={styles.identityLabel}>Date of Birth:</Text>
                <Text style={styles.identityValue}>{revealedDetails.dob}</Text>
                {renderDetailBadge()}
              </View>
            )}
            
            {revealedDetails.phoneNo && (
              <View style={styles.identityItem}>
                <Text style={styles.identityLabel}>Phone Number:</Text>
                <Text style={styles.identityValue}>{revealedDetails.phoneNo}</Text>
                {renderDetailBadge()}
              </View>
            )}

            {/* Privacy Context */}
            {privacySettings && (
              <View style={styles.privacyContext}>
                <Text style={styles.privacyContextTitle}>🔒 Privacy Settings</Text>
                <Text style={styles.privacyContextText}>
                  Additional information that was verified but not shared:
                </Text>
                
                {Object.entries(privacySettings).map(([field, isShared]) => {
                  if (!isShared && !revealedDetails[field]) {
                    const fieldNames = {
                      name: 'Full Name',
                      rollNo: 'Roll Number', 
                      branch: 'Branch/Department',
                      dob: 'Date of Birth',
                      phoneNo: 'Phone Number'
                    };
                    return (
                      <View key={field} style={styles.hiddenItem}>
                        <Text style={styles.hiddenIcon}>🔒</Text>
                        <Text style={styles.hiddenLabel}>{fieldNames[field]} - Verified but hidden</Text>
                      </View>
                    );
                  }
                  return null;
                }).filter(Boolean)}
              </View>
            )}

            <View style={styles.verificationNotice}>
              <Text style={styles.verificationNoticeText}>
                �️ <Text style={styles.boldText}>Zero-Knowledge Privacy:</Text> No actual personal data was transmitted. 
                The cryptographic proof mathematically confirms the authenticity of all information without revealing it. 
                This provides the highest level of privacy protection.
              </Text>
            </View>
          </View>
        ) : (
          <View style={styles.noDetailsContainer}>
            <Text style={styles.noDetailsIcon}>🔒</Text>
            <Text style={styles.noDetailsTitle}>Maximum Privacy Mode</Text>
            <Text style={styles.noDetailsText}>
              The proof holder has chosen not to reveal any personal information. However, the cryptographic verification below will confirm their valid student status and authentic credentials.
            </Text>
            <View style={styles.privacyBenefit}>
              <Text style={styles.privacyBenefitText}>
                🛡️ Maximum Privacy: Identity verified without exposing personal data
              </Text>
            </View>
          </View>
        )}

        <View style={styles.proofInfo}>
        <Text style={styles.proofInfoTitle}>Proof Information</Text>
        <View style={styles.proofInfoItem}>
          <Text style={styles.proofInfoLabel}>Public Signals:</Text>
          <Text style={styles.proofInfoValue}>
            {publicSignals ? `${publicSignals.length} signal(s)` : 'None'}
          </Text>
        </View>
        <View style={styles.proofInfoItem}>
          <Text style={styles.proofInfoLabel}>Proof Size:</Text>
          <Text style={styles.proofInfoValue}>
            {JSON.stringify(proof).length} characters
          </Text>
        </View>
        {generatedAt && (
          <View style={styles.proofInfoItem}>
            <Text style={styles.proofInfoLabel}>Generated:</Text>
            <Text style={styles.proofInfoValue}>
              {new Date(generatedAt).toLocaleString()}
            </Text>
          </View>
        )}
        {proofType && (
          <View style={styles.proofInfoItem}>
            <Text style={styles.proofInfoLabel}>Proof Type:</Text>
            <Text style={styles.proofInfoValue}>
              {proofType === 'student-identity' ? '🎓 Student Identity' : proofType}
            </Text>
          </View>
        )}
        
        {/* What this proof verifies */}
        <View style={styles.proofCapabilities}>
          <Text style={styles.capabilitiesTitle}>🎓 The below proof verifies:</Text>
          <Text style={styles.capabilityItem}>• Valid student identity</Text>
          <Text style={styles.capabilityItem}>• Authentic personal details (name, roll number)</Text>
          <Text style={styles.capabilityItem}>• Valid academic information (branch/department)</Text>
          <Text style={styles.capabilityItem}>• Verified contact information</Text>
          <Text style={styles.capabilityNote}>
            ℹ️ The actual details remain private and are not revealed during verification unless explicitly shared above
          </Text>
        </View>
      </View>

      <View style={styles.actionContainer}>
        <TouchableOpacity 
          style={[styles.verifyButton, isLoading && styles.disabledButton]} 
          onPress={handleVerify}
          disabled={isLoading}
        >
          {isLoading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator color="#ffffff" size="small" />
              <Text style={styles.verifyButtonText}>
                {verificationPhase === 'offchain' ? 'Validating off-chain...' :
                 verificationPhase === 'blockchain' ? 'Validating on blockchain...' :
                 'Validating authenticity...'}
              </Text>
            </View>
          ) : (
            <Text style={styles.verifyButtonText}>🔍 Validate Proof Authenticity</Text>
          )}
        </TouchableOpacity>

        {/* Verification Status Indicators */}
        {isLoading && (
          <View style={styles.verificationStatusContainer}>
            <View style={styles.statusItem}>
              <Text style={styles.statusIcon}>
                {verificationPhase === 'offchain' ? '⏳' : verificationResults.offchain ? '✅' : '⚪'}
              </Text>
              <Text style={styles.statusText}>Off-chain Verification</Text>
            </View>
            
            <View style={styles.statusItem}>
              <Text style={styles.statusIcon}>
                {verificationPhase === 'blockchain' ? '⏳' : verificationResults.blockchain ? '🔗✅' : '⚪'}
              </Text>
              <Text style={styles.statusText}>Blockchain Verification</Text>
            </View>
          </View>
        )}
      </View>

      {renderResult()}

      <View style={styles.navigationContainer}>
        <TouchableOpacity style={styles.secondaryButton} onPress={handleGoBack}>
          <Text style={styles.secondaryButtonText}>← Back to Proof</Text>
        </TouchableOpacity>
        
        <TouchableOpacity style={styles.startOverButton} onPress={handleStartOver}>
          <Text style={styles.startOverButtonText}>🏠 Start Over</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  content: {
    padding: 20,
  },
  header: {
    alignItems: 'center',
    marginBottom: 30,
  },
  identityDetails: {
    backgroundColor: '#f0fdf4',
    borderRadius: 12,
    padding: 20,
    marginBottom: 24,
    borderWidth: 2,
    borderColor: '#bbf7d0',
  },
  identityTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#166534',
    marginBottom: 16,
    textAlign: 'center',
  },
  identityItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: '#ffffff',
    borderRadius: 8,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#d1fae5',
  },
  identityLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#166534',
    flex: 1,
  },
  identityValue: {
    fontSize: 14,
    color: '#166534',
    fontWeight: 'bold',
    flex: 2,
    textAlign: 'right',
  },
  privacyNotice: {
    backgroundColor: '#eff6ff',
    padding: 12,
    borderRadius: 8,
    marginTop: 12,
    borderWidth: 1,
    borderColor: '#bfdbfe',
  },
  privacyNoticeText: {
    fontSize: 12,
    color: '#1e40af',
    textAlign: 'center',
    lineHeight: 16,
  },
  noDetailsContainer: {
    backgroundColor: '#fef7ff',
    borderRadius: 12,
    padding: 20,
    marginBottom: 24,
    borderWidth: 2,
    borderColor: '#e879f9',
    alignItems: 'center',
  },
  noDetailsIcon: {
    fontSize: 40,
    marginBottom: 12,
  },
  noDetailsTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#a21caf',
    marginBottom: 12,
    textAlign: 'center',
  },
  noDetailsText: {
    fontSize: 14,
    color: '#a21caf',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 12,
  },
  privacyBenefit: {
    backgroundColor: '#f3e8ff',
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#d8b4fe',
  },
  privacyBenefitText: {
    fontSize: 12,
    color: '#7c3aed',
    fontWeight: '600',
    textAlign: 'center',
  },
  headerIcon: {
    fontSize: 50,
    marginBottom: 12,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1e293b',
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 16,
    color: '#64748b',
    textAlign: 'center',
    lineHeight: 22,
  },
  proofInfo: {
    backgroundColor: '#ffffff',
    padding: 20,
    borderRadius: 12,
    marginBottom: 30,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  proofInfoTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1e293b',
    marginBottom: 16,
  },
  proofInfoItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  proofInfoLabel: {
    fontSize: 14,
    color: '#64748b',
    fontWeight: '500',
  },
  proofInfoValue: {
    fontSize: 14,
    color: '#1e293b',
    fontWeight: '600',
  },
  proofCapabilities: {
    marginTop: 16,
    padding: 16,
    backgroundColor: '#f0f9ff',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#bae6fd',
  },
  capabilitiesTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#0369a1',
    marginBottom: 8,
  },
  capabilityItem: {
    fontSize: 13,
    color: '#0369a1',
    marginBottom: 4,
    lineHeight: 18,
  },
  capabilityNote: {
    fontSize: 12,
    color: '#0369a1',
    fontStyle: 'italic',
    marginTop: 8,
    lineHeight: 16,
  },
  actionContainer: {
    marginBottom: 30,
  },
  verifyButton: {
    backgroundColor: '#3b82f6',
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 12,
    alignItems: 'center',
  },
  disabledButton: {
    backgroundColor: '#94a3b8',
  },
  loadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  verifyButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
  resultContainer: {
    backgroundColor: '#ffffff',
    padding: 24,
    borderRadius: 12,
    marginBottom: 30,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  successResultIcon: {
    fontSize: 50,
    marginBottom: 16,
  },
  successResultTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#059669',
    marginBottom: 12,
    textAlign: 'center',
  },
  successResultText: {
    fontSize: 16,
    color: '#64748b',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 20,
  },
  errorResultIcon: {
    fontSize: 50,
    marginBottom: 16,
  },
  errorResultTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#dc2626',
    marginBottom: 12,
    textAlign: 'center',
  },
  errorResultText: {
    fontSize: 16,
    color: '#64748b',
    textAlign: 'center',
    lineHeight: 22,
  },
  verificationDetails: {
    alignSelf: 'stretch',
    backgroundColor: '#f0fdf4',
    padding: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#bbf7d0',
  },
  detailTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#166534',
    marginBottom: 8,
  },
  detailItem: {
    fontSize: 14,
    color: '#166534',
    marginBottom: 4,
  },
  navigationContainer: {
    gap: 12,
  },
  secondaryButton: {
    backgroundColor: '#ffffff',
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#e2e8f0',
  },
  secondaryButtonText: {
    color: '#64748b',
    fontSize: 16,
    fontWeight: '600',
  },
  startOverButton: {
    backgroundColor: '#f1f5f9',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#cbd5e1',
  },
  startOverButtonText: {
    color: '#64748b',
    fontSize: 14,
    fontWeight: '600',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
    padding: 20,
  },
  errorIcon: {
    fontSize: 60,
    marginBottom: 20,
  },
  errorTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#dc2626',
    marginBottom: 12,
  },
  errorText: {
    fontSize: 16,
    color: '#64748b',
    textAlign: 'center',
    marginBottom: 30,
  },
  button: {
    backgroundColor: '#3b82f6',
    paddingVertical: 16,
    paddingHorizontal: 32,
    borderRadius: 12,
  },
  buttonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
  // New dual verification styles
  verificationStatusContainer: {
    marginTop: 16,
    gap: 8,
  },
  statusItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
    padding: 10,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  statusIcon: {
    fontSize: 16,
    marginRight: 10,
    width: 24,
    textAlign: 'center',
  },
  statusText: {
    fontSize: 12,
    color: '#374151',
    fontWeight: '500',
    flex: 1,
  },
  verificationBreakdown: {
    marginTop: 16,
  },
  verificationSummary: {
    marginTop: 16,
    padding: 20,
    backgroundColor: '#f0fdf4',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#bbf7d0',
    width: '100%',
    minHeight: 140,
  },
  summaryTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#166534',
    marginBottom: 12,
  },
  summaryItem: {
    fontSize: 14,
    color: '#166534',
    marginBottom: 6,
    lineHeight: 20,
  },
  verificationMethod: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    padding: 12,
    backgroundColor: '#f8fafc',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  methodIcon: {
    fontSize: 20,
    marginRight: 12,
    width: 32,
    textAlign: 'center',
  },
  methodDetails: {
    flex: 1,
  },
  methodName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 2,
  },
  methodStatus: {
    fontSize: 12,
    fontWeight: '500',
  },
  successStatus: {
    color: '#10b981',
  },
  blockchainSuccessStatus: {
    color: '#3b82f6',
    fontWeight: '600',
  },
  errorStatus: {
    color: '#ef4444',
  },
  trustLevel: {
    backgroundColor: '#eff6ff',
    padding: 12,
    borderRadius: 8,
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#bfdbfe',
  },
  trustText: {
    fontSize: 13,
    color: '#1e40af',
    fontWeight: '600',
    textAlign: 'center',
  },
  errorDetails: {
    backgroundColor: '#fef2f2',
    padding: 16,
    borderRadius: 8,
    marginTop: 16,
    borderWidth: 1,
    borderColor: '#fecaca',
    width: '100%',
  },
  errorDetailsTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#dc2626',
    marginBottom: 8,
  },
  errorDetailsItem: {
    fontSize: 12,
    color: '#dc2626',
    marginBottom: 4,
    lineHeight: 16,
  },
  securityWarning: {
    backgroundColor: '#fef3c7',
    padding: 12,
    borderRadius: 8,
    marginTop: 12,
    borderWidth: 2,
    borderColor: '#f59e0b',
    width: '100%',
  },
  securityWarningText: {
    fontSize: 12,
    color: '#92400e',
    fontWeight: '600',
    textAlign: 'center',
  },
  partialWarning: {
    backgroundColor: '#fff7ed',
    padding: 12,
    borderRadius: 8,
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#fed7aa',
  },
  partialWarningText: {
    fontSize: 12,
    color: '#9a3412',
    fontWeight: '500',
    textAlign: 'center',
  },
  criticalWarning: {
    backgroundColor: '#fef2f2',
    padding: 12,
    borderRadius: 8,
    marginTop: 8,
    borderWidth: 2,
    borderColor: '#fca5a5',
  },
  criticalWarningText: {
    fontSize: 12,
    color: '#dc2626',
    fontWeight: '600',
    textAlign: 'center',
  },
  // New privacy-focused styles
  privacyDetails: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 20,
    marginBottom: 20,
    borderWidth: 2,
    borderColor: '#10b981',
  },
  privacyTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#065f46',
    marginBottom: 16,
    textAlign: 'center',
  },
  verificationSummary: {
    backgroundColor: '#ecfdf5',
    padding: 16,
    borderRadius: 8,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#a7f3d0',
  },
  verificationSummaryText: {
    fontSize: 14,
    color: '#065f46',
    lineHeight: 18,
    textAlign: 'center',
    fontWeight: '500',
  },
  privacyConsentTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 4,
  },
  privacyConsentSubtitle: {
    fontSize: 12,
    color: '#6b7280',
    marginBottom: 12,
    lineHeight: 16,
  },
  consentItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: '#f0f9ff',
    borderRadius: 6,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: '#bae6fd',
  },
  consentIcon: {
    fontSize: 16,
    marginRight: 10,
  },
  consentLabel: {
    fontSize: 14,
    color: '#0c4a6e',
    fontWeight: '500',
    flex: 1,
  },
  zkPrivacyNotice: {
    backgroundColor: '#eff6ff',
    padding: 14,
    borderRadius: 8,
    marginTop: 16,
    borderWidth: 2,
    borderColor: '#3b82f6',
  },
  zkPrivacyNoticeText: {
    fontSize: 12,
    color: '#1e40af',
    lineHeight: 16,
    textAlign: 'center',
  },
  boldText: {
    fontWeight: '700',
  },
  // Updated identity details styles
  identityDetails: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 20,
    marginBottom: 20,
    borderWidth: 2,
    borderColor: '#10b981',
  },
  identityTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#065f46',
    marginBottom: 8,
    textAlign: 'center',
  },
  identitySubtitle: {
    fontSize: 14,
    color: '#6b7280',
    marginBottom: 16,
    textAlign: 'center',
    lineHeight: 18,
  },
  identityItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 12,
    backgroundColor: '#f0f9ff',
    borderRadius: 8,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#bae6fd',
    minHeight: 50,
  },
  identityLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
    width: 110,
    flexShrink: 0,
  },
  identityValue: {
    fontSize: 14,
    color: '#1f2937',
    flex: 1,
    fontWeight: '500',
    marginRight: 8,
    flexWrap: 'wrap',
  },
  verifiedBadge: {
    fontSize: 12,
    color: '#059669',
    fontWeight: '600',
    backgroundColor: '#ecfdf5',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#a7f3d0',
  },
  pendingBadge: {
    fontSize: 12,
    color: '#92400e',
    fontWeight: '600',
    backgroundColor: '#fef3c7',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#fbbf24',
  },
  validatedBadge: {
    fontSize: 12,
    color: '#059669',
    fontWeight: '600',
    backgroundColor: '#ecfdf5',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#a7f3d0',
  },
  invalidBadge: {
    fontSize: 12,
    color: '#dc2626',
    fontWeight: '600',
    backgroundColor: '#fef2f2',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#fca5a5',
  },
  privacyContext: {
    backgroundColor: '#f9fafb',
    padding: 16,
    borderRadius: 8,
    marginTop: 16,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  privacyContextTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6b7280',
    marginBottom: 8,
  },
  privacyContextText: {
    fontSize: 12,
    color: '#6b7280',
    marginBottom: 12,
    lineHeight: 16,
  },
  hiddenItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 8,
    backgroundColor: '#f3f4f6',
    borderRadius: 6,
    marginBottom: 4,
  },
  hiddenIcon: {
    fontSize: 14,
    marginRight: 8,
  },
  hiddenLabel: {
    fontSize: 12,
    color: '#6b7280',
    fontStyle: 'italic',
  },
  verificationNotice: {
    backgroundColor: '#eff6ff',
    padding: 14,
    borderRadius: 8,
    marginTop: 16,
    borderWidth: 1,
    borderColor: '#bfdbfe',
  },
  verificationNoticeText: {
    fontSize: 12,
    color: '#1e40af',
    lineHeight: 16,
    textAlign: 'center',
  },
});
