/**
 * recoveryService.js — in-memory recovery session state machine (REC-01/REC-04).
 *
 * Canonical source: 11-01-PLAN.md (Phase 11). Holds an in-memory Map of open
 * recovery sessions keyed by sessionId. A session is seeded with the AcadAdmin's
 * plaintext Share A at open time (preloaded from MongoDB by the controller), so
 * only ONE additional custodian (registrar or dean) needs to submit their share
 * to reach the 2-of-3 threshold.
 *
 * THREAT MITIGATIONS (per threat_model in 11-01-PLAN.md):
 *   T-11-02: addShare rejects a duplicate role before pushing — threshold counts
 *            only distinct roles, so the same custodian cannot submit twice to
 *            fake a 2-of-3.
 *   T-11-03: runOperation wraps the supplied operationFn in try/finally; dek.fill(0)
 *            and deleteSession run even if operationFn throws — the reconstructed
 *            DEK never outlives a single operation.
 *   T-11-04: this module NEVER console.logs the dek, any shareHex, the session
 *            object, or newPubKey — only [perf] lines from imported primitives
 *            (reconstructDEK's timed() wrapper) are emitted.
 *   T-11-05: SESSION_TTL_MS bounds how long an open session can sit unconsumed;
 *            getSession deletes-on-expiry on every read.
 *
 * Deliberately free of Mongoose imports so this module stays unit-testable
 * (see recovery.smoke.mjs) — the controller is responsible for loading Share A
 * from MongoDB and passing it into initiateRecovery.
 *
 * 11-02 REDESIGN (deviation from the original plan, see 11-02-SUMMARY.md):
 * device-loss sessions no longer require newPubKey at initiate time — the
 * student supplies it later via submitStudentPubKey(), generated on-device by
 * the mobile app (mirrors the original claimCredential keypair flow). Shares
 * and the student pubkey can arrive in either order; reconstructIfReady()
 * only flips to ready once BOTH are present, so the DEK is never reconstructed
 * and left waiting in memory for a condition that hasn't landed yet.
 */

import crypto from "crypto";

import { reconstructDEK } from "../crypto/shamir.js";
import { wrapDEK } from "../crypto/ecies.js";
import { pinEnvelopeToIPFS } from "./credentialService.js";
import { reissueWithDEK } from "./studentService.js";
import Student from "../models/Student.js";
import AppError from "../utils/appError.js";

const sessions = new Map();
const SESSION_TTL_MS = 30 * 60 * 1000; // 30 minutes (T-11-05)

const VALID_OPERATION_TYPES = new Set(["device-loss", "credential-mod"]);

/**
 * initiateRecovery({ studentId, operationType, newPubKey, attributeUpdates, shareA })
 * → string sessionId
 *
 * Opens a new recovery session, seeded with the AcadAdmin's plaintext Share A.
 *
 * Redesign (11-02 deviation): for device-loss, newPubKey is now OPTIONAL at
 * initiate time — the student supplies it later via their own on-device
 * keypair generation (POST /api/recovery/:sessionId/student-pubkey), not the
 * admin. A device-loss session can therefore be created with newPubKey: null
 * and complete in EITHER order: shares-then-pubkey or pubkey-then-shares.
 */
export function initiateRecovery({ studentId, operationType, newPubKey, attributeUpdates, shareA }) {
  if (!VALID_OPERATION_TYPES.has(operationType)) {
    throw new AppError(
      `Invalid operationType "${operationType}" — must be "device-loss" or "credential-mod".`,
      400
    );
  }
  if (typeof shareA !== "string" || shareA.length === 0) {
    throw new AppError("Share A missing for this student.", 409);
  }

  const sessionId = crypto.randomBytes(16).toString("hex");

  sessions.set(sessionId, {
    studentId,
    operationType,
    newPubKey: newPubKey ?? null,
    attributeUpdates: attributeUpdates ?? null,
    shares: [{ role: "acadadmin", shareHex: shareA }],
    expiresAt: Date.now() + SESSION_TTL_MS,
    status: "pending",
  });

  return sessionId;
}

