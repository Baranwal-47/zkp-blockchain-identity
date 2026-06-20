import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { ADMIN_BACKEND_URL } from '../../environment';

export default function AdminUploadScreen({ route, navigation }) {
  const { token } = route.params || {};
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);

  const handlePickDocument = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
        copyToCacheDirectory: true,
      });

      if (!result.canceled) {
        setFile(result.assets[0]);
      }
    } catch (error) {
      Alert.alert('Error', 'Could not open document picker.');
    }
  };

  const handleSubmit = async () => {
    if (!file) {
      Alert.alert('No file selected', 'Please select an Excel file to upload.');
      return;
    }

    setLoading(true);
    const formData = new FormData();
    
    // The backend expects a file with the key "file"
    formData.append('file', {
      uri: file.uri,
      name: file.name,
      type: file.mimeType,
    });

    try {
      const response = await fetch(`${ADMIN_BACKEND_URL}/api/students/upload`, {
        method: 'POST',
        headers: {
          'Content-Type': 'multipart/form-data',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Upload failed');
      }

      Alert.alert('Upload Successful', `${data.count} students were imported successfully.`);
      setFile(null);
      navigation.goBack();
    } catch (error) {
      Alert.alert('Upload Error', error.message || 'Could not upload the file.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.infoBox}>
        <Text style={styles.infoTitle}>Bulk Import from Excel</Text>
        <Text style={styles.infoText}>
          - The Excel file must have columns: `name`, `email`, `rollNo`, `programmeLevel`, `discipline`, `batch`, and `dob`.
        </Text>
        <Text style={styles.infoText}>
          - The `dob` column should be in `DDMMYYYY` format.
        </Text>
        <Text style={styles.infoText}>
          - Each row will be validated, and credentials will be issued on-chain.
        </Text>
      </View>

      <TouchableOpacity style={styles.pickerButton} onPress={handlePickDocument}>
        <Text style={styles.pickerButtonText}>
          {file ? 'Change File' : 'Select Excel File'}
        </Text>
      </TouchableOpacity>

      {file && (
        <Text style={styles.fileName}>
          Selected: {file.name}
        </Text>
      )}

      <TouchableOpacity
        style={[styles.submitButton, (loading || !file) && styles.submitButtonDisabled]}
        onPress={handleSubmit}
        disabled={loading || !file}
      >
        {loading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.submitButtonText}>Upload and Import Students</Text>
        )}
      </TouchableOpacity>
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
  infoBox: {
    backgroundColor: '#eff6ff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#bfdbfe',
  },
  infoTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#1e40af',
    marginBottom: 8,
  },
  infoText: {
    fontSize: 13,
    color: '#1e40af',
    lineHeight: 19,
    marginBottom: 4,
  },
  pickerButton: {
    backgroundColor: '#ffffff',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#e2e8f0',
    marginBottom: 12,
  },
  pickerButtonText: {
    color: '#3b82f6',
    fontSize: 15,
    fontWeight: '600',
  },
  fileName: {
    textAlign: 'center',
    color: '#64748b',
    marginBottom: 20,
    fontStyle: 'italic',
  },
  submitButton: {
    backgroundColor: '#3b82f6',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  submitButtonDisabled: {
    backgroundColor: '#93c5fd',
  },
  submitButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
  },
});
