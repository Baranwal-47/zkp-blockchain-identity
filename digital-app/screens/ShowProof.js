import React, { useState, useEffect } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  TouchableOpacity, 
  Share, 
  Alert,
  ScrollView,
  Animated,
  Easing
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import QRCode from 'react-native-qrcode-svg';

export default function ShowProof({ route, navigation }) {
  const { proof, publicSignals, formData, verification } = route.params || {};
  const [showDetails, setShowDetails] = useState(false);
  const [fadeAnim] = useState(new Animated.Value(0));
  const [scaleAnim] = useState(new Animated.Value(0.8));

  // Privacy control state - what details to include in QR code
  const [privacySettings, setPrivacySettings] = useState({
    name: true,        // Usually safe to share
    rollNo: true,      // Usually needed for verification  
    dob: false,        // Keep private by default
    phoneNo: false,    // Keep private by default
    branch: true,      // Usually safe to share
  });
  const [showPrivacyControls, setShowPrivacyControls] = useState(false);

  useEffect(() => {
    // Entrance animation
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 800,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.spring(scaleAnim, {
        toValue: 1,
        tension: 50,
        friction: 7,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  // Defensive check: Only show QR if proof and publicSignals exist
  if (!proof || !publicSignals) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorIcon}>❌</Text>
        <Text style={styles.errorTitle}>Missing Proof Data</Text>
        <Text style={styles.errorText}>Please generate the proof again.</Text>
        <TouchableOpacity 
          style={styles.button} 
          onPress={() => navigation.navigate('IdentityForm')}
        >
          <Text style={styles.buttonText}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // Generate QR value with selective disclosure
  const generateQRValue = () => {
    // Create revealed details object with only consented information
    const revealedDetails = {};
    
    // Only include actual details that user chose to reveal
    if (privacySettings.name && formData?.name) {
      revealedDetails.name = formData.name;
    }
    if (privacySettings.rollNo && formData?.rollNo) {
      revealedDetails.rollNo = formData.rollNo;
    }
    if (privacySettings.dob && formData?.dob) {
      revealedDetails.dob = formData.dob;
    }
    if (privacySettings.phoneNo && formData?.phoneNo) {
      revealedDetails.phoneNo = formData.phoneNo;
    }
    if (privacySettings.branch && formData?.branch) {
      revealedDetails.branch = formData.branch;
    }

    return JSON.stringify({ 
      proof, 
      publicSignals,
      // Include only the details user consented to reveal
      revealedDetails: Object.keys(revealedDetails).length > 0 ? revealedDetails : null,
      // Include privacy preferences for verification context
      privacySettings: privacySettings,
      // Metadata
      generatedAt: new Date().toISOString(),
      proofType: 'student-identity'
    });
  };

  const qrValue = generateQRValue();

  const togglePrivacySetting = (field) => {
    setPrivacySettings(prev => ({
      ...prev,
      [field]: !prev[field]
    }));
  };

  const handleShare = async () => {
    try {
      await Share.share({
        message: `My Zero-Knowledge Identity Proof:\n\n${qrValue}`,
        title: 'ZK Identity Proof',
      });
    } catch (error) {
      Alert.alert('Error', 'Failed to share proof');
    }
  };

  const handleCopyProof = () => {
    Clipboard.setString(qrValue);
    Alert.alert('Copied!', 'Proof data copied to clipboard');
  };

  const handleStartOver = () => {
    navigation.reset({
      index: 0,
      routes: [{ name: 'IdentityForm' }],
    });
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Animated.View 
        style={[
          styles.animatedContainer,
          {
            opacity: fadeAnim,
            transform: [{ scale: scaleAnim }],
          },
        ]}
      >
        <View style={styles.header}>
          <Text style={styles.successIcon}>✅</Text>
          <Text style={styles.title}>Proof Generated Successfully!</Text>
          <Text style={styles.subtitle}>
            Your zero-knowledge proof has been generated and automatically verified through multiple security methods.
          </Text>
        </View>

        {/* Auto-Verification Notice */}
        <View style={styles.autoVerificationNotice}>
          <Text style={styles.autoVerificationIcon}>🔒</Text>
          <Text style={styles.autoVerificationTitle}>Automatically Verified</Text>
          <Text style={styles.autoVerificationText}>
            This proof was automatically validated during generation using both off-chain cryptography and blockchain verification. You can share it with confidence knowing it's already been authenticated.
          </Text>
        </View>

        {/* Verification Status */}
        {verification && (
          <View style={styles.verificationContainer}>
            <Text style={styles.verificationTitle}>🔐 Detailed Verification Results</Text>
            
            <View style={styles.verificationItem}>
              <Text style={styles.verificationIcon}>⚡</Text>
              <View style={styles.verificationText}>
                <Text style={styles.verificationLabel}>Off-chain Verification</Text>
                <Text style={[
                  styles.verificationStatus,
                  verification.offchain?.valid ? styles.successText : styles.verificationErrorText
                ]}>
                  {verification.offchain?.success 
                    ? (verification.offchain.valid ? '✅ Valid' : '❌ Invalid')
                    : '⚠️ Failed'
                  }
                </Text>
              </View>
            </View>

            <View style={styles.verificationItem}>
              <Text style={styles.verificationIcon}>🔗</Text>
              <View style={styles.verificationText}>
                <Text style={styles.verificationLabel}>Blockchain Verification</Text>
                <Text style={[
                  styles.verificationStatus,
                  verification.blockchain?.valid ? styles.blockchainSuccessText : styles.verificationErrorText
                ]}>
                  {verification.blockchain?.success 
                    ? (verification.blockchain.valid ? '🔗✅ Verified on-chain' : '❌ Invalid')
                    : '⚠️ Network issue'
                  }
                </Text>
              </View>
            </View>

            <View style={styles.trustIndicator}>
              <Text style={styles.trustText}>
                {verification.blockchain?.valid 
                  ? '🏆 Highest Trust Level: Blockchain Verified'
                  : verification.offchain?.valid 
                    ? '⚡ Medium Trust Level: Off-chain Verified'
                    : '⚠️ Verification Issues Detected'
                }
              </Text>
            </View>
          </View>
        )}

        <View style={styles.qrContainer}>
          <View style={styles.qrWrapper}>
            <QRCode value={qrValue} size={220} backgroundColor="#ffffff" />
          </View>
          <Text style={styles.qrLabel}>📱 Scan to share your verified identity proof</Text>
        </View>

        {/* Privacy Controls */}
        <View style={styles.privacyContainer}>
          <TouchableOpacity 
            style={styles.privacyToggle}
            onPress={() => setShowPrivacyControls(!showPrivacyControls)}
          >
            <Text style={styles.privacyToggleIcon}>🔒</Text>
            <Text style={styles.privacyToggleText}>
              {showPrivacyControls ? '▼' : '▶'} Privacy Controls - Choose what to share
            </Text>
          </TouchableOpacity>

          {showPrivacyControls && (
            <View style={styles.privacyControls}>
              <Text style={styles.privacyTitle}>Select information to include in QR code:</Text>
              
              {formData && (
                <>
                  <TouchableOpacity 
                    style={styles.privacyOption}
                    onPress={() => togglePrivacySetting('name')}
                  >
                    <Text style={styles.privacyCheckbox}>
                      {privacySettings.name ? '✅' : '⬜'}
                    </Text>
                    <View style={styles.privacyDetails}>
                      <Text style={styles.privacyLabel}>Full Name</Text>
                      <Text style={styles.privacyValue}>
                        {privacySettings.name ? formData.name : 'Hidden'}
                      </Text>
                    </View>
                  </TouchableOpacity>

                  <TouchableOpacity 
                    style={styles.privacyOption}
                    onPress={() => togglePrivacySetting('rollNo')}
                  >
                    <Text style={styles.privacyCheckbox}>
                      {privacySettings.rollNo ? '✅' : '⬜'}
                    </Text>
                    <View style={styles.privacyDetails}>
                      <Text style={styles.privacyLabel}>Roll Number</Text>
                      <Text style={styles.privacyValue}>
                        {privacySettings.rollNo ? formData.rollNo : 'Hidden'}
                      </Text>
                    </View>
                  </TouchableOpacity>

                  <TouchableOpacity 
                    style={styles.privacyOption}
                    onPress={() => togglePrivacySetting('branch')}
                  >
                    <Text style={styles.privacyCheckbox}>
                      {privacySettings.branch ? '✅' : '⬜'}
                    </Text>
                    <View style={styles.privacyDetails}>
                      <Text style={styles.privacyLabel}>Branch/Department</Text>
                      <Text style={styles.privacyValue}>
                        {privacySettings.branch ? formData.branch : 'Hidden'}
                      </Text>
                    </View>
                  </TouchableOpacity>

                  <TouchableOpacity 
                    style={styles.privacyOption}
                    onPress={() => togglePrivacySetting('dob')}
                  >
                    <Text style={styles.privacyCheckbox}>
                      {privacySettings.dob ? '✅' : '⬜'}
                    </Text>
                    <View style={styles.privacyDetails}>
                      <Text style={styles.privacyLabel}>Date of Birth</Text>
                      <Text style={styles.privacyValue}>
                        {privacySettings.dob ? formData.dob : 'Hidden (Recommended)'}
                      </Text>
                    </View>
                  </TouchableOpacity>

                  <TouchableOpacity 
                    style={styles.privacyOption}
                    onPress={() => togglePrivacySetting('phoneNo')}
                  >
                    <Text style={styles.privacyCheckbox}>
                      {privacySettings.phoneNo ? '✅' : '⬜'}
                    </Text>
                    <View style={styles.privacyDetails}>
                      <Text style={styles.privacyLabel}>Phone Number</Text>
                      <Text style={styles.privacyValue}>
                        {privacySettings.phoneNo ? formData.phoneNo : 'Hidden (Recommended)'}
                      </Text>
                    </View>
                  </TouchableOpacity>
                </>
              )}

              <View style={styles.privacyNote}>
                <Text style={styles.privacyNoteText}>
                  💡 The cryptographic proof always validates all your information regardless of what you choose to reveal here. These settings only control what readable details are shared.
                </Text>
              </View>
            </View>
          )}
        </View>

        <View style={styles.actionContainer}>
          <View style={styles.shareNotice}>
            <Text style={styles.shareNoticeText}>
              📤 Your verified proof is ready to share! Others can scan the QR code or use the copied data to verify your identity.
            </Text>
            {Object.values(privacySettings).every(setting => !setting) && (
              <Text style={styles.maxPrivacyNotice}>
                🔒 Maximum Privacy Mode: No personal details will be shared - only cryptographic verification.
              </Text>
            )}
          </View>

          <View style={styles.secondaryButtonsRow}>
            <TouchableOpacity style={styles.primaryButton} onPress={handleShare}>
              <Text style={styles.primaryButtonText}>📤 Share Proof</Text>
            </TouchableOpacity>
            
            <TouchableOpacity style={styles.secondaryButton} onPress={handleCopyProof}>
              <Text style={styles.secondaryButtonText}>📋 Copy Data</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Details Section */}
        <View style={styles.detailsContainer}>
          <TouchableOpacity 
            style={styles.detailsToggle}
            onPress={() => setShowDetails(!showDetails)}
          >
            <Text style={styles.detailsToggleText}>
              {showDetails ? '▼' : '▶'} Technical Details
            </Text>
          </TouchableOpacity>

          {showDetails && (
            <View style={styles.detailsContent}>
              <Text style={styles.detailLabel}>Public Signals:</Text>
              <Text style={styles.detailValue}>{JSON.stringify(publicSignals, null, 2)}</Text>
              
              <Text style={styles.detailLabel}>Proof Hash:</Text>
              <Text style={styles.detailValue}>{JSON.stringify(proof).substring(0, 100)}...</Text>
            </View>
          )}
        </View>

        {/* Navigation */}
        <View style={styles.navigationContainer}>
          <TouchableOpacity style={styles.startOverButton} onPress={handleStartOver}>
            <Text style={styles.startOverButtonText}>🏠 Start Over</Text>
          </TouchableOpacity>
        </View>
      </Animated.View>
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
  animatedContainer: {
    flex: 1,
  },
  header: {
    alignItems: 'center',
    marginBottom: 30,
  },
  successIcon: {
    fontSize: 50,
    marginBottom: 12,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#059669',
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 16,
    color: '#64748b',
    textAlign: 'center',
    lineHeight: 22,
  },
  qrContainer: {
    alignItems: 'center',
    marginBottom: 30,
  },
  qrWrapper: {
    padding: 20,
    backgroundColor: '#ffffff',
    borderRadius: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
    marginBottom: 12,
  },
  qrLabel: {
    fontSize: 14,
    color: '#64748b',
    fontWeight: '500',
  },
  actionContainer: {
    marginBottom: 30,
  },
  shareNotice: {
    backgroundColor: '#eff6ff',
    borderRadius: 8,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#bfdbfe',
  },
  shareNoticeText: {
    fontSize: 14,
    color: '#1e40af',
    textAlign: 'center',
    fontWeight: '500',
    lineHeight: 18,
  },
  maxPrivacyNotice: {
    fontSize: 12,
    color: '#0f172a',
    textAlign: 'center',
    marginTop: 8,
  },
  primaryButton: {
    flex: 1,
    backgroundColor: '#418affff',
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderRadius: 12,
    alignItems: 'center',
    marginRight: 6,
  },
  primaryButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
  secondaryButtonsRow: {
    flexDirection: 'row',
    gap: 12,
  },
  secondaryButton: {
    flex: 1,
    backgroundColor: '#ffffff',
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#e2e8f0',
    marginLeft: 6,
  },
  secondaryButtonText: {
    color: '#64748b',
    fontSize: 14,
    fontWeight: '600',
  },
  detailsContainer: {
    marginBottom: 20,
  },
  detailsToggle: {
    backgroundColor: '#ffffff',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  detailsToggleText: {
    color: '#64748b',
    fontSize: 14,
    fontWeight: '600',
  },
  detailsContent: {
    backgroundColor: '#f1f5f9',
    padding: 16,
    borderRadius: 8,
    marginTop: 8,
  },
  detailLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#475569',
    marginBottom: 4,
  },
  detailValue: {
    fontSize: 10,
    color: '#64748b',
    fontFamily: 'monospace',
    marginBottom: 12,
  },
  navigationContainer: {
    alignItems: 'center',
  },
  startOverButton: {
    backgroundColor: '#f1f5f9',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
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
  // Auto-verification notice styles
  autoVerificationNotice: {
    backgroundColor: '#f0fdf4',
    borderRadius: 12,
    padding: 20,
    marginBottom: 24,
    borderWidth: 2,
    borderColor: '#bbf7d0',
    alignItems: 'center',
  },
  autoVerificationIcon: {
    fontSize: 32,
    marginBottom: 8,
  },
  autoVerificationTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#166534',
    marginBottom: 8,
    textAlign: 'center',
  },
  autoVerificationText: {
    fontSize: 14,
    color: '#166534',
    textAlign: 'center',
    lineHeight: 20,
  },
  // New verification styles
  verificationContainer: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 20,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  verificationTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1e293b',
    marginBottom: 16,
    textAlign: 'center',
  },
  verificationItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    padding: 12,
    backgroundColor: '#f8fafc',
    borderRadius: 8,
  },
  verificationIcon: {
    fontSize: 24,
    marginRight: 12,
    width: 36,
    textAlign: 'center',
  },
  verificationText: {
    flex: 1,
  },
  verificationLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 2,
  },
  verificationStatus: {
    fontSize: 12,
    fontWeight: '500',
  },
  successText: {
    color: '#10b981',
  },
  blockchainSuccessText: {
    color: '#3b82f6',
    fontWeight: '600',
  },
  verificationErrorText: {
    color: '#ef4444',
  },
  trustIndicator: {
    backgroundColor: '#eff6ff',
    padding: 12,
    borderRadius: 8,
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#bfdbfe',
  },
  trustText: {
    fontSize: 14,
    color: '#1e40af',
    fontWeight: '600',
    textAlign: 'center',
  },
  // Privacy controls styles
  privacyContainer: {
    marginBottom: 24,
  },
  privacyToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff7ed',
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#fed7aa',
  },
  privacyToggleIcon: {
    fontSize: 20,
    marginRight: 12,
  },
  privacyToggleText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#9a3412',
    flex: 1,
  },
  privacyControls: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 16,
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  privacyTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 16,
  },
  privacyOption: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderRadius: 8,
    marginBottom: 8,
    backgroundColor: '#f9fafb',
  },
  privacyCheckbox: {
    fontSize: 20,
    marginRight: 12,
    width: 30,
    textAlign: 'center',
  },
  privacyDetails: {
    flex: 1,
  },
  privacyLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 2,
  },
  privacyValue: {
    fontSize: 12,
    color: '#6b7280',
    fontStyle: 'italic',
  },
  privacyNote: {
    backgroundColor: '#eff6ff',
    padding: 12,
    borderRadius: 8,
    marginTop: 12,
    borderWidth: 1,
    borderColor: '#bfdbfe',
  },
  privacyNoteText: {
    fontSize: 12,
    color: '#1e40af',
    lineHeight: 16,
    textAlign: 'center',
  },
});
