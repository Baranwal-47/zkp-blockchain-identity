// Encodes CredentialRegistry.acceptAdmin() and proposes it as a Safe
// transaction via safeService.proposeSafeTransaction — this is the FIRST
// real Safe-governed transaction (the registry admin handoff).
//
// MUST run AFTER zk-proofs/scripts/deploySafe.js has:
//   1. Deployed the Safe (3 fresh owner addresses, threshold 2) and set
//      SAFE_ADDRESS in .env.
//   2. Called registry.transferAdmin(SAFE_ADDRESS) from the deployer EOA,
//      so the registry's pendingAdmin == the Safe address.
//
// acceptAdmin() can only succeed when msg.sender === pendingAdmin (the
// Safe itself), so it must be called BY the Safe as a Safe transaction —
// this script only ENCODES the call and PROPOSES it into the Safe
// Transaction Service queue. It does NOT sign with 2 owner keys itself
// (that happens in the browser via MetaMask, per D-01) and it does NOT
// duplicate any Safe.init/createTransaction/apiKit propose logic — all of
// that lives in safeService.js's proposeSafeTransaction primitive (09-02),
// which this script delegates to byte-for-byte.
//
// Usage: node scripts/proposeAcceptAdmin.js
//   (reads SAFE_ADDRESS / REGISTRY_ADDRESS / SAFE_CHAIN_ID / SAFE_API_KEY /
//    SEPOLIA_RPC_URL from .env via dotenv, matching this backend's existing
//    module conventions)

import 'dotenv/config';
import { ethers } from 'ethers';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { proposeSafeTransaction } from '../services/safeService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const registryArtifact = JSON.parse(
  readFileSync(
    join(__dirname, '../../../zk-proofs/artifacts/contracts/CredentialRegistry.sol/CredentialRegistry.json'),
    'utf8'
  )
);

async function main() {
  const registryAddress = process.env.REGISTRY_ADDRESS;
  const safeAddress = process.env.SAFE_ADDRESS;

  if (!registryAddress) {
    throw new Error(
      '[handoff] REGISTRY_ADDRESS is not set in .env — cannot encode acceptAdmin() target.'
    );
  }
  if (!safeAddress) {
    throw new Error(
      '[handoff] SAFE_ADDRESS is not set in .env — run zk-proofs/scripts/deploySafe.js first.'
    );
  }

  const iface = new ethers.Interface(registryArtifact.abi);
  const data = iface.encodeFunctionData('acceptAdmin', []);

  console.log('[handoff] Encoding acceptAdmin() call for registry at', registryAddress);
  console.log('[handoff] Proposing via Safe at', safeAddress, '...');

  const { safeTxHash, status } = await proposeSafeTransaction(registryAddress, data);

  console.log('\n✅ [handoff] acceptAdmin() proposed!');
  console.log('   safeTxHash:', safeTxHash);
  console.log('   status:    ', status);
  console.log(
    '\nNext: open the Pending Approvals UI — this acceptAdmin transaction now appears in the queue.'
  );
  console.log(
    'Sign it with 2 of the 3 owner MetaMask accounts, then click Execute (manual, never auto-fires per D-06).'
  );
  console.log(
    'Once executed, registry.admin() will equal the Safe address — the handoff is complete.'
  );
}

main().catch((error) => {
  console.error('[handoff] Failed to propose acceptAdmin():', error);
  process.exit(1);
});
