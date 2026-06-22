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
import { ADMIN_BACKEND_URL } from '../../environment';

// Mirrors privdId_admin/backend/constants/enumCodes.js exactly (FROZEN,
// circuit-hardcoded integer codes) — do not reorder/rename without updating
// enumCodes.js and the circuit's set-membership check in lockstep.
const PROGRAMME_LEVELS = ['B.Tech', 'B.Des', 'Dual', 'M.Tech', 'M.Des', 'PhD'];
const DISCIPLINES = ['CSE', 'ECE', 'ME', 'SmartMfg', 'Design', 'NatSci'];

const EMPTY_FORM = {
  name: '',
  email: '',
  rollNo: '',
  programmeLevel: '',
  discipline: '',
  batch: '',
  dob: '',
};

function ChipPicker({ label, options, value, onSelect }) {
  return (
    <View style={styles.fieldGroup}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.chipRow}>
        {options.map(option => (
          <TouchableOpacity
            key={option}
            style={[styles.chip, value === option && styles.chipSelected]}
            onPress={() => onSelect(option)}
          >
            <Text style={[styles.chipText, value === option && styles.chipTextSelected]}>
              {option}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

export default function AdminAddStudentScreen({ route, navigation }) {
  const { token } = route.params || {};
  const [form, setForm] = useState(EMPTY_FORM);
  const [loading, setLoading] = useState(false);

  const handleChange = (field, value) => {
    setForm(prev => ({ ...prev, [field]: value }));
  };

  const validateForm = () => {
    const { name, email, rollNo, programmeLevel, discipline, batch, dob } = form;
    if (!name.trim()) return 'Full name is required';
    if (!email.trim() || !email.includes('@')) return 'A valid email is required';
    if (!rollNo.trim()) return 'Roll number is required';
    if (!programmeLevel) return 'Programme is required';
    if (!discipline) return 'Branch is required';
    if (!batch.trim() || !/^\d{4}$/.test(batch.trim())) return 'A valid 4-digit batch year is required';
    if (!dob.trim() || dob.length !== 8) return 'Date of Birth in DDMMYYYY format is required';
    return null;
  };

  const handleSubmit = async () => {
    const validationError = validateForm();
    if (validationError) {
      Alert.alert('Validation Error', validationError);
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(`${ADMIN_BACKEND_URL}/api/students`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          name: form.name.trim(),
          email: form.email.trim().toLowerCase(),
          rollNo: form.rollNo.trim(),
          programmeLevel: form.programmeLevel,
          discipline: form.discipline,
          batch: Number(form.batch.trim()),
          dob: form.dob.trim(),
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Failed to create student');
      }

      const name = data.student?.name || 'Student';
      if (data.student?.anchorPending) {
        Alert.alert(
          'Saved — on-chain anchoring failed',
          `${name} was saved and encrypted, but the on-chain credential issuance failed: ${data.student?.lastAnchorError || 'unknown error'}. The record is kept so it can be retried.`,
          [{ text: 'OK', onPress: () => navigation.goBack() }]
        );
      } else {
        Alert.alert(
          'Student Created',
          `${name} added and issued on-chain successfully. Send credentials from the dashboard.`,
          [{ text: 'OK', onPress: () => navigation.goBack() }]
        );
      }

      setForm(EMPTY_FORM);
    } catch (error) {
      Alert.alert('Error', error.message || 'Could not create student');
    } finally {
      setLoading(false);
    }
  };

  const topFields = [
    { key: 'name', label: 'Full Name', placeholder: 'e.g. Aarav Sharma', autoCapitalize: 'words', keyboardType: 'default' },
    { key: 'email', label: 'Email Address', placeholder: 'student@college.edu', autoCapitalize: 'none', keyboardType: 'email-address' },
    { key: 'rollNo', label: 'Roll Number', placeholder: 'e.g. 22BCSD01', autoCapitalize: 'characters', keyboardType: 'default' },
    { key: 'batch', label: 'Batch (Year)', placeholder: 'e.g. 2026', autoCapitalize: 'none', keyboardType: 'number-pad' },
  ];
  const dobField = { key: 'dob', label: 'Date of Birth', placeholder: 'DDMMYYYY', autoCapitalize: 'none', keyboardType: 'number-pad' };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        <View style={styles.infoBox}>
          <Text style={styles.infoText}>
            A temporary password will be generated automatically and stored. You can send credentials from the dashboard after adding the student.
          </Text>
        </View>

        <View style={styles.form}>
          {topFields.map(({ key, label, placeholder, autoCapitalize, keyboardType }) => (
            <View key={key} style={styles.fieldGroup}>
              <Text style={styles.label}>{label}</Text>
              <TextInput
                style={styles.input}
                placeholder={placeholder}
                value={form[key]}
                onChangeText={v => handleChange(key, v)}
                autoCapitalize={autoCapitalize}
                autoCorrect={false}
                keyboardType={keyboardType}
                placeholderTextColor="#9ca3af"
              />
            </View>
          ))}
          <ChipPicker
            label="Programme"
            options={PROGRAMME_LEVELS}
            value={form.programmeLevel}
            onSelect={v => handleChange('programmeLevel', v)}
          />
          <ChipPicker
            label="Branch"
            options={DISCIPLINES}
            value={form.discipline}
            onSelect={v => handleChange('discipline', v)}
          />
          <View style={styles.fieldGroup}>
            <Text style={styles.label}>{dobField.label}</Text>
            <TextInput
              style={styles.input}
              placeholder={dobField.placeholder}
              value={form.dob}
              onChangeText={v => handleChange('dob', v)}
              autoCapitalize={dobField.autoCapitalize}
              autoCorrect={false}
              keyboardType={dobField.keyboardType}
              placeholderTextColor="#9ca3af"
            />
          </View>
        </View>

        <TouchableOpacity
          style={[styles.submitButton, loading && styles.submitButtonDisabled]}
          onPress={handleSubmit}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.submitButtonText}>Create Student</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity style={styles.cancelButton} onPress={() => navigation.goBack()}>
          <Text style={styles.cancelButtonText}>Cancel</Text>
        </TouchableOpacity>
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
    padding: 20,
    paddingBottom: 40,
  },
  infoBox: {
    backgroundColor: '#eff6ff',
    borderRadius: 12,
    padding: 14,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#bfdbfe',
  },
  infoText: {
    fontSize: 13,
    color: '#1e40af',
    lineHeight: 19,
  },
  form: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 20,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07,
    shadowRadius: 8,
    elevation: 3,
    gap: 16,
  },
  fieldGroup: {
    gap: 6,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: '#374151',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
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
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    borderWidth: 1.5,
    borderColor: '#e2e8f0',
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 14,
    backgroundColor: '#f9fafb',
  },
  chipSelected: {
    borderColor: '#3b82f6',
    backgroundColor: '#3b82f6',
  },
  chipText: {
    fontSize: 14,
    color: '#1f2937',
    fontWeight: '600',
  },
  chipTextSelected: {
    color: '#ffffff',
  },
  submitButton: {
    backgroundColor: '#3b82f6',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 12,
    shadowColor: '#3b82f6',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  submitButtonDisabled: {
    backgroundColor: '#93c5fd',
    shadowOpacity: 0,
    elevation: 0,
  },
  submitButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
  },
  cancelButton: {
    alignItems: 'center',
    paddingVertical: 14,
  },
  cancelButtonText: {
    fontSize: 15,
    color: '#64748b',
    fontWeight: '600',
  },
});
