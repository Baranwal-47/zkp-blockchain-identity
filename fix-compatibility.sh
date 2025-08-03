#!/bin/bash

# ZKP Identity App - Version Compatibility Fix Script
# Run this script to quickly apply compatible versions

echo "🔧 Starting compatibility fix for ZKP Identity App..."

# Step 1: Backup current state
echo "📦 Creating backup..."
git add .
git commit -m "backup before compatibility fixes - $(date)"

# Step 2: Create new branch
echo "🌿 Creating compatibility fix branch..."
git checkout -b version-compatibility-fix

# Step 3: Remove problematic packages
echo "🗑️  Removing problematic packages..."
npm uninstall react-native-crypto stream-browserify readable-stream events util text-encoding

# Step 4: Downgrade core packages
echo "⬇️  Downgrading core packages..."
npm install react@18.2.0 react-native@0.72.6

# Step 5: Downgrade Expo (careful - this might break things)
echo "⬇️  Downgrading Expo..."
npm install expo@~49.0.0

# Step 6: Fix Expo dependencies
echo "🔧 Fixing Expo dependencies..."
npx expo install --fix

# Step 7: Install compatible versions
echo "⬇️  Installing compatible versions..."
npm install ethers@5.7.2
npm install @metamask/sdk-react-native@0.2.4
npm install @react-navigation/native@6.1.7
npm install @react-navigation/stack@6.3.17
npm install react-native-gesture-handler@2.12.0
npm install react-native-screens@3.22.0
npm install react-native-safe-area-context@4.6.3

# Step 8: Install minimal polyfills
echo "🛡️  Installing minimal polyfills..."
npm install react-native-get-random-values@1.9.0
npm install @craftzdog/react-native-buffer@6.0.5
npm install react-native-url-polyfill@1.3.0

# Step 9: Clean cache
echo "🧹 Cleaning cache..."
npm cache clean --force
npx expo start --clear

echo "✅ Compatibility fix complete!"
echo "📝 Check COMPATIBILITY_REPORT.md for details"
echo "🚀 Try running: npx expo start"
