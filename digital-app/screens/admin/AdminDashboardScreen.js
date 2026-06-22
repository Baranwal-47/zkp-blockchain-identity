import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  Alert,
  ActivityIndicator,
  RefreshControl,
  ScrollView,
} from 'react-native';
import { ADMIN_BACKEND_URL } from '../../environment';

function formatDate(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

export default function AdminDashboardScreen({ route, navigation }) {
  const { token } = route.params || {};

  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedIds, setSelectedIds] = useState([]);
  const [sendingEmail, setSendingEmail] = useState(false);
  const [emailResults, setEmailResults] = useState(null);

  const authHeaders = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };

  const loadStudents = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);

    try {
      const response = await fetch(`${ADMIN_BACKEND_URL}/api/students`, {
        headers: authHeaders,
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'Failed to load students');
      setStudents(data.students || []);
    } catch (error) {
      Alert.alert('Error', error.message || 'Could not load students');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  const handleLogout = () => {
    navigation.reset({ index: 0, routes: [{ name: 'WelcomeScreen' }] });
  };

  useEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <TouchableOpacity onPress={handleLogout} style={styles.logoutBtn}>
          <Text style={styles.logoutText}>Logout</Text>
        </TouchableOpacity>
      ),
    });
    loadStudents();
    const unsubscribe = navigation.addListener('focus', () => loadStudents());
    return unsubscribe;
  }, [navigation, loadStudents]);

  const toggleSelect = (id) => {
    setSelectedIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const toggleSelectAll = () => {
    setSelectedIds(prev =>
      prev.length === students.length ? [] : students.map(s => s.id)
    );
  };
  
  const handleEdit = (studentId) => {
    navigation.navigate('AdminEditStudent', { studentId, token });
  };

  const handleRevoke = (studentId) => {
    // Revocation is Safe-governed and requires the acad-admin's MetaMask
    // signature to propose — not available in the app. Direct to the web portal.
    const student = students.find((s) => s.id === studentId);
    Alert.alert(
      'Revoke from the web portal',
      `Revoking ${student?.rollNo || 'this student'} needs a MetaMask signature, which the app can't provide. Open the PrivdID admin web portal as Academic Admin, find the student, and choose Revoke — then 2 of 3 officials approve it.`,
      [{ text: 'OK' }]
    );
  };

  const handleSendEmails = async () => {
    if (!selectedIds.length) {
      Alert.alert('No selection', 'Please select at least one student to send email.');
      return;
    }

    Alert.alert(
      'Send Credentials',
      `Send login credentials to ${selectedIds.length} student(s)?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Send',
          onPress: async () => {
            setSendingEmail(true);
            setEmailResults(null);
            try {
              const response = await fetch(`${ADMIN_BACKEND_URL}/api/students/send-email`, {
                method: 'POST',
                headers: authHeaders,
                body: JSON.stringify({ studentIds: selectedIds }),
              });
              const data = await response.json();
              if (!response.ok) throw new Error(data.message || 'Email sending failed');

              const { sent = [], skipped = [], failed = [] } = data.summary || {};
              setEmailResults(data.details || []);
              setSelectedIds([]);
              await loadStudents();

              Alert.alert(
                'Email Summary',
                `Sent: ${sent.length} | Skipped: ${skipped.length} | Failed: ${failed.length}`
              );
            } catch (error) {
              Alert.alert('Error', error.message || 'Failed to send emails');
            } finally {
              setSendingEmail(false);
            }
          },
        },
      ]
    );
  };

  const totalStudents = students.length;
  const emailedCount = students.filter(s => s.emailSent).length;
  const programmes = new Set(students.map(s => s.programmeLevel)).size;

  const renderStudent = ({ item }) => {
    const isSelected = selectedIds.includes(item.id);
    return (
      <View style={[styles.studentRow, isSelected && styles.studentRowSelected]}>
        <TouchableOpacity style={{flex:1}} onPress={() => toggleSelect(item.id)} activeOpacity={0.7}>
          <View style={styles.studentTopRow}>
            <View style={styles.studentCheckbox}>
              <Text style={styles.checkboxText}>{isSelected ? '✅' : '⬜'}</Text>
            </View>
            <View style={styles.studentInfo}>
              <Text style={styles.studentName}>{item.name}</Text>
              <Text style={styles.studentEmail}>{item.email}</Text>
            </View>
          </View>
          <View style={styles.studentMeta}>
            <Text style={styles.metaTag}>{item.rollNo}</Text>
            <Text style={styles.metaTag}>{item.programmeLevel} {item.discipline}</Text>
            <Text style={styles.metaTag}>Batch {item.batch || 'N/A'}</Text>
            <Text style={styles.metaTag}>DOB: {item.dob || 'N/A'}</Text>
            {item.revoked ? (
              <Text style={[styles.metaTag, styles.metaTagRevoked]}>🚫 Revoked</Text>
            ) : item.emailSent ? (
              <Text style={[styles.metaTag, styles.metaTagSent]}>✉️ Sent</Text>
            ) : (
              <Text style={[styles.metaTag, styles.metaTagPending]}>📭 Pending</Text>
            )}
          </View>
        </TouchableOpacity>
        <View style={styles.studentActions}>
          <TouchableOpacity onPress={() => handleEdit(item.id)} style={styles.actionButton}>
            <Text style={styles.actionButtonText}>Edit</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => handleRevoke(item.id)} style={[styles.actionButton, styles.revokeButton]} disabled={item.revoked}>
            <Text style={[styles.actionButtonText, styles.revokeButtonText]}>{item.revoked ? 'Revoked' : 'Revoke'}</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#3b82f6" />
        <Text style={styles.loadingText}>Loading students...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Stats bar */}
      <View style={styles.statsRow}>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{totalStudents}</Text>
          <Text style={styles.statLabel}>Students</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{emailedCount}</Text>
          <Text style={styles.statLabel}>Emailed</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{programmes}</Text>
          <Text style={styles.statLabel}>Programmes</Text>
        </View>
      </View>

      {/* Action buttons */}
      <View style={styles.actionRow}>
        <TouchableOpacity
          style={styles.addButton}
          onPress={() => navigation.navigate('AdminAddStudent', { token })}
        >
          <Text style={styles.addButtonText}>+ Add Student</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.uploadButton}
          onPress={() => navigation.navigate('AdminUpload', { token })}
        >
          <Text style={styles.uploadButtonText}>📋 Bulk Add</Text>
        </TouchableOpacity>
      </View>

      {/* Selection controls */}
      {students.length > 0 && (
        <View style={styles.selectionRow}>
          <TouchableOpacity onPress={toggleSelectAll} style={styles.selectAllBtn}>
            <Text style={styles.selectAllText}>
              {selectedIds.length === students.length ? 'Deselect All' : 'Select All'}
            </Text>
          </TouchableOpacity>
          <Text style={styles.selectionCount}>
            {selectedIds.length} of {students.length} selected
          </Text>
          <TouchableOpacity
            style={[styles.sendEmailBtn, (!selectedIds.length || sendingEmail) && styles.sendEmailBtnDisabled]}
            onPress={handleSendEmails}
            disabled={!selectedIds.length || sendingEmail}
          >
            {sendingEmail ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={styles.sendEmailBtnText}>Send Email</Text>
            )}
          </TouchableOpacity>
        </View>
      )}

      {/* Student list */}
      <FlatList
        data={students}
        keyExtractor={item => item.id}
        renderItem={renderStudent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => loadStudents(true)} />
        }
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Text style={styles.emptyIcon}>📭</Text>
            <Text style={styles.emptyTitle}>No students yet</Text>
            <Text style={styles.emptyText}>Add students via form or Excel upload.</Text>
          </View>
        }
        contentContainerStyle={styles.listContent}
      />

      {/* Email results panel */}
      {emailResults && emailResults.length > 0 && (
        <View style={styles.resultsPanel}>
          <View style={styles.resultsPanelHeader}>
            <Text style={styles.resultsPanelTitle}>Last Email Run</Text>
            <TouchableOpacity onPress={() => setEmailResults(null)}>
              <Text style={styles.dismissText}>Dismiss ✕</Text>
            </TouchableOpacity>
          </View>
          <ScrollView style={styles.resultsScroll} nestedScrollEnabled>
            {emailResults.map(entry => (
              <View key={entry.studentId} style={styles.resultRow}>
                <Text style={styles.resultName}>{entry.name}</Text>
                <Text
                  style={[
                    styles.resultStatus,
                    entry.status === 'sent' && styles.statusSent,
                    entry.status === 'failed' && styles.statusFailed,
                    entry.status === 'skipped' && styles.statusSkipped,
                  ]}
                >
                  {entry.status}
                </Text>
              </View>
            ))}
          </ScrollView>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  logoutBtn: { paddingHorizontal: 14, paddingVertical: 6 },
  logoutText: { color: '#f8fafc', fontWeight: '600', fontSize: 14 },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
  },
  loadingText: {
    marginTop: 12,
    color: '#64748b',
    fontSize: 14,
  },
  statsRow: {
    flexDirection: 'row',
    padding: 16,
    gap: 10,
    backgroundColor: '#1e293b',
  },
  statCard: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 12,
    padding: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  statValue: {
    fontSize: 24,
    fontWeight: '800',
    color: '#f8fafc',
    marginBottom: 2,
  },
  statLabel: {
    fontSize: 11,
    color: '#94a3b8',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  actionRow: {
    flexDirection: 'row',
    padding: 12,
    gap: 10,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  addButton: {
    flex: 1,
    backgroundColor: '#3b82f6',
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
  },
  addButtonText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 14,
  },
  uploadButton: {
    flex: 1,
    backgroundColor: '#f1f5f9',
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  uploadButtonText: {
    color: '#475569',
    fontWeight: '600',
    fontSize: 14,
  },
  selectionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: '#f1f5f9',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
    gap: 10,
  },
  selectAllBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: '#ffffff',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  selectAllText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#475569',
  },
  selectionCount: {
    flex: 1,
    fontSize: 12,
    color: '#64748b',
    textAlign: 'center',
  },
  sendEmailBtn: {
    backgroundColor: '#10b981',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    minWidth: 90,
    alignItems: 'center',
  },
  sendEmailBtnDisabled: {
    backgroundColor: '#6ee7b7',
  },
  sendEmailBtnText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 12,
  },
  listContent: {
    padding: 12,
    gap: 8,
  },
  studentRow: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1.5,
    borderColor: '#e2e8f0',
    marginBottom: 8,
  },
  studentRowSelected: {
    borderColor: '#3b82f6',
    backgroundColor: '#eff6ff',
  },
  studentTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  studentCheckbox: {
    marginRight: 12,
  },
  checkboxText: {
    fontSize: 20,
  },
  studentInfo: {
    flex: 1,
  },
  studentName: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1e293b',
    marginBottom: 2,
  },
  studentEmail: {
    fontSize: 12,
    color: '#64748b',
  },
  studentMeta: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    paddingLeft: 32,
  },
  metaTag: {
    fontSize: 11,
    backgroundColor: '#f1f5f9',
    color: '#475569',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    fontWeight: '500',
  },
  metaTagSent: {
    backgroundColor: '#dcfce7',
    color: '#166534',
  },
  metaTagPending: {
    backgroundColor: '#fef3c7',
    color: '#92400e',
  },
  metaTagRevoked: {
    backgroundColor: '#fee2e2',
    color: '#991b1b',
  },
  studentActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
  },
  actionButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#e0e7ff',
  },
  actionButtonText: {
    color: '#4338ca',
    fontSize: 12,
    fontWeight: '600',
  },
  revokeButton: {
    backgroundColor: '#ffe4e6',
  },
  revokeButtonText: {
    color: '#be123c',
  },
  emptyState: {
    alignItems: 'center',
    paddingTop: 60,
  },
  emptyIcon: {
    fontSize: 50,
    marginBottom: 12,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1e293b',
    marginBottom: 6,
  },
  emptyText: {
    fontSize: 14,
    color: '#64748b',
    textAlign: 'center',
  },
  resultsPanel: {
    backgroundColor: '#ffffff',
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
    maxHeight: 200,
    padding: 14,
  },
  resultsPanelHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  resultsPanelTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1e293b',
  },
  dismissText: {
    fontSize: 13,
    color: '#64748b',
  },
  resultsScroll: {
    maxHeight: 140,
  },
  resultRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  resultName: {
    fontSize: 13,
    color: '#374151',
    fontWeight: '500',
    flex: 1,
  },
  resultStatus: {
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  statusSent: {
    color: '#166534',
    backgroundColor: '#dcfce7',
  },
  statusFailed: {
    color: '#991b1b',
    backgroundColor: '#fee2e2',
  },
  statusSkipped: {
    color: '#92400e',
    backgroundColor: '#fef3c7',
  },
});
