// Global polyfills for React Native crypto and Web APIs
import 'react-native-get-random-values';
import 'react-native-url-polyfill/auto';

// Buffer polyfill
import { Buffer } from '@craftzdog/react-native-buffer';
global.Buffer = Buffer;

// Stream polyfill
import 'stream-browserify';

// Events polyfill
import 'events';

// Process polyfill
if (typeof global.process === 'undefined') {
  global.process = require('process/browser');
}

// TextEncoder/TextDecoder polyfills
if (typeof global.TextEncoder === 'undefined') {
  const { TextEncoder, TextDecoder } = require('text-encoding');
  global.TextEncoder = TextEncoder;
  global.TextDecoder = TextDecoder;
}

// Crypto polyfill - using a more conservative approach
if (typeof global.crypto === 'undefined') {
  global.crypto = {};
}

// Add getRandomValues if not present
if (!global.crypto.getRandomValues) {
  global.crypto.getRandomValues = require('react-native-get-random-values').getRandomValues;
}