/**
 * findOpenSessionForStudent(studentId) → { sessionId, operationType, hasPubKey,
 *   sharesReceived } | null
 *
 * Lightweight status lookup used by the mobile app to discover that the
 * logged-in student has an open recovery session and learn its sessionId.
 * Deletes expired sessions as a side effect (same expiry semantics as getSession).
 */
export function findOpenSessionForStudent(studentId) {
  for (const [sessionId, session] of sessions.entries()) {
    if (Date.now() > session.expiresAt) {
      sessions.delete(sessionId);
      continue;
    }
    if (session.studentId === String(studentId)) {
      return {
        sessionId,
        operationType: session.operationType,
        hasPubKey: session.operationType === "device-loss" ? Boolean(session.newPubKey) : null,
        sharesReceived: session.shares.length,
      };
    }
  }
  return null;
}

/**
 * listOpenSessionsByStudent() → { [studentId]: { sessionId, operationType,
 *   hasPubKey, sharesReceived } }
 *
 * Bulk variant for the AcadAdmin dashboard — one call renders status pills
 * ("Recovery initiated" / "Waiting for student pubkey" / "Waiting for
 * custodian shares") across every row instead of N per-student requests.
 * Expired sessions are dropped as a side effect.
 */
export function listOpenSessionsByStudent() {
  const byStudent = {};
  for (const [sessionId, session] of sessions.entries()) {
    if (Date.now() > session.expiresAt) {
      sessions.delete(sessionId);
      continue;
    }
    byStudent[session.studentId] = {
      sessionId,
      operationType: session.operationType,
      hasPubKey: session.operationType === "device-loss" ? Boolean(session.newPubKey) : null,
      sharesReceived: session.shares.length,
    };
  }
  return byStudent;
}

/**
 * submitStudentPubKey(sessionId, pubKeyHex) → updated session object
 *
 * Student-driven half of the redesigned device-loss flow: the student
 * generates a fresh on-device keypair (same generateAndStoreKeypair() used
 * for the original claim) and posts the public key into their open recovery
 * session. Valid for device-loss sessions only; rejects credential-mod
 * sessions (400) since those never need a new pubkey.
 */
export function submitStudentPubKey(sessionId, pubKeyHex) {
  const session = getSession(sessionId);
  if (!session) {
    throw new AppError("Recovery session not found or expired.", 404);
  }
  if (session.operationType !== "device-loss") {
    throw new AppError("This recovery session does not accept a student pubkey.", 400);
  }
  if (typeof pubKeyHex !== "string" || pubKeyHex.length === 0) {
    throw new AppError("pubKeyHex must be a non-empty string.", 400);
  }
  if (session.newPubKey) {
    throw new AppError("A new public key has already been submitted for this session.", 409);
  }

  session.newPubKey = pubKeyHex;
  return session;
}

/**
 * getSession(sessionId) → session object | null
 *
 * Returns the session, or null if missing/expired. Deletes the session on
 * expiry as a side effect of the read (T-11-05).
 */
export function getSession(sessionId) {
  const session = sessions.get(sessionId);
  if (!session) return null;

  if (Date.now() > session.expiresAt) {
    sessions.delete(sessionId);
    return null;
  }

  return session;
}

/**
 * addShare(sessionId, role, shareHex) → updated session object
 *
 * Adds a custodian's share to the session. Rejects unknown/expired sessions
 * (404), duplicate-role submissions (409, T-11-02), and missing shareHex (400).
 */
export function addShare(sessionId, role, shareHex) {
  const session = getSession(sessionId);
  if (!session) {
    throw new AppError("Recovery session not found or expired.", 404);
  }

  if (session.shares.some((s) => s.role === role)) {
    throw new AppError("This role has already submitted a share for this session.", 409);
  }

  if (typeof shareHex !== "string" || shareHex.length === 0) {
    throw new AppError("shareHex must be a non-empty string.", 400);
  }

  session.shares.push({ role, shareHex });
  return session;
}

