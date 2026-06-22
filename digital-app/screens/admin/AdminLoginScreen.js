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
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { ADMIN_BACKEND_URL } from '../../environment';

const ROLE_OPTIONS = [
  { value: 'acadadmin', label: 'Academic Admin' },
  { value: 'registrar', label: 'Asst. Registrar' },
  { value: 'dean', label: 'Dean' },
];

export default function AdminLoginScreen({ navigation }) {
  const [role, setRole] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const handleLogin = async () => {
    if (!role) {
      Alert.alert('Required', 'Select your role first.');
      return;
    }
    if (!password.trim()) {
      Alert.alert('Required', 'Please enter your password.');
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(`${ADMIN_BACKEND_URL}/api/admin/role-login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role, password: password.trim() }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Invalid credentials');
      }

      // Academic Admin gets the full student-management dashboard.
      // Registrar/Dean get the read-only pending-approvals view (signing
      // happens in the web portal via MetaMask).
      if (role === 'acadadmin') {
        navigation.navigate('AdminDashboard', { token: data.token });
      } else {
        navigation.navigate('OfficialApprovals', { token: data.token, role });
      }
    } catch (error) {
      Alert.alert('Access Denied', error.message || 'Invalid credentials.');
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
          <View style={styles.shieldBadge}>
            <Text style={styles.shieldIcon}>🛡️</Text>
          </View>
          <Text style={styles.title}>Official Sign-in</Text>
          <Text style={styles.subtitle}>
            Select your role and enter your password to continue.
          </Text>
        </View>

        <View style={styles.form}>
          <Text style={styles.label}>Role</Text>
          <View style={styles.roleRow}>
            {ROLE_OPTIONS.map((option) => (
              <TouchableOpacity
                key={option.value}
                style={[styles.roleChip, role === option.value && styles.roleChipActive]}
                onPress={() => setRole(option.value)}
              >
                <Text style={[styles.roleChipText, role === option.value && styles.roleChipTextActive]}>
                  {option.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={[styles.label, { marginTop: 18 }]}>Password</Text>
          <View style={styles.passwordRow}>
            <TextInput
              style={[styles.input, styles.passwordInput]}
              placeholder="Enter your password"
              value={password}
              onChangeText={setPassword}
              secureTextEntry={!showPassword}
              autoCorrect={false}
              autoCapitalize="none"
              placeholderTextColor="#9ca3af"
              onSubmitEditing={handleLogin}
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
              <Text style={styles.loginButtonText}>Continue</Text>
            )}
          </TouchableOpacity>
        </View>

        <View style={styles.warningBox}>
          <Text style={styles.warningTitle}>⚠️ Restricted Access</Text>
          <Text style={styles.warningText}>
            This panel is for institution administrators only. Unauthorized access attempts are logged.
          </Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f172a',
  },
  scrollContent: {
    padding: 24,
    paddingTop: 60,
    flexGrow: 1,
    justifyContent: 'center',
  },
  header: {
    alignItems: 'center',
    marginBottom: 36,
  },
  shieldBadge: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(59,130,246,0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  shieldIcon: {
    fontSize: 40,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#f8fafc',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    color: '#94a3b8',
    textAlign: 'center',
    lineHeight: 20,
    maxWidth: 300,
  },
  form: {
    backgroundColor: 'rgba(30,41,59,0.8)',
    borderRadius: 16,
    padding: 24,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.12)',
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: '#94a3b8',
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  roleRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  roleChip: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: 'rgba(148,163,184,0.2)',
    backgroundColor: 'rgba(15,23,42,0.6)',
  },
  roleChipActive: {
    borderColor: '#3b82f6',
    backgroundColor: 'rgba(59,130,246,0.18)',
  },
  roleChipText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#94a3b8',
  },
  roleChipTextActive: {
    color: '#bfdbfe',
  },
  passwordRow: {
    position: 'relative',
    marginBottom: 20,
  },
  input: {
    borderWidth: 1.5,
    borderColor: 'rgba(148,163,184,0.2)',
    borderRadius: 10,
    padding: 14,
    fontSize: 15,
    color: '#f8fafc',
    backgroundColor: 'rgba(15,23,42,0.6)',
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
    shadowColor: '#3b82f6',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  disabledButton: {
    backgroundColor: '#1d4ed8',
    shadowOpacity: 0,
    elevation: 0,
  },
  loginButtonText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '700',
  },
  warningBox: {
    backgroundColor: 'rgba(245,158,11,0.1)',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(245,158,11,0.25)',
  },
  warningTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#fbbf24',
    marginBottom: 4,
  },
  warningText: {
    fontSize: 12,
    color: '#d97706',
    lineHeight: 18,
  },
});
