import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';

import HomeScreen from './screens/HomeScreen';
import LoginScreen from './screens/LoginScreen';
import ClaimCredentialScreen from './screens/ClaimCredentialScreen';
import StudentProfileScreen from './screens/StudentProfileScreen';
import IdentityForm from './screens/IdentityForm';
import LoadingScreen from './screens/LoadingScreen';
import ShowProof from './screens/ShowProof';
import VerifyProof from './screens/VerifyProof';
import ErrorScreen from './screens/ErrorScreen';
import QRScannerScreen from './screens/QRScannerScreen';
import ManualQRInput from './screens/ManualQRInput';

// Admin screens
import AdminLoginScreen from './screens/admin/AdminLoginScreen';
import AdminDashboardScreen from './screens/admin/AdminDashboardScreen';
import AdminAddStudentScreen from './screens/admin/AdminAddStudentScreen';
import AdminEditStudentScreen from './screens/admin/AdminEditStudentScreen';
import AdminUploadScreen from './screens/admin/AdminUploadScreen';

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
      <Stack.Navigator screenOptions={defaultHeaderStyle}>
        {/* ── Home ── */}
        <Stack.Screen
          name="HomeScreen"
          component={HomeScreen}
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
        <Stack.Screen
          name="StudentProfile"
          component={StudentProfileScreen}
          options={{ title: 'Your Identity' }}
        />

        {/* ── Manual Identity Flow (original) ── */}
        <Stack.Screen
          name="IdentityForm"
          component={IdentityForm}
          options={{
            title: 'Digital Identification System',
            headerLeft: null,
            headerTitleStyle: { fontWeight: 'bold', fontSize: 20 },
            headerTitleAlign: 'left',
          }}
        />

        {/* ── Shared Proof Screens ── */}
        <Stack.Screen
          name="LoadingScreen"
          component={LoadingScreen}
          options={{
            title: 'Generating Proof',
            headerLeft: null,
            gestureEnabled: false,
          }}
        />
        <Stack.Screen
          name="ShowProof"
          component={ShowProof}
          options={{ title: 'Your Proof', headerLeft: null }}
        />
        <Stack.Screen
          name="VerifyProof"
          component={VerifyProof}
          options={{ title: 'Verify Proof' }}
        />
        <Stack.Screen
          name="ErrorScreen"
          component={ErrorScreen}
          options={{ title: 'Error', headerLeft: null }}
        />
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
        <Stack.Screen
          name="ManualQRInput"
          component={ManualQRInput}
          options={{ title: 'Manual Input' }}
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
