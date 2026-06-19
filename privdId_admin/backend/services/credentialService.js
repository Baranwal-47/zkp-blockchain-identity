import axios from 'axios';
import { ethers } from 'ethers';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { encryptCredential } from '../crypto/aesgcm.js';

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

async function anchorOnChain(rollNo, cid, merkleRoot) {
  const provider = new ethers.JsonRpcProvider(process.env.SEPOLIA_RPC_URL);
  const wallet = new ethers.Wallet(`0x${process.env.PRIVATE_KEY}`, provider);
  const registry = new ethers.Contract(process.env.REGISTRY_ADDRESS, registryArtifact.abi, wallet);

  // merkleRoot is a decimal string field element — convert to bytes32 (IDENTITY_SPEC §4)
  const pubHashBytes32 = ethers.zeroPadValue(ethers.toBeHex(BigInt(merkleRoot)), 32);

  const tx = await registry.issueCredential(rollNo, cid, pubHashBytes32);
  const receipt = await tx.wait();

  return { txHash: tx.hash, blockNumber: receipt.blockNumber };
}

export async function revokeCredentialOnChain(rollNo) {
  const provider = new ethers.JsonRpcProvider(process.env.SEPOLIA_RPC_URL);
  const wallet = new ethers.Wallet(`0x${process.env.PRIVATE_KEY}`, provider);
  const registry = new ethers.Contract(process.env.REGISTRY_ADDRESS, registryArtifact.abi, wallet);

  const tx = await registry.revokeCredential(rollNo);
  const receipt = await tx.wait();

  console.log(`[credential] Revoked ${rollNo} | Tx: ${tx.hash}`);
  return { txHash: tx.hash, blockNumber: receipt.blockNumber };
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
  const { txHash, blockNumber } = await anchorOnChain(student.rollNo, cid, student.merkleRoot);

  console.log(`[credential] Anchored ${student.rollNo} → IPFS: ${cid} | Tx: ${txHash}`);
  return { cid, txHash, blockNumber };
}
