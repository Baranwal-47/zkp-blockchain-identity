import * as safeService from "../services/safeService.js";
import { dismissSafeTx } from "../services/safeService.js";
import Student from "../models/Student.js";
import { asyncHandler } from "../middleware/asyncHandler.js";
import AppError from "../utils/appError.js";

const SAFE_TX_HASH_REGEX = /^0x[0-9a-fA-F]{64}$/;
const ADDRESS_REGEX = /^0x[0-9a-fA-F]{40}$/;

export const getPendingApprovals = asyncHandler(async (req, res) => {
  const { threshold, results } = await safeService.getPendingTransactions();
  res.json({ status: "success", pending: results, threshold });
});

// Step 1 of the MetaMask-driven proposal: build the unsigned Safe tx for a
// whitelisted registry action so the proposer's wallet can sign its hash.
export const buildProposal = asyncHandler(async (req, res) => {
  const { action, rollNo } = req.body;
  const spec = safeService.PROPOSABLE_ACTIONS[action];
  if (!spec) {
    throw new AppError("Unknown action. Expected 'revoke', 'acceptAdmin', or 'updateCredential'.", 400);
  }

  let args = [];
  if (action === "revoke") {
    if (!rollNo) throw new AppError("rollNo is required to propose a revocation.", 400);
    const student = await Student.findOne({ rollNo });
    if (!student) throw new AppError("Student not found.", 404);
    if (student.revoked) throw new AppError("Credential is already revoked.", 400);
    args = [rollNo];
  } else if (action === "updateCredential") {
    if (!rollNo) throw new AppError("rollNo is required to propose a credential update.", 400);
    const student = await Student.findOne({ rollNo });
    if (!student) throw new AppError("Student not found.", 404);
    const pra = student.pendingRegistryAction;
    if (!pra || pra.type !== "updateCredential" || !pra.newCID || !pra.newPubHash) {
      throw new AppError("No pending credential update found for this student.", 409);
    }
    args = [rollNo, pra.newCID, pra.newPubHash];
  }

  const built = await safeService.buildUnsignedRegistryTx(spec.fnName, args);
  res.json({ status: "success", ...built });
});

// Step 2: relay the proposer's MetaMask signature to the Safe Tx Service and
// link it to the student so the action is visible in the pending queue.
export const submitProposal = asyncHandler(async (req, res) => {
  const { action, rollNo, safeTransactionData, safeTxHash, signature, signerAddress } = req.body;

  if (!safeTxHash || !SAFE_TX_HASH_REGEX.test(safeTxHash)) {
    throw new AppError("A valid safeTxHash is required.", 400);
  }
  if (!safeTransactionData || !signature) {
    throw new AppError("safeTransactionData and signature are required.", 400);
  }
  if (!signerAddress || !ADDRESS_REGEX.test(signerAddress)) {
    throw new AppError("A valid signerAddress is required.", 400);
  }

  await safeService.relayProposal({
    safeTransactionData,
    safeTxHash,
    senderAddress: signerAddress,
    senderSignature: signature,
  });

  if (action === "revoke" && rollNo) {
    const student = await Student.findOne({ rollNo });
    if (student) {
      student.pendingRegistryAction = { safeTxHash, type: "revoke" };
      await student.save();
    }
  } else if (action === "updateCredential" && rollNo) {
    const student = await Student.findOne({ rollNo });
    if (student) {
      // Preserve newCID/newPubHash already stored by reissueWithDEK; just stamp safeTxHash
      student.pendingRegistryAction.safeTxHash = safeTxHash;
      await student.save();
    }
  }

  res.json({ status: "success", safeTxHash });
});

// Off-chain dismiss (D-decision C1): clear the student's pending action so the
// card disappears. The orphaned Safe proposal simply expires un-executed.
export const rejectProposal = asyncHandler(async (req, res) => {
  const { safeTxHash } = req.body;
  if (!safeTxHash || !SAFE_TX_HASH_REGEX.test(safeTxHash)) {
    throw new AppError("A valid safeTxHash is required.", 400);
  }

  await dismissSafeTx(safeTxHash);

  const student = await Student.findOne({ "pendingRegistryAction.safeTxHash": safeTxHash });
  if (student) {
    student.pendingRegistryAction = { safeTxHash: null, type: null };
    await student.save();
    console.log(`[safe] Rejected/dismissed proposal ${safeTxHash} for ${student.rollNo}`);
  }

  res.json({ status: "success" });
});

export const signPendingTx = asyncHandler(async (req, res) => {
  const { safeTxHash, signature, signerAddress } = req.body;

  if (!safeTxHash || !SAFE_TX_HASH_REGEX.test(safeTxHash)) {
    throw new AppError("A valid safeTxHash is required.", 400);
  }
  if (!signature) {
    throw new AppError("signature is required.", 400);
  }
  if (signerAddress && !ADDRESS_REGEX.test(signerAddress)) {
    throw new AppError("signerAddress must be a valid address.", 400);
  }

  const result = await safeService.confirmSignature(safeTxHash, signature, signerAddress);
  res.json({ status: "success", result });
});

// D-12: the ONLY place a Student flips from pendingRegistryAction into its
// terminal issued/revoked state — execute is a separate route from sign and
// is never auto-fired (D-06).
export const executePendingTx = asyncHandler(async (req, res) => {
  const { safeTxHash } = req.body;

  if (!safeTxHash || !SAFE_TX_HASH_REGEX.test(safeTxHash)) {
    throw new AppError("A valid safeTxHash is required.", 400);
  }

  const result = await safeService.executeTransaction(safeTxHash);

  const student = await Student.findOne({ "pendingRegistryAction.safeTxHash": safeTxHash });
  if (student) {
    const actionType = student.pendingRegistryAction.type;

    if (actionType === "issue") {
      student.onChainTxHash = result.txHash;
      student.onChainBlock = result.blockNumber;
    } else if (actionType === "revoke") {
      student.revoked = true;
      student.revokedAt = new Date();
    } else if (actionType === "updateCredential") {
      student.onChainTxHash = result.txHash;
      student.onChainBlock = result.blockNumber;
      student.anchorPending = false;
    }

    student.pendingRegistryAction = { safeTxHash: null, type: null };
    await student.save();

    console.log(`[safe] Executed ${actionType} for ${student.rollNo} — student now terminal`);
  } else {
    console.log(`[safe] Executed ${safeTxHash} — no matching student (non-student Safe tx)`);
  }

  res.json({ status: "success", result });
});
