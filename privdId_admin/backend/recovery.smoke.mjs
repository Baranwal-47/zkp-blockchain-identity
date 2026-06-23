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
 *   5. (11-02 redesign) device-loss session created with newPubKey: null is NOT
 *      ready even at 2-of-3 shares — reconstructIfReady reports
 *      waitingOnPubKey:true and does NOT reconstruct the DEK.
 *   6. (11-02 redesign) submitStudentPubKey after shares already met threshold
 *      (shares-then-pubkey ordering) immediately satisfies the gate — calling
 *      reconstructIfReady again now returns ready:true.
 *   7. (11-02 redesign) pubkey-then-shares ordering: submitStudentPubKey on a
 *      session with <2 shares only records the pubkey (ready stays false);
 *      the 2nd addShare afterward is what flips ready:true.
 *   8. (11-02 redesign) findOpenSessionForStudent / listOpenSessionsByStudent
 *      surface the right operationType/hasPubKey/sharesReceived shape.
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
  submitStudentPubKey,
  findOpenSessionForStudent,
  listOpenSessionsByStudent,
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

// --- 5. device-loss session with newPubKey: null is NOT ready at 2 shares ---
{
  const dek2 = generateDEK();
  const [shA, shB] = await splitDEK(dek2);

  const sid = initiateRecovery({
    studentId: "smoke-student-2",
    operationType: "device-loss",
    newPubKey: null,
    shareA: shA,
  });
  let s = addShare(sid, "registrar", shB);
  const r = await reconstructIfReady(s);

  if (r.ready) {
    console.error("FAIL: reconstructIfReady returned ready:true without a student pubkey");
    pass = false;
  } else if (!r.waitingOnPubKey) {
    console.error("FAIL: reconstructIfReady did not report waitingOnPubKey:true at 2 shares / no pubkey");
    pass = false;
  } else {
    console.log("PASS: device-loss session at 2-of-3 shares without a pubkey reports waitingOnPubKey, DEK not reconstructed");
  }

  // --- 6. shares-then-pubkey ordering: submitStudentPubKey flips the gate ---
  s = submitStudentPubKey(sid, "0".repeat(66));
  const r2 = await reconstructIfReady(s);

  if (!r2.ready || !Buffer.isBuffer(r2.dek) || Buffer.compare(r2.dek, dek2) !== 0) {
    console.error("FAIL: shares-then-pubkey ordering did not reconstruct the correct DEK after pubkey arrived");
    pass = false;
  } else {
    console.log("PASS: shares-then-pubkey ordering — submitStudentPubKey after threshold completes the gate");
  }

  await runOperation(sid, r2.dek, async () => {});
}

// --- 7. pubkey-then-shares ordering: pubkey alone (no shares yet) stays pending ---
{
  const dek3 = generateDEK();
  const [shA, shB] = await splitDEK(dek3);

  const sid = initiateRecovery({
    studentId: "smoke-student-3",
    operationType: "device-loss",
    newPubKey: null,
    shareA: shA,
  });

  let s = submitStudentPubKey(sid, "1".repeat(66));
  let r = await reconstructIfReady(s);

  if (r.ready) {
    console.error("FAIL: reconstructIfReady returned ready:true with only 1 share submitted");
    pass = false;
  } else {
    console.log("PASS: pubkey-then-shares ordering — pubkey alone (1 share) does not complete the gate");
  }

  s = addShare(sid, "dean", shB);
  r = await reconstructIfReady(s);

  if (!r.ready || !Buffer.isBuffer(r.dek) || Buffer.compare(r.dek, dek3) !== 0) {
    console.error("FAIL: pubkey-then-shares ordering did not reconstruct the correct DEK after the 2nd share arrived");
    pass = false;
  } else {
    console.log("PASS: pubkey-then-shares ordering — 2nd addShare after pubkey completes the gate");
  }

  await runOperation(sid, r.dek, async () => {});
}

// --- 8. findOpenSessionForStudent / listOpenSessionsByStudent shape ---
{
  const dek4 = generateDEK();
  const [shA] = await splitDEK(dek4);

  const sid = initiateRecovery({
    studentId: "smoke-student-4",
    operationType: "credential-mod",
    attributeUpdates: { batch: 2027 },
    shareA: shA,
  });

  const single = findOpenSessionForStudent("smoke-student-4");
  if (!single || single.sessionId !== sid || single.operationType !== "credential-mod" || single.sharesReceived !== 1) {
    console.error("FAIL: findOpenSessionForStudent did not return the expected shape for a credential-mod session");
    pass = false;
  } else {
    console.log("PASS: findOpenSessionForStudent returns the expected shape");
  }

  const bulk = listOpenSessionsByStudent();
  if (!bulk["smoke-student-4"] || bulk["smoke-student-4"].sessionId !== sid) {
    console.error("FAIL: listOpenSessionsByStudent did not include the open credential-mod session");
    pass = false;
  } else {
    console.log("PASS: listOpenSessionsByStudent includes the open session keyed by studentId");
  }

  // clean up directly via runOperation no-op so it doesn't leak into other assertions
  await runOperation(sid, Buffer.alloc(32), async () => {});
}

if (!pass) {
  console.error("RECOVERY SMOKE: FAIL");
  process.exit(1);
}
console.log("RECOVERY SMOKE: PASS");
