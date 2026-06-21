import * as safeService from "../services/safeService.js";
import Student from "../models/Student.js";
import { asyncHandler } from "../middleware/asyncHandler.js";
import AppError from "../utils/appError.js";

const SAFE_TX_HASH_REGEX = /^0x[0-9a-fA-F]{64}$/;
const ADDRESS_REGEX = /^0x[0-9a-fA-F]{40}$/;

export const getPendingApprovals = asyncHandler(async (req, res) => {
  const pending = await safeService.getPendingTransactions();
  res.json({ status: "success", pending });
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
    }

    student.pendingRegistryAction = { safeTxHash: null, type: null };
    await student.save();

    console.log(`[safe] Executed ${actionType} for ${student.rollNo} — student now terminal`);
  } else {
    console.log(`[safe] Executed ${safeTxHash} — no matching student (non-student Safe tx)`);
  }

  res.json({ status: "success", result });
});
