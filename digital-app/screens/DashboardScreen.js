import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';

// IIITDM Jabalpur is the sole institution in this single-tenant system
// (CLAUDE.md) — no per-institution model exists, so the name is a constant.
const INSTITUTION_NAME = 'IIITDM Jabalpur';

export default function DashboardScreen({ route, navigation }) {
  const { student } = route.params;
  const rollNo = student.rollNo;

  // The student's own credential is "issued" once the admin backend has
  // produced a ciphertextCID for them (enrollmentPhase: 'active' implies
  // this). There is no aggregate issued-credentials endpoint in this phase
  // — the summary line reflects this student's own credential, per
  // ROADMAP's "credential status, institution, issued-credentials count".
  const issuedCount = student.ciphertextCID ? 1 : 0;

  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <Text style={styles.statusSummary}>
          {INSTITUTION_NAME} · {issuedCount} credential issued
        </Text>

        <TouchableOpacity
          style={styles.loginButton}
          onPress={() => navigation.navigate('ViewCredentialsScreen', { rollNo })}
        >
          <Text style={styles.loginButtonText}>View Credentials</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.loginButton}
          onPress={() => navigation.navigate('GenerateProofScreen', { rollNo })}
        >
          <Text style={styles.loginButtonText}>Generate Proof</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.loginButton}
          onPress={() => navigation.navigate('VerifyProofScreen', { student })}
        >
          <Text style={styles.loginButtonText}>Verify Proof</Text>
        </TouchableOpacity>
      </View>

      <TouchableOpacity
        style={styles.logoutButton}
        onPress={() =>
          navigation.reset({ index: 0, routes: [{ name: 'WelcomeScreen' }] })
        }
      >
        <Text style={styles.logoutButtonText}>Log Out</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
    padding: 24,
    justifyContent: 'center',
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
  statusSummary: {
    fontSize: 13,
    color: '#64748b',
    textAlign: 'center',
    marginBottom: 24,
  },
  // Copied verbatim from LoginScreen.js loginButton/loginButtonText
  loginButton: {
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
  loginButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
  },
  logoutButton: {
    marginTop: 20,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#cbd5e1',
  },
  logoutButtonText: {
    color: '#475569',
    fontSize: 15,
    fontWeight: '700',
  },
});
