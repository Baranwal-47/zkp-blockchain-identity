import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';

export default function WelcomeScreen({ navigation }) {
  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.header}>
        <Text style={styles.icon}>🪪</Text>
        <Text style={styles.title}>PrivdID</Text>
        <Text style={styles.subtitle}>IIITDM Jabalpur</Text>
        <Text style={styles.body}>
          A privacy-preserving digital identity for students. Your credential is encrypted and
          only you can decrypt it — you prove facts about it (like your enrollment status)
          without ever revealing the underlying data.
        </Text>
      </View>

      <TouchableOpacity
        style={styles.primaryButton}
        onPress={() => navigation.navigate('LoginScreen')}
      >
        <Text style={styles.primaryButtonText}>Student Login</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.secondaryButton}
        onPress={() => navigation.navigate('VerifyProofScreen')}
      >
        <Text style={styles.secondaryButtonText}>Verify a Student's Proof</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.secondaryButton}
        onPress={() => navigation.navigate('AdminLogin')}
      >
        <Text style={styles.secondaryButtonText}>Administration Login</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    backgroundColor: '#f8fafc',
    padding: 24,
    justifyContent: 'center',
  },
  header: {
    alignItems: 'center',
    marginBottom: 48,
  },
  icon: {
    fontSize: 64,
    marginBottom: 16,
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#1e293b',
  },
  subtitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#3b82f6',
    marginTop: 4,
    marginBottom: 20,
  },
  body: {
    fontSize: 15,
    color: '#64748b',
    textAlign: 'center',
    lineHeight: 22,
    maxWidth: 320,
  },
  primaryButton: {
    backgroundColor: '#3b82f6',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    shadowColor: '#3b82f6',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  primaryButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
  },
  secondaryButton: {
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 12,
    borderWidth: 1.5,
    borderColor: '#cbd5e1',
  },
  secondaryButtonText: {
    color: '#475569',
    fontSize: 16,
    fontWeight: '700',
  },
});
