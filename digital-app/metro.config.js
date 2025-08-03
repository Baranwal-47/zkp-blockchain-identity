const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Add polyfills for crypto and Node.js modules needed by ethers.js and MetaMask SDK
config.resolver.alias = {
  ...config.resolver.alias,
  crypto: 'react-native-crypto',
  stream: 'stream-browserify',
  buffer: '@craftzdog/react-native-buffer',
  url: 'react-native-url-polyfill',
  events: 'events',
  util: 'util',
};

// Enable support for .cjs files (needed by some ethers.js dependencies)
config.resolver.sourceExts = [...config.resolver.sourceExts, 'cjs'];

// Polyfill Node.js modules for React Native
config.resolver.platforms = ['native', 'web', 'default'];

module.exports = config;
