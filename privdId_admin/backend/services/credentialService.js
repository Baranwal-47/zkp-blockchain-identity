import axios from 'axios';
import { ethers } from 'ethers';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { encryptCredential } from '../crypto/aesgcm.js';
import { proposeRegistryWrite } from './safeService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const registryArtifact = JSON.parse(
  readFileSync(
    join(__dirname, '../../../zk-proofs/artifacts/contracts/CredentialRegistry.sol/CredentialRegistry.json'),
    'utf8'
  )
);

async function pinToIPFS(credential, pinName) {
  const response = await axios.post(
    'https://api.pinata.cloud/pinning/pinJSONToIPFS',
    {
      pinataContent: credential,
      pinataMetadata: { name: `privid-ciphertext-${pinName}` },
    },
    {
      headers: {
        Authorization: `Bearer ${process.env.PINATA_JWT}`,
        'Content-Type': 'application/json',
      },
    }
  );
  return response.data.IpfsHash;
}

// Phase 7 (ENROLL-02): pins the ECIES-wrapped DEK envelope produced by
// crypto/ecies.js::wrapDEK to IPFS, reusing the existing pinToIPFS Pinata
// call rather than duplicating the axios POST. pinName follows the same
// `privid-ciphertext-${pinName}` Pinata metadata naming convention as the
// credential ciphertext pin (caller passes the student's rollNo).
export async function pinEnvelopeToIPFS(envelopeBase64, pinName) {
  return pinToIPFS({ dekEnvelope: envelopeBase64 }, pinName);
}

export async function revokeCredentialOnChain(rollNo) {
  // GOV-02/GOV-03 (D-12): no single backend key may mutate registry state.
  // Propose the revocation through the Safe 2-of-3 flow instead of signing
  // directly with PRIVATE_KEY. Terminal "revoked" state is set only once the
  // proposal is executed (09-03's execute-confirmation path).
  const { safeTxHash, status } = await proposeRegistryWrite('revokeCredential', [rollNo]);

  console.log(`[credential] Proposed revoke for ${rollNo} | safeTxHash: ${safeTxHash}`);
  return { safeTxHash, status };
}

export function buildCredentialJson(student) {
  // WR-03: guard against pinning a permanently-unverifiable credential —
  // salts/merkleRoot must reflect a fully-computed 7-attribute commitment.
  if (!Array.isArray(student.salts) || student.salts.length !== 7) {
    throw new Error(`buildCredentialJson: expected 7 salts, got ${student.salts?.length}`);
  }
  if (!student.merkleRoot) {
    throw new Error('buildCredentialJson: merkleRoot is missing');
  }
  return {
    name: student.name,
    rollNo: student.rollNo,
    dobInt: student.dobInt,
    programmeLevel: student.programmeLevel,
    discipline: student.discipline,
    batch: student.batch,
    email: student.email,
    salts: student.salts,
    merkleRoot: student.merkleRoot,
    issuedAt: new Date().toISOString(),
    issuer: 'PrivdID — IIITDM Jabalpur',
    type: 'StudentIdentityCredential',
    version: '2.0',
  };
}

export async function issueCredentialOnChain(student, dek) {
  const credentialJson = buildCredentialJson(student);
  const encryptedBlob = await encryptCredential(credentialJson, dek);
  const cid = await pinToIPFS(encryptedBlob, student.rollNo);

  // merkleRoot is a decimal string field element — convert to bytes32 (IDENTITY_SPEC §4)
  const pubHashBytes32 = ethers.zeroPadValue(ethers.toBeHex(BigInt(student.merkleRoot)), 32);

  // GOV-02/GOV-03 (D-12): propose through the Safe 2-of-3 flow instead of
  // signing directly with PRIVATE_KEY. Terminal on-chain state (onChainTxHash/
  // onChainBlock) is set only once the proposal is executed (09-03).
  const { safeTxHash, status } = await proposeRegistryWrite('issueCredential', [
    student.rollNo,
    cid,
    pubHashBytes32,
  ]);

  console.log(`[credential] Proposed issue for ${student.rollNo} → IPFS: ${cid} | safeTxHash: ${safeTxHash}`);
  return { cid, safeTxHash, status };
}
