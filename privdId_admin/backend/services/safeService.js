import { ethers } from 'ethers';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import Safe from '@safe-global/protocol-kit';
import SafeApiKit from '@safe-global/api-kit';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

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

/**
 * Generic Safe-transaction propose primitive. Wraps an arbitrary `{ to, data }`
 * call in a SafeTransaction, signs it with the supplied (or local-dev-only)
 * signer, and proposes it to the Safe Transaction Service.
 *
 * This is the SINGLE place the Safe.init/createTransaction/apiKit.proposeTransaction
 * sequence lives — proposeRegistryWrite (below) and the 09-05 acceptAdmin-handoff
 * script both delegate to this primitive rather than duplicating propose logic.
 */
export async function proposeSafeTransaction(to, data, externalSigner) {
  const provider = resolveProvider();
  const signer = resolveSigner(externalSigner);
  const safeAddress = process.env.SAFE_ADDRESS;

  const protocolKit = await Safe.init({ provider, signer, safeAddress });

  const safeTransaction = await protocolKit.createTransaction({
    transactions: [{ to, value: '0', data }],
  });

  const safeTxHash = await protocolKit.getTransactionHash(safeTransaction);
  const signedTx = await protocolKit.signTransaction(safeTransaction);
  const senderAddress = await protocolKit.getSafeProvider().getSignerAddress();

  await getApiKit().proposeTransaction({
    safeAddress,
    safeTransactionData: signedTx.data,
    safeTxHash,
    senderAddress,
    senderSignature: signedTx.getSignature(senderAddress).data,
  });

  console.log(`[safe] Proposed tx to ${to} | safeTxHash: ${safeTxHash}`);
  return { safeTxHash, status: 'pending' };
}

/**
 * Thin wrapper over proposeSafeTransaction: encodes a registry function call
 * via the shared registryArtifact ABI, then delegates the propose itself to
 * the generic primitive. No Safe.init/createTransaction/apiKit logic here.
 */
export async function proposeRegistryWrite(fnName, args, externalSigner) {
  const iface = new ethers.Interface(registryArtifact.abi);
  const data = iface.encodeFunctionData(fnName, args);
  const result = await proposeSafeTransaction(process.env.REGISTRY_ADDRESS, data, externalSigner);
  console.log(`[safe] Proposed registry call ${fnName}(${args.join(', ')}) | safeTxHash: ${result.safeTxHash}`);
  return result;
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
  const executeResult = await protocolKit.executeTransaction(txToExecute);
  const receipt = await executeResult.transactionResponse?.wait?.();

  const txHash = receipt?.hash ?? executeResult.transactionResponse?.hash ?? null;
  const blockNumber = receipt?.blockNumber ?? null;

  console.log(`[safe] Executed ${safeTxHash} | Tx: ${txHash}`);
  return { safeTxHash, txHash, blockNumber, status: 'executed' };
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
  const results = (pending.results || []).map((tx) => {
    const signedCount = tx.confirmations?.length ?? 0;
    return {
      ...tx,
      signedCount,
      awaiting: threshold - signedCount,
    };
  });

  console.log(`[safe] ${results.length} pending tx(s) | threshold: ${threshold}`);
  return { threshold, results };
}
