import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Alert,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { ADMIN_BACKEND_URL } from '../environment';

export default function LoginScreen({ navigation }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const handleLogin = async () => {
    if (!email.trim() || !password.trim()) {
      Alert.alert('Missing Fields', 'Please enter your email and password.');
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(`${ADMIN_BACKEND_URL}/api/students/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          password: password.trim(),
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Login failed');
      }

      if (data.student.enrollmentPhase === 'awaiting-keypair') {
        navigation.navigate('ClaimCredentialScreen', { student: data.student });
        return;
      }

      // 11-02 (Phase 11 device-loss redesign): check whether an AcadAdmin has
      // opened a device-loss recovery session for this student. If so, route
      // to RecoverDeviceScreen instead of the normal dashboard — the student
      // must submit a fresh on-device pubkey before daily access is restored
      // on this device. Minimal-plumbing approach: the student looks this up
      // by their own studentId right after login (no new login-response field
      // needed on the backend).
      try {
        const recoveryResponse = await fetch(
          `${ADMIN_BACKEND_URL}/api/recovery/status/${data.student.id}`
        );
        if (recoveryResponse.ok) {
          const recoveryData = await recoveryResponse.json();
          const session = recoveryData.session;
          if (session && session.operationType === 'device-loss' && !session.hasPubKey) {
            navigation.navigate('RecoverDeviceScreen', {
              sessionId: session.sessionId,
              student: data.student,
            });
            return;
          }
        }
      } catch (_recoveryCheckError) {
        // Non-fatal — if the status check fails, fall through to the normal
        // dashboard; the admin/student can retry recovery separately.
      }

      navigation.navigate('DashboardScreen', { student: data.student });
    } catch (error) {
      Alert.alert('Login Failed', error.message || 'Invalid credentials. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <Text style={styles.icon}>🔑</Text>
          <Text style={styles.title}>Student Login</Text>
          <Text style={styles.subtitle}>
            Sign in with the credentials sent to your email by your institution.
          </Text>
        </View>

        <View style={styles.form}>
          <Text style={styles.label}>Email Address</Text>
          <TextInput
            style={styles.input}
            placeholder="your.email@college.edu"
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            placeholderTextColor="#9ca3af"
          />

          <Text style={styles.label}>Password</Text>
          <View style={styles.passwordRow}>
            <TextInput
              style={[styles.input, styles.passwordInput]}
              placeholder="Enter your temporary password"
              value={password}
              onChangeText={setPassword}
              secureTextEntry={!showPassword}
              autoCorrect={false}
              autoCapitalize="none"
              placeholderTextColor="#9ca3af"
            />
            <TouchableOpacity
              style={styles.eyeButton}
              onPress={() => setShowPassword(v => !v)}
            >
              <Text style={styles.eyeText}>{showPassword ? '🙈' : '👁️'}</Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            style={[styles.loginButton, loading && styles.disabledButton]}
            onPress={handleLogin}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.loginButtonText}>Sign In</Text>
            )}
          </TouchableOpacity>
        </View>

        <View style={styles.infoBox}>
          <Text style={styles.infoTitle}>ℹ️ How to get your credentials</Text>
          <Text style={styles.infoText}>
            Your institution admin adds your details and sends your login credentials via email.
            Check your inbox (and spam folder) for an email with your temporary password.
          </Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  scrollContent: {
    padding: 24,
    paddingTop: 40,
  },
  header: {
    alignItems: 'center',
    marginBottom: 36,
  },
  icon: {
    fontSize: 56,
    marginBottom: 16,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#1e293b',
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 15,
    color: '#64748b',
    textAlign: 'center',
    lineHeight: 22,
    maxWidth: 320,
  },
  form: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 24,
    marginBottom: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07,
    shadowRadius: 8,
    elevation: 3,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 8,
    marginTop: 16,
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
  passwordRow: {
    position: 'relative',
  },
  passwordInput: {
    paddingRight: 50,
  },
  eyeButton: {
    position: 'absolute',
    right: 14,
    top: 14,
  },
  eyeText: {
    fontSize: 18,
  },
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
  disabledButton: {
    backgroundColor: '#93c5fd',
    shadowOpacity: 0,
    elevation: 0,
  },
  loginButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
  },
  infoBox: {
    backgroundColor: '#eff6ff',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#bfdbfe',
  },
  infoTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1e40af',
    marginBottom: 6,
  },
  infoText: {
    fontSize: 13,
    color: '#1e40af',
    lineHeight: 20,
  },
});
