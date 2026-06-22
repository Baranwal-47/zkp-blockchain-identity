/**
 * recovery.smoke.mjs — pure unit smoke test for recoveryService.js (REC-01/REC-04).
 *
 * Exercises the in-memory session Map directly (no live server, no Mongo).
 * Asserts:
 *   1. initiateRecovery with operationType "device-loss" returns a sessionId and
 *      seeds exactly 1 share (acadadmin/shareA).
 *   2. addShare with a second distinct role, then reconstructIfReady, returns
 *      ready:true with the exact 32-byte original DEK, using real Shamir shares
 *      produced by splitDEK(generateDEK()).
 *   3. addShare with a duplicate role throws AppError with statusCode 409.
 *   4. After runOperation, getSession returns null AND the dek Buffer passed in
 *      is all-zero (wipe verified).
 *
 * Run: node recovery.smoke.mjs
 */
import { generateDEK } from "./crypto/aesgcm.js";
import { splitDEK } from "./crypto/shamir.js";
import {
  initiateRecovery,
  getSession,
  addShare,
  reconstructIfReady,
  runOperation,
} from "./services/recoveryService.js";

let pass = true;

const dek = generateDEK();
const [shareA, shareB] = await splitDEK(dek);

// --- 1. initiate seeds exactly 1 share ---
const sessionId = initiateRecovery({
  studentId: "smoke-student-1",
  operationType: "device-loss",
  newPubKey: "abc123",
  shareA,
});

if (typeof sessionId !== "string" || sessionId.length === 0) {
  console.error("FAIL: initiateRecovery did not return a sessionId string");
  pass = false;
} else {
  console.log("PASS: initiateRecovery returned a sessionId");
}

let session = getSession(sessionId);
if (!session || session.shares.length !== 1 || session.shares[0].role !== "acadadmin") {
  console.error("FAIL: session not seeded with exactly 1 acadadmin share");
  pass = false;
} else {
  console.log("PASS: session seeded with 1 acadadmin share");
}

// --- 2. addShare with a second distinct role reconstructs the exact DEK ---
session = addShare(sessionId, "registrar", shareB);
const result = await reconstructIfReady(session);

if (!result.ready || !Buffer.isBuffer(result.dek) || result.dek.length !== 32) {
  console.error("FAIL: reconstructIfReady did not return a ready 32-byte dek");
  pass = false;
} else if (Buffer.compare(result.dek, dek) !== 0) {
  console.error("FAIL: reconstructed DEK does not match original");
  pass = false;
} else {
  console.log("PASS: reconstructIfReady returns the exact original 32-byte DEK at threshold");
}

// --- 3. duplicate role rejected with 409 ---
try {
  addShare(sessionId, "registrar", shareB);
  console.error("FAIL: duplicate-role addShare did not throw");
  pass = false;
} catch (err) {
  if (err.statusCode !== 409) {
    console.error("FAIL: duplicate-role addShare threw but statusCode !== 409:", err.statusCode);
    pass = false;
  } else {
    console.log("PASS: duplicate-role addShare throws 409");
  }
}

// --- 4. runOperation wipes the dek and deletes the session ---
const dekToWipe = result.dek;
await runOperation(sessionId, dekToWipe, async () => {});

if (getSession(sessionId) !== null) {
  console.error("FAIL: session still present after runOperation");
  pass = false;
} else {
  console.log("PASS: session deleted after runOperation");
}

if (!dekToWipe.every((byte) => byte === 0)) {
  console.error("FAIL: dek buffer not zero-filled after runOperation");
  pass = false;
} else {
  console.log("PASS: dek buffer zero-filled after runOperation");
}

if (!pass) {
  console.error("RECOVERY SMOKE: FAIL");
  process.exit(1);
}
console.log("RECOVERY SMOKE: PASS");
