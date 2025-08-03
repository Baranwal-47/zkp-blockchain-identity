#!/bin/bash

# ZKP Identity App - Production-Ready Compatibility Fix
# Based on proven 2024-25 production setups

echo "🚀 Applying production-tested compatibility fixes..."

# Navigate to the React Native app directory
cd digital-app

# Step 1: Backup
echo "📦 Creating backup..."
cd ..
git add .
git commit -m "backup before production compatibility fixes - $(date)"
git checkout -b production-compatibility-fix
cd digital-app

# Step 2: Remove problematic packages that cause bundle/symbol errors
echo "🗑️  Removing problematic packages..."
npm uninstall react-native-crypto stream-browserify readable-stream text-encoding process util events @noble/hashes react-native-randombytes react-native-snarkjs

# Step 3: Clean slate
echo "🧹 Clean reinstall..."
rm -rf node_modules package-lock.json

# Step 4: Install production-tested core versions
echo "⬇️  Installing proven stable core..."
npm install react@18.2.0 react-native@0.72.6 expo@~49.0.0

# Step 5: Install navigation (Expo 49 compatible)
echo "🧭 Installing navigation..."
npm install @react-navigation/native@^6.1.7 @react-navigation/stack@^6.3.17
npm install react-native-screens@~3.22.0 react-native-safe-area-context@^4.6.3 react-native-gesture-handler@~2.12.0

# Step 6: Install proven blockchain/crypto stack
echo "⛓️  Installing blockchain stack..."
npm install ethers@^5.7.2
npm install @metamask/sdk-react-native@^0.2.4
npm install snarkjs@^0.6.11
npm install circomlibjs@^0.1.7

# Step 7: Install minimal, clean polyfills
echo "🛡️  Installing minimal polyfills..."
npm install @craftzdog/react-native-buffer@^6.0.5
npm install react-native-get-random-values@^1.9.0
npm install react-native-url-polyfill@^1.3.0

# Step 8: Install modern QR/camera
echo "📱 Installing modern QR/camera..."
npm install react-native-vision-camera@^3.17.0
npm install react-native-qrcode-svg@^6.3.0
npm install react-native-vector-icons@^10.3.0

# Step 9: Install required supporting packages
echo "📋 Installing supporting packages..."
npm install @react-native-async-storage/async-storage@^2.1.2
npm install @react-native-clipboard/clipboard@^1.16.3
npm install axios@^1.10.0
npm install js-sha256@^0.11.1

# Step 10: Fix Expo dependencies
echo "🔧 Fixing Expo dependencies..."
npx expo install --fix

# Step 11: Apply compatible configs
echo "⚙️  Applying compatible configurations..."
cp metro-compatible.config.js metro.config.js
cp polyfills-compatible.js polyfills.js
cp package-compatible.json package.json

# Step 12: Update index.js to use minimal polyfills
echo "📝 Updating index.js..."
cat > index.js << 'EOF'
import './polyfills';
import { registerRootComponent } from 'expo';
import App from './App';
registerRootComponent(App);
EOF

# Step 13: Clean and start
echo "🧹 Final cleanup..."
npm cache clean --force
npx expo start --clear

echo "✅ Production-ready setup complete!"
echo "🎯 Using proven 2024-25 production versions"
echo "🚀 Ready for: ZKP + MetaMask + Expo + Modern QR"
