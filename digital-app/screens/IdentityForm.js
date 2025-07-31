// screens/IdentityForm.js
import React, { useState, useEffect } from 'react';
import { 
  View, 
  TextInput, 
  Text, 
  StyleSheet, 
  TouchableOpacity, 
  Platform,
  Alert,
  ScrollView,
  KeyboardAvoidingView,
  Animated
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';

export default function IdentityForm({ onSubmit, navigation }) {
  const [form, setForm] = useState({
    name: '',
    rollNo: '',
    dob: '',
    phoneNo: '',
    branch: ''
  });
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [fieldErrors, setFieldErrors] = useState({});
  const [touchedFields, setTouchedFields] = useState({});
  const [isFormValid, setIsFormValid] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const branches = ['CSE', 'ECE', 'ME', 'SM', 'Design'];

  // Validate form whenever it changes
  useEffect(() => {
    validateForm();
  }, [form]);

  const formatRollNo = (text) => {
    const cleaned = text.replace(/[^a-zA-Z0-9]/g, '');
    return cleaned.toUpperCase();
  };

  const formatPhoneNo = (text) => {
    const cleaned = text.replace(/\D/g, '');
    
    if (cleaned.length === 0) {
      return '';
    }
    
    if (text.startsWith('+91')) {
      const numberPart = text.substring(3);
      const cleanedNumber = numberPart.replace(/\D/g, '');
      
      if (cleanedNumber.length === 0) {
        return '';
      }
      
      // Don't accept more than 10 digits - return previous valid state
      if (cleanedNumber.length > 10) {
        return text.substring(0, text.length - 1);
      }
      
      return `+91${cleanedNumber}`;
    }
    
    if (cleaned.startsWith('91') && cleaned.length > 2) {
      const numberPart = cleaned.substring(2);
      
      // Don't accept more than 10 digits - return previous valid state  
      if (numberPart.length > 10) {
        return text.substring(0, text.length - 1);
      }
      
      return `+91${numberPart}`;
    }
    
    // Don't accept more than 10 digits - return previous valid state
    if (cleaned.length > 10) {
      return text.substring(0, text.length - 1);
    }
    
    return `+91${cleaned}`;
  };

  const handleDateChange = (event, date) => {
    if (Platform.OS === 'android') {
      setShowDatePicker(false);
    }
    
    if (date) {
      setSelectedDate(date);
      const day = String(date.getDate()).padStart(2, '0');
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const year = date.getFullYear();
      setForm(f => ({ ...f, dob: `${day}${month}${year}` }));
    }
  };

  const formatDateDisplay = (dateString) => {
    if (!dateString || dateString.length !== 8) return 'Select Date of Birth';
    const day = dateString.substring(0, 2);
    const month = dateString.substring(2, 4);
    const year = dateString.substring(4, 8);
    return `${day}/${month}/${year}`;
  };

  const validateField = (field, value) => {
    const errors = {};

    switch (field) {
      case 'name':
        if (!value.trim()) {
          errors.name = 'Full name is required';
        } else if (value.trim().length < 2) {
          errors.name = 'Name must be at least 2 characters';
        }
        break;

      case 'rollNo':
        if (!value) {
          errors.rollNo = 'Roll number is required';
        } else if (!value.match(/^\d{2}[A-Z]{2,4}\d{2,3}$/)) {
          errors.rollNo = 'Format: 22BCSD01';
        }
        break;

      case 'dob':
        if (!value || value.length !== 8) {
          errors.dob = 'Please select your date of birth';
        }
        break;

      case 'phoneNo':
        if (!value) {
          errors.phoneNo = 'Phone number is required';
        } else if (!value.startsWith('+91')) {
          errors.phoneNo = 'Phone number must start with +91';
        } else {
          const numberPart = value.substring(3);
          if (numberPart.length < 10) {
            errors.phoneNo = `Phone number is too short (${numberPart.length}/10 digits)`;
          } else if (numberPart.length > 10) {
            errors.phoneNo = `Phone number is too long (${numberPart.length}/10 digits)`;
          } else if (!value.match(/^\+91\d{10}$/)) {
            errors.phoneNo = 'Phone number must contain only digits after +91';
          }
        }
        break;

      case 'branch':
        if (!value) {
          errors.branch = 'Please select your branch';
        }
        break;
    }

    return errors;
  };

  const validateForm = () => {
    let allErrors = {};
    Object.keys(form).forEach(field => {
      const fieldError = validateField(field, form[field]);
      allErrors = { ...allErrors, ...fieldError };
    });

    setFieldErrors(allErrors);
    setIsFormValid(Object.keys(allErrors).length === 0);
  };

  const handleFieldChange = (field, value) => {
    setForm(f => ({ ...f, [field]: value }));
    
    // Mark field as touched when user interacts with it
    setTouchedFields(prev => ({ ...prev, [field]: true }));
    
    // Clear field error when user starts typing
    if (fieldErrors[field]) {
      setFieldErrors(prev => {
        const newErrors = { ...prev };
        delete newErrors[field];
        return newErrors;
      });
    }
  };

  const handleSubmit = async () => {
    // Mark all fields as touched when submitting
    const allTouched = Object.keys(form).reduce((acc, field) => {
      acc[field] = true;
      return acc;
    }, {});
    setTouchedFields(allTouched);

    // Validate all fields
    validateForm();

    if (!isFormValid) {
      Alert.alert('Form Incomplete', 'Please fill in all fields correctly');
      return;
    }

    setIsSubmitting(true);
    
    try {
      // Navigate to loading screen
      navigation.navigate('LoadingScreen', { form });
    } catch (error) {
      Alert.alert('Error', 'Failed to submit form');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClearForm = () => {
    Alert.alert(
      'Clear Form',
      'Are you sure you want to clear all entered data?',
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Clear', 
          style: 'destructive',
          onPress: () => {
            setForm({
              name: '',
              rollNo: '',
              dob: '',
              phoneNo: '',
              branch: ''
            });
            setTouchedFields({});
            setFieldErrors({});
            setSelectedDate(new Date());
          }
        }
      ]
    );
  };

  const getFieldStyle = (field) => {
    // Only show error styling if field has been touched AND has an error
    if (touchedFields[field] && fieldErrors[field]) {
      return [styles.input, styles.inputError];
    }
    // Show success styling if field has been touched, has value, and no error
    if (touchedFields[field] && form[field] && !fieldErrors[field]) {
      return [styles.input, styles.inputValid];
    }
    return styles.input;
  };

  return (
    <KeyboardAvoidingView 
      style={styles.container} 
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.header}>
          <Text style={styles.headerIcon}>🆔</Text>
          <Text style={styles.title}>Student Identity Form</Text>
          <Text style={styles.subtitle}>
            Enter your details to generate a zero-knowledge proof of your identity
          </Text>
          
          <View style={styles.scanButtonsContainer}>
            <TouchableOpacity 
              style={styles.scanButton}
              onPress={() => navigation.navigate('QRScannerScreen')}
            >
              <Text style={styles.scanButtonText}>📷 Scan QR Code</Text>
            </TouchableOpacity>
            
            <TouchableOpacity 
              style={styles.manualButton}
              onPress={() => navigation.navigate('ManualQRInput')}
            >
              <Text style={styles.manualButtonText}>📝 Manual Input</Text>
            </TouchableOpacity>
          </View>
        </View>
        
        <View style={styles.inputContainer}>
          <Text style={styles.label}>Full Name *</Text>
          <TextInput 
            style={getFieldStyle('name')}
            placeholder="e.g., Utkarsh Baranwal" 
            value={form.name}
            onChangeText={v => handleFieldChange('name', v)} 
            autoCapitalize="words"
            autoCorrect={false}
          />
          {touchedFields.name && fieldErrors.name && <Text style={styles.errorText}>{fieldErrors.name}</Text>}
        </View>

        <View style={styles.inputContainer}>
          <Text style={styles.label}>Roll Number *</Text>
          <TextInput 
            style={getFieldStyle('rollNo')}
            placeholder="e.g., 22BCSD01" 
            value={form.rollNo}
            onChangeText={v => handleFieldChange('rollNo', formatRollNo(v))} 
            autoCapitalize="characters"
            maxLength={9}
            autoCorrect={false}
          />
          {touchedFields.rollNo && fieldErrors.rollNo && <Text style={styles.errorText}>{fieldErrors.rollNo}</Text>}
        </View>

        <View style={styles.inputContainer}>
          <Text style={styles.label}>Date of Birth *</Text>
          <TouchableOpacity 
            style={[
              styles.dateButton, 
              touchedFields.dob && fieldErrors.dob && styles.inputError, 
              touchedFields.dob && form.dob && !fieldErrors.dob && styles.inputValid
            ]} 
            onPress={() => {
              setTouchedFields(prev => ({ ...prev, dob: true }));
              setShowDatePicker(true);
            }}
          >
            <Text style={[styles.dateButtonText, form.dob && styles.dateButtonTextFilled]}>
              {formatDateDisplay(form.dob)}
            </Text>
          </TouchableOpacity>
          {touchedFields.dob && fieldErrors.dob && <Text style={styles.errorText}>{fieldErrors.dob}</Text>}
          
          {showDatePicker && (
            <DateTimePicker
              value={selectedDate}
              mode="date"
              display="default"
              onChange={handleDateChange}
              maximumDate={new Date()}
            />
          )}
        </View>

        <View style={styles.inputContainer}>
          <Text style={styles.label}>Phone Number *</Text>
          <TextInput 
            style={getFieldStyle('phoneNo')}
            placeholder="+91XXXXXXXXXX" 
            value={form.phoneNo}
            onChangeText={v => handleFieldChange('phoneNo', formatPhoneNo(v))} 
            keyboardType="phone-pad"
            maxLength={13}
            autoCorrect={false}
          />
          {touchedFields.phoneNo && fieldErrors.phoneNo && <Text style={styles.errorText}>{fieldErrors.phoneNo}</Text>}
        </View>

        <View style={styles.inputContainer}>
          <Text style={styles.label}>Branch *</Text>
          <View style={styles.branchContainer}>
            {branches.map((branch) => (
              <TouchableOpacity
                key={branch}
                style={[
                  styles.branchButton,
                  form.branch === branch && styles.branchButtonSelected
                ]}
                onPress={() => handleFieldChange('branch', branch)}
              >
                <Text style={[
                  styles.branchButtonText,
                  form.branch === branch && styles.branchButtonTextSelected
                ]}>
                  {branch}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          {touchedFields.branch && fieldErrors.branch && <Text style={styles.errorText}>{fieldErrors.branch}</Text>}
        </View>

        <View style={styles.actionContainer}>
          <TouchableOpacity 
            style={[styles.submitButton, !isFormValid && styles.disabledButton]} 
            onPress={handleSubmit}
            disabled={!isFormValid || isSubmitting}
          >
            <Text style={styles.submitButtonText}>
              {isSubmitting ? 'Submitting...' : '🔐 Generate Zero-Knowledge Proof'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.clearButton} onPress={handleClearForm}>
            <Text style={styles.clearButtonText}>🗑️ Clear Form</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.infoContainer}>
          <Text style={styles.infoTitle}>🔒 Privacy Notice</Text>
          <Text style={styles.infoText}>
            Your personal information will be hashed using cryptographic functions. 
            The generated proof allows identity verification without revealing your actual data.
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
    padding: 20,
  },
  header: {
    alignItems: 'center',
    marginBottom: 32,
  },
  headerIcon: {
    fontSize: 50,
    marginBottom: 12,
  },
  title: {
    fontSize: 28,
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
  scanButton: {
    backgroundColor: '#10b981',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 24,
    flex: 1,
  },
  scanButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
  },
  scanButtonsContainer: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 16,
    width: '100%',
  },
  manualButton: {
    backgroundColor: '#6366f1',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 24,
    flex: 1,
  },
  manualButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
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
  input: {
    borderWidth: 2,
    borderColor: '#e5e7eb',
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    backgroundColor: '#ffffff',
    color: '#1f2937',
  },
  inputError: {
    borderColor: '#ef4444',
    backgroundColor: '#fef2f2',
  },
  inputValid: {
    borderColor: '#10b981',
    backgroundColor: '#f0fdf4',
  },
  errorText: {
    color: '#ef4444',
    fontSize: 14,
    marginTop: 4,
    fontWeight: '500',
  },
  dateButton: {
    borderWidth: 2,
    borderColor: '#e5e7eb',
    borderRadius: 12,
    padding: 16,
    backgroundColor: '#ffffff',
  },
  dateButtonText: {
    fontSize: 16,
    color: '#9ca3af',
  },
  dateButtonTextFilled: {
    color: '#1f2937',
    fontWeight: '500',
  },
  branchContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  branchButton: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 24,
    borderWidth: 2,
    borderColor: '#3b82f6',
    backgroundColor: '#ffffff',
    minWidth: 80,
    alignItems: 'center',
  },
  branchButtonSelected: {
    backgroundColor: '#3b82f6',
  },
  branchButtonText: {
    color: '#3b82f6',
    fontWeight: '600',
    fontSize: 14,
  },
  branchButtonTextSelected: {
    color: '#ffffff',
  },
  actionContainer: {
    marginTop: 20,
    marginBottom: 24,
    gap: 12,
  },
  submitButton: {
    backgroundColor: '#3b82f6',
    paddingVertical: 18,
    paddingHorizontal: 24,
    borderRadius: 12,
    alignItems: 'center',
    shadowColor: '#3b82f6',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  disabledButton: {
    backgroundColor: '#9ca3af',
    shadowOpacity: 0,
    elevation: 0,
  },
  submitButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
  },
  clearButton: {
    backgroundColor: '#ffffff',
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#e5e7eb',
  },
  clearButtonText: {
    color: '#6b7280',
    fontSize: 14,
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
