import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
  Alert,
} from 'react-native';
import { BACKEND_URL, BLOCKCHAIN_CONFIG } from '../environment';
import { MetaMaskSDK } from '@metamask/sdk-react-native';
import { ethers } from 'ethers';

// Import the contract ABI
const verifierAbi = require('../contracts/Groth16Verifier.json').abi;

// Initialize MetaMask SDK with more conservative settings
let MMSDK = null;
try {
  MMSDK = new MetaMaskSDK({
    dappMetadata: {
      name: 'ZKP Identity Verifier',
      url: 'zkp-identity-app',
    },
    enableDebug: false,
  });
} catch (error) {
  console.warn('MetaMask SDK initialization failed:', error);
}

export default function VerifyProof({ route, navigation }) {
  const { proof, publicSignals, revealedDetails, privacySettings, generatedAt, proofType } = route.params || {};
  const [result, setResult] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [verificationType, setVerificationType] = useState(null); // 'quick', 'blockchain', 'trustless'
  const [metamaskConnected, setMetamaskConnected] = useState(false);
  const [metamaskAccount, setMetamaskAccount] = useState(null);

  // Defensive check for missing proof data
  if (!proof || !publicSignals) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorIcon}>❌</Text>
        <Text style={styles.errorTitle}>Missing Proof Data</Text>
        <Text style={styles.errorText}>Please go back and try again.</Text>
        <TouchableOpacity style={styles.button} onPress={() => navigation.goBack()}>
          <Text style={styles.buttonText}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // Quick Verify (Off-chain)
  const handleQuickVerify = async () => {
    setIsLoading(true);
    setVerificationType('quick');
    setResult(null);

    try {
      const response = await fetch(`${BACKEND_URL}/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ proof, publicSignals }),
      });

      if (!response.ok) {
        throw new Error(`Off-chain verification failed: ${response.status}`);
      }

      const data = await response.json();
      setResult({
        valid: data.valid,
        method: 'Off-chain',
        description: 'Cryptographic verification using server',
        timestamp: new Date().toISOString(),
        trustLevel: 'Server Trust Required',
      });
    } catch (err) {
      setResult({ error: err.message, method: 'Off-chain' });
      Alert.alert('Verification Failed', err.message);
    } finally {
      setIsLoading(false);
    }
  };

  // Blockchain Verify (Backend calls contract)
  const handleBlockchainVerify = async () => {
    setIsLoading(true);
    setVerificationType('blockchain');
    setResult(null);

    try {
      const response = await fetch(`${BACKEND_URL}/verify-onchain`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ proof, publicSignals }),
      });

      if (!response.ok) {
        throw new Error(`Blockchain verification failed: ${response.status}`);
      }

      const data = await response.json();
      setResult({
        valid: data.valid,
        method: 'Blockchain (via Server)',
        description: 'Smart contract verification on blockchain',
        timestamp: new Date().toISOString(),
        trustLevel: 'Server + Blockchain Consensus',
      });
    } catch (err) {
      setResult({ error: err.message, method: 'Blockchain' });
      Alert.alert('Verification Failed', err.message);
    } finally {
      setIsLoading(false);
    }
  };

  // Connect MetaMask wallet
  const connectMetaMask = async () => {
    try {
      setIsLoading(true);
      
      if (!MMSDK) {
        throw new Error('MetaMask SDK not available');
      }
      
      const ethereum = MMSDK.getProvider();

      // Request account access
      const accounts = await ethereum.request({ method: 'eth_requestAccounts' });

      if (accounts.length > 0) {
        setMetamaskAccount(accounts[0]);
        setMetamaskConnected(true);

        // Switch to or add the local network
        try {
          await ethereum.request({
            method: 'wallet_switchEthereumChain',
            params: [{ chainId: `0x${BLOCKCHAIN_CONFIG.CHAIN_ID.toString(16)}` }],
          });
        } catch (switchError) {
          // Chain not added, add it
          if (switchError.code === 4902) {
            await ethereum.request({
              method: 'wallet_addEthereumChain',
              params: [
                {
                  chainId: `0x${BLOCKCHAIN_CONFIG.CHAIN_ID.toString(16)}`,
                  chainName: BLOCKCHAIN_CONFIG.NETWORK_NAME,
                  rpcUrls: [BLOCKCHAIN_CONFIG.RPC_URL],
                  nativeCurrency: {
                    name: BLOCKCHAIN_CONFIG.CURRENCY_SYMBOL,
                    symbol: BLOCKCHAIN_CONFIG.CURRENCY_SYMBOL,
                    decimals: 18,
                  },
                },
              ],
            });
          }
        }

        Alert.alert('Connected!', `Connected to ${accounts[0].substring(0, 8)}...`);
      }
    } catch (error) {
      Alert.alert('Connection Failed', error.message);
    } finally {
      setIsLoading(false);
    }
  };

  // Trustless Verify (Direct MetaMask interaction)
  const handleTrustlessVerify = async () => {
    if (!metamaskConnected) {
      Alert.alert('Connect Wallet', 'Please connect MetaMask first');
      return;
    }

    if (!MMSDK) {
      Alert.alert('Error', 'MetaMask SDK not available');
      return;
    }

    setIsLoading(true);
    setVerificationType('trustless');
    setResult(null);

    try {
      const ethereum = MMSDK.getProvider();
      const provider = new ethers.BrowserProvider(ethereum);

      // Create contract instance
      const contract = new ethers.Contract(BLOCKCHAIN_CONFIG.VERIFIER_CONTRACT, verifierAbi, provider);

      // Format proof for Solidity
      const pA = [proof.pi_a[0], proof.pi_a[1]];
      const pB = [
        [proof.pi_b[0][1], proof.pi_b[0][0]],
        [proof.pi_b[1][1], proof.pi_b[1][0]],
      ];
      const pC = [proof.pi_c[0], proof.pi_c[1]];

      // Call contract directly
      const isValid = await contract.verifyProof(pA, pB, pC, publicSignals);

      setResult({
        valid: isValid,
        method: 'Trustless (Direct)',
        description: 'Direct smart contract call via your wallet',
        timestamp: new Date().toISOString(),
        trustLevel: 'Zero Trust - Fully Decentralized',
        walletUsed: metamaskAccount,
      });
    } catch (err) {
      setResult({ error: err.message, method: 'Trustless' });
      Alert.alert('Verification Failed', err.message);
    } finally {
      setIsLoading(false);
    }
  };

  // Navigation handlers
  const handleStartOver = () => {
    navigation.reset({
      index: 0,
      routes: [{ name: 'IdentityForm' }],
    });
  };

  const handleGoBack = () => {
    navigation.goBack();
  };

  // Render verification options UI
  const renderVerificationOptions = () => {
    return (
      <View style={styles.optionsContainer}>
        <Text style={styles.optionsTitle}>Choose Verification Method:</Text>

        {/* Quick Verify Option */}
        <TouchableOpacity
          style={[styles.optionCard, styles.quickOption]}
          onPress={handleQuickVerify}
          disabled={isLoading}
        >
          <View style={styles.optionHeader}>
            <Text style={styles.optionIcon}>⚡</Text>
            <Text style={styles.optionTitle}>Quick Verify</Text>
          </View>
          <Text style={styles.optionSubtitle}>Off-chain • Instant</Text>
          <Text style={styles.optionDescription}>Fast cryptographic verification using our server</Text>
          <View style={styles.optionButton}>
            <Text style={styles.optionButtonText}>VERIFY NOW</Text>
          </View>
        </TouchableOpacity>

        {/* Blockchain Verify Option */}
        <TouchableOpacity
          style={[styles.optionCard, styles.blockchainOption]}
          onPress={handleBlockchainVerify}
          disabled={isLoading}
        >
          <View style={styles.optionHeader}>
            <Text style={styles.optionIcon}>🔒</Text>
            <Text style={styles.optionTitle}>Blockchain Verify</Text>
          </View>
          <Text style={styles.optionSubtitle}>On-chain • Secure</Text>
          <Text style={styles.optionDescription}>Smart contract verification on blockchain</Text>
          <View style={styles.optionButton}>
            <Text style={styles.optionButtonText}>VERIFY ON BLOCKCHAIN</Text>
          </View>
        </TouchableOpacity>

        {/* Trustless Verify Option */}
        <TouchableOpacity
          style={[styles.optionCard, styles.trustlessOption]}
          onPress={metamaskConnected ? handleTrustlessVerify : connectMetaMask}
          disabled={isLoading}
        >
          <View style={styles.optionHeader}>
            <Text style={styles.optionIcon}>🌐</Text>
            <Text style={styles.optionTitle}>Trustless Verify</Text>
          </View>
          <Text style={styles.optionSubtitle}>
            {metamaskConnected ? 'Direct • Zero Trust' : 'Connect Wallet Required'}
          </Text>
          <Text style={styles.optionDescription}>
            {metamaskConnected ? 'Direct smart contract call via your wallet' : 'Connect MetaMask to verify trustlessly'}
          </Text>
          {metamaskConnected && (
            <Text style={styles.walletInfo}>Connected: {metamaskAccount?.substring(0, 8)}...</Text>
          )}
          <View style={styles.optionButton}>
            <Text style={styles.optionButtonText}>
              {metamaskConnected ? 'VERIFY TRUSTLESSLY' : 'CONNECT METAMASK'}
            </Text>
          </View>
        </TouchableOpacity>
      </View>
    );
  };

  // Render verification result UI
  const renderResult = () => {
    if (result === null) return null;

    if (result.error) {
      return (
        <View style={styles.resultContainer}>
          <Text style={styles.errorResultIcon}>⚠️</Text>
          <Text style={styles.errorResultTitle}>Verification Failed</Text>
          <Text style={styles.errorResultText}>{result.error}</Text>
          <Text style={styles.methodUsed}>Method: {result.method}</Text>
        </View>
      );
    }

    return (
      <View style={styles.resultContainer}>
        <Text style={result.valid ? styles.successIcon : styles.failIcon}>{result.valid ? '✅' : '❌'}</Text>
        <Text style={styles.resultTitle}>{result.valid ? 'Proof Verified!' : 'Proof Invalid'}</Text>

        <View style={styles.resultDetails}>
          <Text style={styles.methodUsed}>Method: {result.method}</Text>
          <Text style={styles.trustLevel}>Trust Level: {result.trustLevel}</Text>
          <Text style={styles.description}>{result.description}</Text>
          {result.walletUsed && <Text style={styles.walletUsed}>Wallet: {result.walletUsed.substring(0, 8)}...</Text>}
          <Text style={styles.timestamp}>Verified at: {new Date(result.timestamp).toLocaleString()}</Text>
        </View>

        {result.valid && (
          <View style={styles.validationBadge}>
            <Text style={styles.validationText}>Identity Verified ✓</Text>
          </View>
        )}
      </View>
    );
  };

  // Main component render return
  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Text style={styles.headerIcon}>🛡️</Text>
        <Text style={styles.title}>Verify Identity Proof</Text>
        <Text style={styles.subtitle}>
          Review the shared information and validate the authenticity of this zero-knowledge proof.
        </Text>
      </View>

      {/* Proof Information */}
      <View style={styles.proofSection}>
        {revealedDetails && Object.keys(revealedDetails).length > 0 ? (
          <View style={styles.identityDetails}>
            <Text style={styles.identityTitle}>📝 Shared Identity Information</Text>
            <Text style={styles.identitySubtitle}>The following details have been voluntarily shared by the student:</Text>

            {revealedDetails.name && (
              <View style={styles.identityItem}>
                <Text style={styles.identityLabel}>Full Name:</Text>
                <Text style={styles.identityValue}>{revealedDetails.name}</Text>
              </View>
            )}
            {revealedDetails.rollNo && (
              <View style={styles.identityItem}>
                <Text style={styles.identityLabel}>Roll Number:</Text>
                <Text style={styles.identityValue}>{revealedDetails.rollNo}</Text>
              </View>
            )}
            {revealedDetails.branch && (
              <View style={styles.identityItem}>
                <Text style={styles.identityLabel}>Branch/Department:</Text>
                <Text style={styles.identityValue}>{revealedDetails.branch}</Text>
              </View>
            )}
            {revealedDetails.dob && (
              <View style={styles.identityItem}>
                <Text style={styles.identityLabel}>Date of Birth:</Text>
                <Text style={styles.identityValue}>{revealedDetails.dob}</Text>
              </View>
            )}
            {revealedDetails.phoneNo && (
              <View style={styles.identityItem}>
                <Text style={styles.identityLabel}>Phone Number:</Text>
                <Text style={styles.identityValue}>{revealedDetails.phoneNo}</Text>
              </View>
            )}

            {/* Privacy Context */}
            {privacySettings && (
              <View style={styles.privacyContext}>
                <Text style={styles.privacyContextTitle}>🔒 Privacy Settings</Text>
                <Text style={styles.privacyContextText}>Additional information that was verified but not shared:</Text>
                {Object.entries(privacySettings)
                  .map(([field, isShared]) => {
                    if (!isShared && !revealedDetails[field]) {
                      const fieldNames = {
                        name: 'Full Name',
                        rollNo: 'Roll Number',
                        branch: 'Branch/Department',
                        dob: 'Date of Birth',
                        phoneNo: 'Phone Number',
                      };
                      return (
                        <View key={field} style={styles.hiddenItem}>
                          <Text style={styles.hiddenIcon}>🔒</Text>
                          <Text style={styles.hiddenLabel}>{fieldNames[field]} - Verified but hidden</Text>
                        </View>
                      );
                    }
                    return null;
                  })
                  .filter(Boolean)}
              </View>
            )}

            <View style={styles.verificationNotice}>
              <Text style={styles.verificationNoticeText}>
                🛡️{' '}
                <Text style={styles.boldText}>Zero-Knowledge Privacy:</Text> No actual personal data was
                transmitted. The cryptographic proof mathematically confirms the authenticity of all
                information without revealing it. This provides the highest level of privacy protection.
              </Text>
            </View>
          </View>
        ) : (
          <View style={styles.noDetailsContainer}>
            <Text style={styles.noDetailsIcon}>🔒</Text>
            <Text style={styles.noDetailsTitle}>Maximum Privacy Mode</Text>
            <Text style={styles.noDetailsText}>
              The proof holder has chosen not to reveal any personal information. However, the cryptographic
              verification below will confirm their valid student status and authentic credentials.
            </Text>
            <View style={styles.privacyBenefit}>
              <Text style={styles.privacyBenefitText}>🛡️ Maximum Privacy: Identity verified without exposing personal data</Text>
            </View>
          </View>
        )}

        <View style={styles.proofInfoContainer}>
          <Text style={styles.proofInfoText}>Generated: {generatedAt ? new Date(generatedAt).toLocaleString() : 'Unknown'}</Text>
          <Text style={styles.proofInfoText}>Type: {proofType || 'Identity Verification'}</Text>
        </View>
      </View>

      {/* Verification options */}
      {!result && !isLoading && renderVerificationOptions()}

      {/* Loading indicator */}
      {isLoading && (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#007AFF" />
          <Text style={styles.loadingText}>
            {verificationType === 'quick' && 'Performing cryptographic verification...'}
            {verificationType === 'blockchain' && 'Verifying on blockchain...'}
            {verificationType === 'trustless' && 'Calling smart contract...'}
            {!verificationType && 'Processing...'}
          </Text>
        </View>
      )}

      {/* Results */}
      {renderResult()}

      {/* Navigation buttons */}
      <View style={styles.buttonContainer}>
        {result && (
          <TouchableOpacity
            style={[styles.button, styles.secondaryButton]}
            onPress={() => {
              setResult(null);
              setVerificationType(null);
            }}
          >
            <Text style={styles.secondaryButtonText}>Verify Again</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity style={[styles.button, styles.primaryButton]} onPress={handleGoBack}>
          <Text style={styles.buttonText}>Back to Proof</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.button, styles.tertiaryButton]} onPress={handleStartOver}>
          <Text style={styles.tertiaryButtonText}>Generate New Proof</Text>
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
  proofSection: {
    marginBottom: 20,
  },
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
  boldText: {
    fontWeight: '700',
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
  proofInfoContainer: {
    backgroundColor: '#ffffff',
    padding: 15,
    borderRadius: 8,
    marginTop: 15,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  proofInfoText: {
    fontSize: 14,
    color: '#6b7280',
    marginBottom: 5,
  },
  optionsContainer: {
    marginBottom: 20,
  },
  optionsTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1f2937',
    marginBottom: 15,
    textAlign: 'center',
  },
  optionCard: {
    backgroundColor: '#ffffff',
    padding: 20,
    borderRadius: 12,
    marginBottom: 15,
    borderWidth: 2,
  },
  quickOption: {
    borderColor: '#10b981',
  },
  blockchainOption: {
    borderColor: '#3b82f6',
  },
  trustlessOption: {
    borderColor: '#8b5cf6',
  },
  optionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  optionIcon: {
    fontSize: 24,
    marginRight: 10,
  },
  optionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1f2937',
  },
  optionSubtitle: {
    fontSize: 14,
    color: '#6b7280',
    marginBottom: 8,
  },
  optionDescription: {
    fontSize: 14,
    color: '#4b5563',
    marginBottom: 12,
  },
  walletInfo: {
    fontSize: 12,
    color: '#059669',
    marginBottom: 8,
    fontWeight: '500',
  },
  optionButton: {
    backgroundColor: '#f3f4f6',
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  optionButtonText: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#374151',
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
  successIcon: {
    fontSize: 60,
    marginBottom: 16,
    color: '#10b981',
  },
  failIcon: {
    fontSize: 60,
    marginBottom: 16,
    color: '#dc2626',
  },
  errorResultIcon: {
    fontSize: 50,
    marginBottom: 16,
    color: '#dc2626',
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
  resultTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#1f2937',
    marginBottom: 12,
    textAlign: 'center',
  },
  resultDetails: {
    width: '100%',
    marginBottom: 20,
  },
  methodUsed: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 4,
    textAlign: 'center',
  },
  trustLevel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#059669',
    marginBottom: 4,
    textAlign: 'center',
  },
  description: {
    fontSize: 14,
    color: '#475569',
    marginBottom: 4,
    textAlign: 'center',
  },
  walletUsed: {
    fontSize: 12,
    color: '#6b7280',
    fontStyle: 'italic',
    marginBottom: 4,
    textAlign: 'center',
  },
  timestamp: {
    fontSize: 12,
    color: '#64748b',
    textAlign: 'center',
  },
  validationBadge: {
    backgroundColor: '#10b981',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
  },
  validationText: {
    color: '#ffffff',
    fontWeight: '600',
    fontSize: 16,
  },
  loadingContainer: {
    alignItems: 'center',
    padding: 40,
  },
  loadingText: {
    fontSize: 16,
    color: '#6b7280',
    marginTop: 15,
    textAlign: 'center',
  },
  buttonContainer: {
    marginTop: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  button: {
    flex: 1,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginHorizontal: 4,
  },
  primaryButton: {
    backgroundColor: '#3b82f6',
  },
  secondaryButton: {
    backgroundColor: '#f3f4f6',
  },
  tertiaryButton: {
    backgroundColor: '#e0e7ff',
    borderWidth: 1,
    borderColor: '#d1d5db',
  },
  buttonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 16,
  },
  secondaryButtonText: {
    color: '#1e40af',
    fontWeight: '600',
    fontSize: 16,
  },
  tertiaryButtonText: {
    color: '#374151',
    fontWeight: '600',
    fontSize: 16,
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
});
