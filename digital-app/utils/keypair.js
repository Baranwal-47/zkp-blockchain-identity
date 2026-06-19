import { PrivateKey } from 'eciesjs';
import * as SecureStore from 'expo-secure-store';

// Storage key for the on-device secp256k1 private key (Keystore/Keychain-backed via
// expo-secure-store). Never read this value into a log statement or network call.
const PRIVATE_KEY_STORAGE_KEY = 'privid_student_privkey';

/**
 * Generates a secp256k1 keypair on-device, persists the private key to SecureStore
 * BEFORE returning (D-02), and returns ONLY the public key hex. The private key is
 * never returned, logged, or transmitted.
 *
 * @returns {Promise<{ pubKeyHex: string }>}
 */
export async function generateAndStoreKeypair() {
  const priv = new PrivateKey();
  const privKeyHex = priv.toHex();
  const pubKeyHex = priv.publicKey.toHex();

  // Write the private key to secure storage before returning anything to the caller.
  await SecureStore.setItemAsync(PRIVATE_KEY_STORAGE_KEY, privKeyHex);

  return { pubKeyHex };
}

/**
 * Re-derives the public key hex from the already-stored private key, for the claim
 * retry path. NEVER generates a new keypair — if no key is stored, this throws.
 *
 * @returns {Promise<string>} pubKeyHex (33-byte compressed secp256k1 public key, hex)
 */
export async function getStoredPublicKeyHexForRetry() {
  const privKeyHex = await SecureStore.getItemAsync(PRIVATE_KEY_STORAGE_KEY);

  if (!privKeyHex) {
    throw new Error('No stored private key found for retry');
  }

  return PrivateKey.fromHex(privKeyHex).publicKey.toHex();
}
