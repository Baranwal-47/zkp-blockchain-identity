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
 */

import crypto from "crypto";

import { reconstructDEK } from "../crypto/shamir.js";
import AppError from "../utils/appError.js";

const sessions = new Map();
const SESSION_TTL_MS = 30 * 60 * 1000; // 30 minutes (T-11-05)

const VALID_OPERATION_TYPES = new Set(["device-loss", "credential-mod"]);

/**
 * initiateRecovery({ studentId, operationType, newPubKey, attributeUpdates, shareA })
 * → string sessionId
 *
 * Opens a new recovery session, seeded with the AcadAdmin's plaintext Share A.
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
 * reconstructIfReady(session) → { ready: false, sharesReceived } | { ready: true, dek }
 *
 * Reconstructs the DEK from the first two distinct-role shares once the
 * 2-of-3 threshold is met. Never calls reconstructDEK below threshold (Pitfall 1
 * — secrets.combine() on a single share silently returns garbage, never throws).
 */
export async function reconstructIfReady(session) {
  if (session.shares.length < 2) {
    return { ready: false, sharesReceived: session.shares.length };
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
