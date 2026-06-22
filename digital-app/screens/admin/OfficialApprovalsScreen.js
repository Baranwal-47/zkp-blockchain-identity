import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Alert,
} from 'react-native';
import { ADMIN_BACKEND_URL } from '../../environment';

const ROLE_LABELS = { acadadmin: 'Academic Admin', registrar: 'Assistant Registrar', dean: 'Dean' };
const TYPE_LABEL = { issue: 'Issue', revoke: 'Revoke' };

export default function OfficialApprovalsScreen({ route, navigation }) {
  const { token, role } = route.params || {};
  const [pending, setPending] = useState([]);
  const [threshold, setThreshold] = useState(2);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    try {
      const response = await fetch(`${ADMIN_BACKEND_URL}/api/safe/pending`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'Failed to load approvals');
      setPending(data.pending || []);
      if (data.threshold) setThreshold(data.threshold);
    } catch (error) {
      Alert.alert('Error', error.message || 'Could not load approvals');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [token]);

  useEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <TouchableOpacity onPress={handleLogout} style={styles.logoutBtn}>
          <Text style={styles.logoutText}>Logout</Text>
        </TouchableOpacity>
      ),
    });
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleLogout = () => {
    navigation.reset({ index: 0, routes: [{ name: 'WelcomeScreen' }] });
  };

  const renderItem = ({ item }) => {
    const signed = item.signedCount ?? 0;
    const ready = signed >= threshold;
    return (
      <View style={styles.card}>
        <Text style={styles.cardTitle}>
          {TYPE_LABEL[item.type] || 'Registry action'} — {item.rollNo || item.safeTxHash}
        </Text>
        <Text style={[styles.badge, ready ? styles.badgeReady : styles.badgeWaiting]}>
          {ready ? `Ready to execute — ${signed} of ${threshold}` : `Awaiting ${threshold - signed} more signature(s)`}
        </Text>
      </View>
    );
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#3b82f6" />
        <Text style={styles.loadingText}>Loading approvals...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.noticeBox}>
        <Text style={styles.noticeTitle}>Signed in as {ROLE_LABELS[role] || role}</Text>
        <Text style={styles.noticeText}>
          This is a read-only view of pending registry actions. To approve, open the PrivdID admin
          web portal in a desktop browser, sign in as {ROLE_LABELS[role] || role}, connect your
          MetaMask wallet, and confirm the signature there.
        </Text>
      </View>

      <FlatList
        data={pending}
        keyExtractor={(item) => item.safeTxHash}
        renderItem={renderItem}
        contentContainerStyle={{ padding: 16 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} />}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Text style={styles.emptyIcon}>✅</Text>
            <Text style={styles.emptyTitle}>No pending approvals</Text>
            <Text style={styles.emptyText}>Nothing is awaiting your signature right now.</Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f172a' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#0f172a' },
  loadingText: { marginTop: 12, color: '#94a3b8' },
  noticeBox: {
    backgroundColor: 'rgba(59,130,246,0.1)',
    margin: 16,
    marginBottom: 0,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(59,130,246,0.25)',
  },
  noticeTitle: { fontSize: 15, fontWeight: '700', color: '#bfdbfe', marginBottom: 6 },
  noticeText: { fontSize: 13, color: '#94a3b8', lineHeight: 19 },
  card: {
    backgroundColor: 'rgba(30,41,59,0.8)',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.12)',
  },
  cardTitle: { fontSize: 14, fontWeight: '600', color: '#f8fafc', marginBottom: 8 },
  badge: {
    alignSelf: 'flex-start',
    fontSize: 12,
    fontWeight: '600',
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 999,
    overflow: 'hidden',
  },
  badgeReady: { backgroundColor: 'rgba(16,185,129,0.15)', color: '#6ee7b7' },
  badgeWaiting: { backgroundColor: 'rgba(245,158,11,0.15)', color: '#fcd34d' },
  emptyState: { alignItems: 'center', paddingTop: 60 },
  emptyIcon: { fontSize: 48, marginBottom: 12 },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: '#f8fafc' },
  emptyText: { fontSize: 13, color: '#94a3b8', marginTop: 4 },
  logoutBtn: { paddingHorizontal: 14, paddingVertical: 6 },
  logoutText: { color: '#f8fafc', fontWeight: '600', fontSize: 14 },
});
