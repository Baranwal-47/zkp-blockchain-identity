import { ethers } from 'ethers';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import Safe from '@safe-global/protocol-kit';
import SafeApiKit from '@safe-global/api-kit';
import Student from '../models/Student.js';
import DismissedTx from '../models/DismissedTx.js';
import { reportGas } from '../utils/gas.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export async function dismissSafeTx(safeTxHash) {
  await DismissedTx.findOneAndUpdate({ safeTxHash }, { safeTxHash }, { upsert: true });
  console.log(`[safe] dismissed ${safeTxHash.slice(0, 10)}… persisted to DB`);
}

const registryArtifact = JSON.parse(
  readFileSync(
    join(__dirname, '../../../zk-proofs/artifacts/contracts/CredentialRegistry.sol/CredentialRegistry.json'),
    'utf8'
  )
);

// Constructed lazily (not at module load) so importing this module never
// crashes the backend before SAFE_ADDRESS/SAFE_API_KEY are configured —
// credentialService.js imports this module at the top level, which is in
// turn imported by studentService.js, so an eager throw here would take
// down the whole server on boot (Rule 3 fix: discovered at runtime —
// SafeApiKit v4.2.0 requires `apiKey` unless a custom `txServiceUrl` is
// supplied, since it otherwise targets the official api.safe.global service).
let _apiKit = null;
function getApiKit() {
  if (!_apiKit) {
    const chainId = BigInt(process.env.SAFE_CHAIN_ID || 11155111);
    const apiKey = process.env.SAFE_API_KEY;
    if (!apiKey) {
      throw new Error(
        '[safe] SAFE_API_KEY is not configured. Obtain one at https://developer.safe.global and set it in .env.'
      );
    }
    _apiKit = new SafeApiKit({ chainId, apiKey });
  }
  return _apiKit;
}

// D-01/D-03: the backend never holds an official's private key. In production
// (Sepolia) the proposer signature must be relayed in from the caller's
// MetaMask session. USE_LOCAL_SIGNERS is a local-Hardhat-only escape hatch
// for dev/testing and is hard-gated off whenever NODE_ENV === 'production'
// (RESEARCH Security Domain Information-Disclosure mitigation, T-09-06).
function localSignerEnabled() {
  return process.env.USE_LOCAL_SIGNERS === 'true' && process.env.NODE_ENV !== 'production';
}

function resolveProvider() {
  return process.env.SEPOLIA_RPC_URL;
}

function resolveSigner(externalSigner) {
  if (externalSigner) return externalSigner;
  if (localSignerEnabled() && process.env.SAFE_LOCAL_SIGNER_KEY) {
    return process.env.SAFE_LOCAL_SIGNER_KEY;
  }
  throw new Error(
    '[safe] No signer available — pass a MetaMask-relayed signer/signature, or set USE_LOCAL_SIGNERS=true with SAFE_LOCAL_SIGNER_KEY for local dev only.'
  );
}

// NOTE: routine issuance is now a DIRECT issuer-EOA write (credentialService),
// and revocation is proposed from the official's MetaMask via
// buildUnsignedRegistryTx + relayProposal (below). The old server-side
// proposeSafeTransaction/proposeRegistryWrite primitives (which signed with a
// backend key) were removed — D-01/D-03: the backend never holds an owner key.

// Registry function whitelist for browser-driven proposals — keeps the
// propose-build endpoint from encoding arbitrary calldata.
const PROPOSABLE_ACTIONS = {
  revoke: { fnName: 'revokeCredential', argCount: 1 },
  acceptAdmin: { fnName: 'acceptAdmin', argCount: 0 },
  updateCredential: { fnName: 'updateCredential', argCount: 3 },
};

/**
 * D-01/D-03: build an UNSIGNED registry Safe tx so the proposer's MetaMask (not
 * a backend key) produces the signature. Returns the SafeTx data + hash; the
 * frontend signs the hash (EIP-712) and posts it back to relayProposal. The
 * init signer here is only to satisfy protocol-kit — it never signs.
 */
export async function buildUnsignedRegistryTx(fnName, args) {
  const provider = resolveProvider();
  const safeAddress = process.env.SAFE_ADDRESS;
  const protocolKit = await Safe.init({ provider, signer: process.env.PRIVATE_KEY, safeAddress });

  const iface = new ethers.Interface(registryArtifact.abi);
  const data = iface.encodeFunctionData(fnName, args);

  const safeTransaction = await protocolKit.createTransaction({
    transactions: [{ to: process.env.REGISTRY_ADDRESS, value: '0', data }],
  });
  const safeTxHash = await protocolKit.getTransactionHash(safeTransaction);

  return { safeTransactionData: safeTransaction.data, safeTxHash, safe: safeAddress };
}

export { PROPOSABLE_ACTIONS };

/**
 * Relay a MetaMask-signed proposal (proposer's first confirmation) to the Safe
 * Tx Service. senderSignature comes from the caller's MetaMask, NOT a backend key.
 */
