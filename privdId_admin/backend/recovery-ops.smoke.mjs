/**
 * recovery-ops.smoke.mjs — pure-crypto unit smoke for Case A/B operation logic
 * (REC-02/REC-03). No live Mongo/IPFS — exercises only the crypto primitives
 * that performDeviceLoss/performCredentialMod/reissueWithDEK depend on.
 *
 * Asserts:
 *   1. Case B round-trip: wrapDEK(pubHex, dek) → unwrapDEK(privHex, envelope)
 *      returns a Buffer byte-equal to the original dek — proving the
 *      re-wrapped envelope decrypts on the "new device" (REC-02).
 *   2. Case A field-set preservation: buildCredentialJson(stubStudent) before
 *      and after mutating `batch` both emit exactly the frozen key set,
 *      including all 7 identity attributes (REC-03).
 *   3. encrypt→decrypt round-trip under the SAME dek deep-equals the source
 *      JSON (Case A re-encrypt path reuses the same DEK, never rotates it).
 *
 * Run: node recovery-ops.smoke.mjs
 */
import assert from "assert";
import { PrivateKey } from "eciesjs";

import { generateDEK, encryptCredential, decryptCredential } from "./crypto/aesgcm.js";
import { wrapDEK, unwrapDEK } from "./crypto/ecies.js";
import { buildCredentialJson } from "./services/credentialService.js";

let pass = true;

function stubStudent(batch) {
  return {
    name: "Test Student",
    rollNo: "22BCSD99",
    dobInt: 20040101,
    programmeLevel: "B.Tech",
    discipline: "CSE",
    batch,
    email: "test.student@iiitdmj.ac.in",
    salts: ["s0", "s1", "s2", "s3", "s4", "s5", "s6"],
    merkleRoot: "123456789",
  };
}

const FROZEN_KEYS = [
  "name",
  "rollNo",
  "dobInt",
  "programmeLevel",
  "discipline",
  "batch",
  "email",
  "salts",
  "merkleRoot",
  "issuedAt",
  "issuer",
  "type",
  "version",
];

try {
  // --- 1. Case B round-trip: wrapDEK → unwrapDEK byte-equality ---
  const dek = generateDEK();
  const priv = new PrivateKey();
  const pubHex = priv.publicKey.toHex();
  const privHex = priv.toHex();

  const envelope = await wrapDEK(pubHex, dek);
  const unwrapped = unwrapDEK(privHex, envelope);

  assert.strictEqual(Buffer.compare(unwrapped, dek), 0, "unwrapped DEK does not byte-equal the original");
  console.log("PASS: Case B wrapDEK->unwrapDEK round-trip byte-equal");

  // --- 2. Case A field-set preservation across a batch edit ---
  const before = buildCredentialJson(stubStudent(2025));
  const after = buildCredentialJson(stubStudent(2026));

  const beforeKeys = Object.keys(before).sort();
  const afterKeys = Object.keys(after).sort();
  const expectedKeys = [...FROZEN_KEYS].sort();

  assert.deepStrictEqual(beforeKeys, expectedKeys, "pre-edit credential JSON key set drifted from frozen spec");
  assert.deepStrictEqual(afterKeys, expectedKeys, "post-edit credential JSON key set drifted from frozen spec");

  for (const attr of ["name", "rollNo", "dobInt", "programmeLevel", "discipline", "batch", "email"]) {
    assert.ok(attr in before, `missing frozen attribute "${attr}" before edit`);
    assert.ok(attr in after, `missing frozen attribute "${attr}" after edit`);
  }
  assert.strictEqual(after.batch, 2026, "batch edit did not propagate into buildCredentialJson output");
  console.log("PASS: Case A buildCredentialJson preserves the frozen 7-attribute field set after a batch edit");

  // --- 3. encrypt -> decrypt round-trip under the SAME dek ---
  const blob = await encryptCredential(after, dek);
  const decrypted = decryptCredential(blob, dek);

  assert.deepStrictEqual(decrypted, after, "decrypted credential JSON does not deep-equal the source JSON");
  console.log("PASS: encrypt->decrypt round-trip under the same DEK deep-equals the source JSON");
} catch (err) {
  console.error("FAIL:", err.message);
  pass = false;
}

if (!pass) {
  console.error("RECOVERY OPS SMOKE: FAIL");
  process.exit(1);
}
console.log("RECOVERY OPS SMOKE: PASS");
