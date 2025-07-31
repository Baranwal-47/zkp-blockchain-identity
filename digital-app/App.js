import React, { useState } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import IdentityForm from './screens/IdentityForm';
import LoadingScreen from './screens/LoadingScreen';
import ShowProof from './screens/ShowProof';
import VerifyProof from './screens/VerifyProof';
import ErrorScreen from './screens/ErrorScreen';
import QRScannerScreen from './screens/QRScannerScreen';
import ManualQRInput from './screens/ManualQRInput';
import sha256 from 'js-sha256';

const Stack = createStackNavigator();

function poseidonHash(str) {
  return BigInt('0x' + sha256(str));
}

export default function App() {
  const [proofData, setProofData] = useState(null);

  const screenOptions = {
    headerStyle: {
      backgroundColor: '#3b82f6',
      elevation: 0,
      shadowOpacity: 0,
      height: 80, // Customize header height
    },
    headerTintColor: '#ffffff',
    headerTitleStyle: {
      fontWeight: 'bold',
      fontSize: 18,
    },
    headerTitleContainerStyle: {
      paddingTop: 20, // Move title container down
    },
    headerLeftContainerStyle: {
      paddingTop: 20, // Move back button down to align with title
    },
    headerRightContainerStyle: {
      paddingTop: 20, // Move right buttons down (if any)
    },
    headerBackTitleVisible: false,
    headerStatusBarHeight: 0, // Remove extra status bar spacing
  };

  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={screenOptions}>
        <Stack.Screen 
          name="IdentityForm" 
          component={IdentityForm}
          options={{ 
            title: 'Digital Identification System',
            headerLeft: null, // Remove back button on home screen
            headerTitleStyle: {
              fontWeight: 'bold',
              fontSize: 20,
              textAlignVertical: 'center',
            },
            headerTitleAlign: 'left',
          }}
        />
        
        <Stack.Screen 
          name="LoadingScreen" 
          component={LoadingScreen}
          options={{ 
            title: 'Generating Proof',
            headerLeft: null, // Prevent going back during proof generation
            gestureEnabled: false, // Disable swipe to go back
          }}
        />
        
        <Stack.Screen 
          name="ShowProof" 
          component={ShowProof}
          options={{ 
            title: 'Your Proof',
            headerLeft: null, // Custom navigation handled in component
          }}
        />
        
        <Stack.Screen 
          name="VerifyProof" 
          component={VerifyProof}
          options={{ 
            title: 'Verify Proof',
          }}
        />
        
        <Stack.Screen 
          name="ErrorScreen" 
          component={ErrorScreen}
          options={{ 
            title: 'Error',
            headerLeft: null,
          }}
        />
        
        <Stack.Screen 
          name="QRScannerScreen" 
          component={QRScannerScreen}
          options={{ 
            title: 'Scan QR Code',
            headerStyle: {
              backgroundColor: 'transparent',
              elevation: 0,
              shadowOpacity: 0,
            },
            headerTintColor: '#ffffff',
            headerTransparent: true,
          }}
        />
        
        <Stack.Screen 
          name="ManualQRInput" 
          component={ManualQRInput}
          options={{ 
            title: 'Manual Input',
          }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
