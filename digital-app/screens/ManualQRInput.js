import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  TextInput,
  ScrollView,
} from 'react-native';

export default function ManualQRInput({ navigation }) {
  const [qrData, setQrData] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);

  const handleProcessQR = () => {
    if (!qrData.trim()) {
      Alert.alert('Error', 'Please enter QR code data');
      return;
    }

    setIsProcessing(true);

    try {
      const proofData = JSON.parse(qrData);
      
      if (proofData.proof && proofData.publicSignals) {
        navigation.navigate('VerifyProof', {
          proof: proofData.proof,
          publicSignals: proofData.publicSignals,
          revealedDetails: proofData.revealedDetails || null,
          privacySettings: proofData.privacySettings || null,
          generatedAt: proofData.generatedAt || null,
          proofType: proofData.proofType || null,
        });
      } else {
        Alert.alert(
          'Invalid Data',
          'This data does not contain valid proof information.',
          [{ text: 'OK' }]
        );
      }
    } catch (error) {
      Alert.alert(
        'Invalid Format',
        'Could not parse the data. Please ensure it contains valid JSON proof data.',
        [{ text: 'OK' }]
      );
    } finally {
      setIsProcessing(false);
    }
  };

  const handlePasteExample = () => {
    // This would be an example QR data structure
    const exampleData = {
      proof: { 
        pi_a: ["0x1234...", "0x5678..."], 
        pi_b: [["0xabcd...", "0xefgh..."], ["0xijkl...", "0xmnop..."]], 
        pi_c: ["0xqrst...", "0xuvwx..."] 
      },
      publicSignals: ["123456789"],
      revealedDetails: {
        name: "John Doe",
        rollNo: "21BCS001",
        branch: "Computer Science"
      },
      privacySettings: {
        name: true,
        rollNo: true,
        branch: true,
        dob: false,
        phoneNo: false
      },
      generatedAt: new Date().toISOString(),
      proofType: "student-identity"
    };
    setQrData(JSON.stringify(exampleData, null, 2));
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Text style={styles.headerIcon}>📋</Text>
        <Text style={styles.title}>Manual QR Code Input</Text>
        <Text style={styles.subtitle}>
          Paste or type the QR code data below to verify a zero-knowledge proof
        </Text>
      </View>

      <View style={styles.inputContainer}>
        <Text style={styles.label}>QR Code Data (JSON)</Text>
        <TextInput
          style={styles.textInput}
          placeholder='{"proof": {...}, "publicSignals": [...]}'
          value={qrData}
          onChangeText={setQrData}
          multiline
          numberOfLines={10}
          textAlignVertical="top"
        />
      </View>

      <View style={styles.actionContainer}>
        <TouchableOpacity 
          style={[styles.processButton, !qrData.trim() && styles.disabledButton]} 
          onPress={handleProcessQR}
          disabled={!qrData.trim() || isProcessing}
        >
          <Text style={styles.processButtonText}>
            {isProcessing ? 'Processing...' : '🔍 Verify Proof'}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.exampleButton} onPress={handlePasteExample}>
          <Text style={styles.exampleButtonText}>📝 Paste Example</Text>
        </TouchableOpacity>

        <TouchableOpacity 
          style={styles.backButton} 
          onPress={() => navigation.goBack()}
        >
          <Text style={styles.backButtonText}>← Back</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.infoContainer}>
        <Text style={styles.infoTitle}>💡 How to Use</Text>
        <Text style={styles.infoText}>
          1. Copy the QR code data from a proof{'\n'}
          2. Paste it in the text field above{'\n'}
          3. Tap "Verify Proof" to check validity{'\n'}
          4. The data should be in JSON format with "proof" and "publicSignals" fields
        </Text>
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
  inputContainer: {
    marginBottom: 24,
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 8,
    color: '#374151',
  },
  textInput: {
    borderWidth: 2,
    borderColor: '#e5e7eb',
    borderRadius: 12,
    padding: 16,
    fontSize: 14,
    backgroundColor: '#ffffff',
    color: '#1f2937',
    fontFamily: 'monospace',
    minHeight: 200,
  },
  actionContainer: {
    gap: 12,
    marginBottom: 24,
  },
  processButton: {
    backgroundColor: '#3b82f6',
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 12,
    alignItems: 'center',
  },
  disabledButton: {
    backgroundColor: '#9ca3af',
  },
  processButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
  exampleButton: {
    backgroundColor: '#10b981',
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 12,
    alignItems: 'center',
  },
  exampleButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
  },
  backButton: {
    backgroundColor: '#ffffff',
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#e5e7eb',
  },
  backButtonText: {
    color: '#64748b',
    fontSize: 16,
    fontWeight: '600',
  },
  infoContainer: {
    backgroundColor: '#eff6ff',
    padding: 20,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#bfdbfe',
  },
  infoTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1e40af',
    marginBottom: 8,
  },
  infoText: {
    fontSize: 14,
    color: '#1e40af',
    lineHeight: 20,
  },
});