export async function relayProposal({ safeTransactionData, safeTxHash, senderAddress, senderSignature }) {
  try {
    await getApiKit().proposeTransaction({
      safeAddress: process.env.SAFE_ADDRESS,
      safeTransactionData,
      safeTxHash,
      // Safe Tx Service requires an EIP-55 checksummed sender; MetaMask hands
      // back a lowercase address, which the service rejects ("not checksumed").
      senderAddress: ethers.getAddress(senderAddress),
      senderSignature,
    });
  } catch (err) {
    // api-kit's HttpError keeps the full JSON body on err.data (NOT
    // err.response.data) and falls back to the bare status text for
    // field-specific errors. Surface the whole body so we see the real reason.
    const body = err?.data ?? err?.response?.data;
    const detail =
      (body && typeof body === 'object' ? JSON.stringify(body) : null) ||
      (typeof body === 'string' ? body : null) ||
      err?.message ||
      'Safe service rejected the proposal.';
    console.error('[safe] proposeTransaction failed:', detail);
    throw new Error(`Safe propose failed: ${detail}`);
  }
  console.log(`[safe] Relayed MetaMask proposal | safeTxHash: ${safeTxHash} | proposer: ${senderAddress}`);
  return { safeTxHash, status: 'pending' };
}

/**
 * Second (and subsequent) official confirms an already-proposed Safe tx.
 */
export async function confirmSignature(safeTxHash, signature, signerAddress) {
  const result = await getApiKit().confirmTransaction(safeTxHash, signature);
  console.log(`[safe] Confirmed ${safeTxHash} | signer: ${signerAddress}`);
  return result;
}

/**
 * Explicit execute step (D-06: never auto-fired on threshold met). Returns
 * the on-chain txHash + blockNumber from the receipt so callers (09-03's
 * executePendingTx) can persist terminal state.
 */
export async function executeTransaction(safeTxHash, externalSigner) {
  const provider = resolveProvider();
  const signer = resolveSigner(externalSigner);
  const safeAddress = process.env.SAFE_ADDRESS;

  const protocolKit = await Safe.init({ provider, signer, safeAddress });
  const txToExecute = await getApiKit().getTransaction(safeTxHash);

  // Bump fees ~2x above current network so the execute mines promptly on
  // Sepolia instead of getting stuck underpriced in the mempool (which blocks
  // the executor's nonce and breaks subsequent executes).
  const ethersProvider = new ethers.JsonRpcProvider(process.env.SEPOLIA_RPC_URL);
  const fee = await ethersProvider.getFeeData();
  const options = {};
  if (fee.maxFeePerGas) options.maxFeePerGas = (fee.maxFeePerGas * 2n).toString();
  if (fee.maxPriorityFeePerGas) options.maxPriorityFeePerGas = (fee.maxPriorityFeePerGas * 2n).toString();

  const executeResult = await protocolKit.executeTransaction(txToExecute, options);
  const receipt = await executeResult.transactionResponse?.wait?.();

  const txHash = receipt?.hash ?? executeResult.transactionResponse?.hash ?? null;
  // protocol-kit v7 (viem) returns blockNumber as a BigInt — coerce to Number so
  // the controller's res.json() doesn't throw "Do not know how to serialize a BigInt".
  const blockNumber = receipt?.blockNumber != null ? Number(receipt.blockNumber) : null;

  const gas = reportGas(`safeExecute ${safeTxHash.slice(0, 10)}`, receipt);

  console.log(`[safe] Executed ${safeTxHash} | Tx: ${txHash}`);
  return { safeTxHash, txHash, blockNumber, gas, status: 'executed' };
}

/**
 * Pending-approvals read path (GOV-04 / D-07 dashboard indicator). threshold
 * lives on the Safe (getSafeInfo), NOT on the individual transaction object
 * (RESEARCH Pitfall 3) — fetch it once and decorate each pending tx with it.
 */
export async function getPendingTransactions() {
  const safeAddress = process.env.SAFE_ADDRESS;
  const safeInfo = await getApiKit().getSafeInfo(safeAddress);
  const pending = await getApiKit().getPendingTransactions(safeAddress);

  const threshold = safeInfo.threshold;
  const dismissedDocs = await DismissedTx.find().select('safeTxHash').lean();
  const dismissedSet = new Set(dismissedDocs.map((d) => d.safeTxHash));
  const validTargets = new Set([
    process.env.REGISTRY_ADDRESS?.toLowerCase(),
    process.env.SAFE_ADDRESS?.toLowerCase(),
  ]);
  const rawResults = (pending.results || [])
    .filter((t) => !dismissedSet.has(t.safeTxHash))
    .filter((t) => !t.to || validTargets.has(t.to.toLowerCase()));

  // Join with Student so the approver UI can show human-readable action info
  // (rollNo + revoke/issue) — the Safe Tx Service only returns raw calldata.
  const hashes = rawResults.map((t) => t.safeTxHash);
  const students = await Student.find({ 'pendingRegistryAction.safeTxHash': { $in: hashes } })
    .select('rollNo pendingRegistryAction');
  const byHash = new Map(students.map((s) => [s.pendingRegistryAction.safeTxHash, s]));

  const results = rawResults.map((tx) => {
    const confirmedSigners = (tx.confirmations || []).map((c) => c.owner);
    const signedCount = confirmedSigners.length;
    const student = byHash.get(tx.safeTxHash);
    return {
      ...tx,
      confirmedSigners,
      signedCount,
      awaiting: threshold - signedCount,
      rollNo: student?.rollNo ?? null,
      type: student?.pendingRegistryAction?.type ?? null,
    };
  });

  console.log(`[safe] ${results.length} pending tx(s) | threshold: ${threshold}`);
  return { threshold, results };
}