/**
 * reconstructIfReady(session) → { ready: false, sharesReceived, waitingOnPubKey }
 *                              | { ready: true, dek }
 *
 * Reconstructs the DEK once BOTH completion conditions are met:
 *   1. the 2-of-3 share threshold is reached, AND
 *   2. for device-loss sessions, the student's newPubKey has arrived.
 * (credential-mod sessions only need condition 1 — there is no pubkey to wait on.)
 *
 * This is the either-order gate (11-02 redesign): shares and the student
 * pubkey can arrive in any order; whichever arrives last is what flips
 * `ready: true`. The DEK is reconstructed ONLY at the exact moment both
 * conditions hold — never reconstructed early and held in memory waiting on
 * the other condition, keeping the plaintext-DEK exposure window as short as
 * the original code's wipe-immediately pattern.
 *
 * Never calls reconstructDEK below the 2-share threshold (Pitfall 1 —
 * secrets.combine() on a single share silently returns garbage, never throws).
 */
export async function reconstructIfReady(session) {
  const sharesReady = session.shares.length >= 2;
  const pubKeyReady = session.operationType !== "device-loss" || Boolean(session.newPubKey);

  if (!sharesReady || !pubKeyReady) {
    return {
      ready: false,
      sharesReceived: session.shares.length,
      waitingOnPubKey: session.operationType === "device-loss" && !pubKeyReady,
    };
  }

  const dek = await reconstructDEK([session.shares[0].shareHex, session.shares[1].shareHex]);
  return { ready: true, dek };
}

/**
 * deleteSession(sessionId) — removes the session from the in-memory Map.
 */
export function deleteSession(sessionId) {
  sessions.delete(sessionId);
}

/**
 * runOperation(sessionId, dek, operationFn) → Promise<any>
 *
 * Single wipe point (T-11-03): runs operationFn(dek) inside try/finally, then
 * unconditionally zero-fills the dek Buffer and deletes the session — even if
 * operationFn throws. Plan 11-02 supplies the real Case A / Case B operationFn;
 * this plan only wires the no-op path.
 */
export async function runOperation(sessionId, dek, operationFn) {
  try {
    return await operationFn(dek);
  } finally {
    dek.fill(0);
    deleteSession(sessionId);
  }
}

/**
 * performDeviceLoss(session, dek) → { dekEnvelopeCID, pubKey }
 *
 * Case B (REC-02): re-wraps the reconstructed DEK to the student's new
 * on-device pubkey, pins a fresh envelope, and updates Student.{dekEnvelopeCID,
 * pubKey}. Writes NO on-chain transaction — device-loss never touches the
 * registry or the Merkle root, only the off-chain DEK envelope/pubkey pointer.
 */
export async function performDeviceLoss(session, dek) {
  if (typeof session.newPubKey !== "string" || !session.newPubKey.trim()) {
    throw new AppError("newPubKey is required for device-loss recovery.", 400);
  }

  const envelope = await wrapDEK(session.newPubKey, dek);
  const dekEnvelopeCID = await pinEnvelopeToIPFS(envelope, session.studentId);

  await Student.findByIdAndUpdate(session.studentId, {
    dekEnvelopeCID,
    pubKey: session.newPubKey,
  });

  return { dekEnvelopeCID, pubKey: session.newPubKey };
}

/**
 * performCredentialMod(session, dek) → { ciphertextCID, onChainTxHash, anchorPending }
 *
 * Case A (REC-03): delegates to studentService.reissueWithDEK, which decrypts/
 * re-encrypts the credential under the SAME reconstructed DEK, preserves the
 * frozen 7-attribute field set, and re-anchors on-chain via the direct
 * issuer-EOA write (Q3 — not Safe-governed).
 */
export async function performCredentialMod(session, dek) {
  return await reissueWithDEK(session.studentId, session.attributeUpdates ?? {}, dek);
}
