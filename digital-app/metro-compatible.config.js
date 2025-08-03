const { getDefaultConfig } = require('expo/metro-config');
const config = getDefaultConfig(__dirname);

config.resolver.alias = {
  crypto: require.resolve('react-native-get-random-values'),
  buffer: require.resolve('@craftzdog/react-native-buffer')
};

module.exports = config;
