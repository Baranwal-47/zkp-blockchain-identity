import 'react-native-get-random-values'; // MUST stay first: polyfills crypto.getRandomValues before any eciesjs/ethers import
global.Buffer = global.Buffer || require('buffer').Buffer; // Hermes has no global Buffer; dek.js/credentialCrypto.js rely on it

import { registerRootComponent } from 'expo';

import App from './App';

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(App);
