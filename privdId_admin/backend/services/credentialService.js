import axios from 'axios';
import { ethers } from 'ethers';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { encryptCredential } from '../crypto/aesgcm.js';
import { timed } from '../utils/timing.js';
import { reportGas } from '../utils/gas.js';

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

// Encrypt the credential JSON with the DEK and pin the ciphertext to IPFS.
// Returns the ciphertext CID. Kept separate from the on-chain anchor so the
// caller can persist DEK + CID BEFORE (and independently of) the chain write —
// a chain-write failure must never discard the encrypted/pinned credential.
export async function encryptAndPinCredential(student, dek) {
  const credentialJson = buildCredentialJson(student);
  const encryptedBlob = await encryptCredential(credentialJson, dek); // prints [perf] encryptCredential
  // blueprint §10: measure every crypto/IO step — pin to IPFS is a network op.
  const { out: cid } = await timed('pinCiphertextToIPFS', () => pinToIPFS(encryptedBlob, student.rollNo));
  return cid;
}

// Routine issuance is a DIRECT on-chain write signed by the issuer EOA
// (acad-admin backend key). Only revocation/governance goes through the Safe
// 2-of-3 (proposed from the official's MetaMask, executed via safeController).
// The registry's issueCredential is onlyIssuer; the Safe is admin, not issuer.
export async function anchorCredentialOnChain(student, cid) {
  // merkleRoot is a decimal string field element — convert to bytes32 (IDENTITY_SPEC §4)
  const pubHashBytes32 = ethers.zeroPadValue(ethers.toBeHex(BigInt(student.merkleRoot)), 32);

  const provider = new ethers.JsonRpcProvider(process.env.SEPOLIA_RPC_URL);
  const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);
  const registry = new ethers.Contract(process.env.REGISTRY_ADDRESS, registryArtifact.abi, wallet);

  // blueprint §10: time the on-chain issuance (tx broadcast + mining wait).
  const { out: receipt } = await timed('issueCredentialOnChain', async () => {
    const tx = await registry.issueCredential(student.rollNo, cid, pubHashBytes32);
    return tx.wait();
  });

  const gas = reportGas(`issueCredential ${student.rollNo}`, receipt);

  console.log(`[credential] Issued ${student.rollNo} → IPFS: ${cid} | tx: ${receipt.hash}`);
  return { txHash: receipt.hash, blockNumber: receipt.blockNumber, gas };
}

// Convenience one-shot (bulk/update paths): encrypt+pin then anchor directly.
export async function issueCredentialOnChain(student, dek) {
  const cid = await encryptAndPinCredential(student, dek);
  const { txHash, blockNumber } = await anchorCredentialOnChain(student, cid);
  return { cid, txHash, blockNumber };
}
