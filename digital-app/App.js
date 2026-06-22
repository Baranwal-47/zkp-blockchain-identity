import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';

import WelcomeScreen from './screens/WelcomeScreen';
import LoginScreen from './screens/LoginScreen';
import ClaimCredentialScreen from './screens/ClaimCredentialScreen';
import DashboardScreen from './screens/DashboardScreen';
import ViewCredentialsScreen from './screens/ViewCredentialsScreen';
import GenerateProofScreen from './screens/GenerateProofScreen';
import VerifyProofScreen from './screens/VerifyProofScreen';
import QRScannerScreen from './screens/QRScannerScreen';

// Admin screens
import AdminLoginScreen from './screens/admin/AdminLoginScreen';
import AdminDashboardScreen from './screens/admin/AdminDashboardScreen';
import AdminAddStudentScreen from './screens/admin/AdminAddStudentScreen';
import AdminEditStudentScreen from './screens/admin/AdminEditStudentScreen';
import AdminUploadScreen from './screens/admin/AdminUploadScreen';
import OfficialApprovalsScreen from './screens/admin/OfficialApprovalsScreen';

const Stack = createStackNavigator();

const defaultHeaderStyle = {
  headerStyle: {
    backgroundColor: '#3b82f6',
    elevation: 0,
    shadowOpacity: 0,
    height: 80,
  },
  headerTintColor: '#ffffff',
  headerTitleStyle: {
    fontWeight: 'bold',
    fontSize: 18,
  },
  headerTitleContainerStyle: { paddingTop: 20 },
  headerLeftContainerStyle: { paddingTop: 20 },
  headerRightContainerStyle: { paddingTop: 20 },
  headerBackTitleVisible: false,
  headerStatusBarHeight: 0,
};

const adminHeaderStyle = {
  headerStyle: {
    backgroundColor: '#1e293b',
    elevation: 0,
    shadowOpacity: 0,
    height: 80,
  },
  headerTintColor: '#f8fafc',
  headerTitleStyle: {
    fontWeight: 'bold',
    fontSize: 18,
  },
  headerTitleContainerStyle: { paddingTop: 20 },
  headerLeftContainerStyle: { paddingTop: 20 },
  headerRightContainerStyle: { paddingTop: 20 },
  headerBackTitleVisible: false,
  headerStatusBarHeight: 0,
};

export default function App() {
  return (
    <NavigationContainer>
      <Stack.Navigator initialRouteName="WelcomeScreen" screenOptions={defaultHeaderStyle}>
        {/* ── Entry Point ── */}
        <Stack.Screen
          name="WelcomeScreen"
          component={WelcomeScreen}
          options={{ headerShown: false }}
        />

        {/* ── Student Login Flow ── */}
        <Stack.Screen
          name="LoginScreen"
          component={LoginScreen}
          options={{ title: 'Student Login' }}
        />
        <Stack.Screen
          name="ClaimCredentialScreen"
          component={ClaimCredentialScreen}
          options={{ title: 'Claim Your Credential', headerLeft: null, gestureEnabled: false }}
        />

        {/* ── Daily Access Flow (Phase 8) ── */}
        <Stack.Screen
          name="DashboardScreen"
          component={DashboardScreen}
          options={{ title: 'Dashboard', headerLeft: null, gestureEnabled: false }}
        />
        <Stack.Screen
          name="ViewCredentialsScreen"
          component={ViewCredentialsScreen}
          options={{ title: 'Your Credentials' }}
        />
        <Stack.Screen
          name="GenerateProofScreen"
          component={GenerateProofScreen}
          options={{ title: 'Generate Proof' }}
        />
        <Stack.Screen
          name="VerifyProofScreen"
          component={VerifyProofScreen}
          options={{ title: 'Verify Proof' }}
        />

        {/* ── Shared Utility Screens ── */}
        <Stack.Screen
          name="QRScannerScreen"
          component={QRScannerScreen}
          options={{
            title: 'Scan QR Code',
            headerStyle: { backgroundColor: 'transparent', elevation: 0, shadowOpacity: 0 },
            headerTintColor: '#ffffff',
            headerTransparent: true,
          }}
        />
        {/* ── Admin Screens ── */}
        <Stack.Screen
          name="AdminLogin"
          component={AdminLoginScreen}
          options={{ ...adminHeaderStyle, title: 'Admin Access', headerShown: false }}
        />
        <Stack.Screen
          name="AdminDashboard"
          component={AdminDashboardScreen}
          options={{ ...adminHeaderStyle, title: 'Student Management', headerLeft: null }}
        />
        <Stack.Screen
          name="OfficialApprovals"
          component={OfficialApprovalsScreen}
          options={{ ...adminHeaderStyle, title: 'Pending Approvals', headerLeft: null }}
        />
        <Stack.Screen
          name="AdminAddStudent"
          component={AdminAddStudentScreen}
          options={{ ...adminHeaderStyle, title: 'Add Student' }}
        />
        <Stack.Screen
          name="AdminEditStudent"
          component={AdminEditStudentScreen}
          options={{ ...adminHeaderStyle, title: 'Edit Student' }}
        />
        <Stack.Screen
          name="AdminUpload"
          component={AdminUploadScreen}
          options={{ ...adminHeaderStyle, title: 'Bulk Add Students' }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
