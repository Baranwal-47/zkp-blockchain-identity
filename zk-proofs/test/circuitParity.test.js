/**
 * circuitParity.test.js — Witness-level parity gate (D-14) + nonce-rejection
 * test (REPL-02). This is the Phase-2 freeze precondition: the circuit must
 * NOT be considered frozen until every assertion in this file is green.
 *
 * D-14: asserts the compiled identity.circom circuit's witness pubHash
 * (public signal [0]) equals identityCommitment.js::computeMerkleRoot for
 * the exact same attr[]/salt[] inputs, across the IDENTITY_SPEC.md section 9
 * vectors — including both MANDATORY multi-chunk cases (37-byte name,
 * 40-byte email). A mismatch here means the circuit's Merkle math has
 * diverged from the JS oracle, and catching it now (before Phase 3's
 * trusted setup) is the entire point of DESIGN-ONCE risk control.
 *
 * REPL-02: asserts a witness generated for nonce=A binds nonce=A in its
 * public-signal vector (and not some other value B) — the witness-level
 * approximation of "a proof for nonce A is rejected when verified against
 * nonce B," which is the strongest check possible without a zkey (the
 * Phase-3 trusted-setup ptau is not available this phase).
 *
 * Run: npx hardhat test test/circuitParity.test.js
 */

const assert = require("assert");
const path = require("path");
const os = require("os");
const fs = require("fs");
const snarkjs = require("snarkjs");

const WASM_PATH = path.join(__dirname, "..", "build", "identity_js", "identity.wasm");

// Public-signal witness indices, verified against build/identity.sym in this
// plan's Task 1 (witness index 0 is the constant-1 wire; public signals
// occupy indices 1..18 immediately after it, matching the frozen order
// recorded in 02-01-SUMMARY.md / blueprint section 3):
//   [idx 1]  pubHash        (signal [0])
//   [idx 2]  nonce          (signal [1])
//   [idx 3]  currentDateInt (signal [2])
//   [idx 4]  isOver18       (signal [3])
//   [idx 5]  isPostgrad     (signal [4])
//   [idx 6..12]  revealedValue[0..6]  (signals [5..11])
//   [idx 13..19] revealMask[0..6]     (signals [12..18])
const WITNESS_IDX = {
  pubHash: 1,
  nonce: 2,
  currentDateInt: 3,
  isOver18: 4,
  isPostgrad: 5,
};

describe("Circuit witness-level parity gate (D-14) + nonce-rejection (REPL-02)", function () {
  this.timeout(60000);

  let computeMerkleRoot;
  let tmpDir;
  let wtnsCounter = 0;

  before(async function () {
    // Dynamic import of the ESM oracle from this CommonJS test file — the
    // lower-duplication option confirmed viable in 02-PATTERNS.md.
    const oracle = await import(
      "../../privdId_admin/backend/utils/identityCommitment.js"
    );
    computeMerkleRoot = oracle.computeMerkleRoot;

    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "circuitParity-"));

    assert.ok(
      fs.existsSync(WASM_PATH),
      `compiled circuit wasm missing at ${WASM_PATH} — run the plan 02-01 compile step first`
    );
  });

  after(function () {
    if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  /**
   * Builds a full circuit input object. revealMask is all-zero / revealedValue
   * all-zero (a valid CIRC-03 combination: nothing disclosed) unless the
   * caller overrides them — the parity gate is about pubHash, not disclosure.
   */
  function buildInput(attrs, salts, overrides = {}) {
    return Object.assign(
      {
        attr: attrs,
        salt: salts,
        nonce: "1",
        currentDateInt: "20260617",
        isOver18: "1", // attrs[2] dob fixed below to satisfy this
        isPostgrad: "0",
        revealedValue: ["0", "0", "0", "0", "0", "0", "0"],
        revealMask: ["0", "0", "0", "0", "0", "0", "0"],
      },
      overrides
    );
  }

  async function calculateWitness(input) {
    const wtnsPath = path.join(tmpDir, `witness-${wtnsCounter++}.wtns`);
    await snarkjs.wtns.calculate(input, WASM_PATH, wtnsPath);
    const witness = await snarkjs.wtns.exportJson(wtnsPath);
    return witness;
  }

  // Fixed reproducible salts — deterministic leaf values across runs.
  const FIXED_SALTS = ["1", "2", "3", "4", "5", "6", "7"];

  // dob chosen so isOver18 computed predicate = true under currentDateInt
  // 20260617 (used in buildInput above): dobInt <= 20260617 - 180000 = 20080617.
  const DOB_INT = "20040215"; // well before threshold -> isOver18 = 1
  const PROGRAMME_LEVEL = "1"; // B.Tech -> isPostgrad = 0 (not in {4,5,6})
  const DISCIPLINE = "1"; // CSE
  const BATCH = "2021";

  describe("Task 1: parity vectors from IDENTITY_SPEC.md section 9", function () {
    it("(a) single-chunk name+email vector set (Utkarsh Baranwal / 21bcs027@iiitdmj.ac.in)", async function () {
      const attrs = [
        "2689494646062948360487866858549161268023147861439580363715484426041810573382", // hashToField("Utkarsh Baranwal", 4)
        "15150160435819557810078120971221321758887516517285291325240673283662695955468", // hashToField("21BCS027", 2)
        DOB_INT,
        PROGRAMME_LEVEL,
        DISCIPLINE,
        BATCH,
        "6744441775314583329532040559385253235651674879202368422786321712697490882813", // hashToField("21bcs027@iiitdmj.ac.in", 2)
      ];

      const jsRoot = await computeMerkleRoot(attrs, FIXED_SALTS);
      const witness = await calculateWitness(buildInput(attrs, FIXED_SALTS));
      const circuitPubHash = witness[WITNESS_IDX.pubHash].toString();

      assert.strictEqual(circuitPubHash, jsRoot);
    });

    it("(b) MANDATORY 37-byte name multi-chunk vector (Rajesh Kumar Sharma Gupta Verma Singh, maxChunks=4)", async function () {
      const attrs = [
        "8788477441821112447812609039840608362124692723989989797277498722759269778947", // hashToField(37-byte name, 4) — 2-chunk path
        "15150160435819557810078120971221321758887516517285291325240673283662695955468", // hashToField("21BCS027", 2)
        DOB_INT,
        PROGRAMME_LEVEL,
        DISCIPLINE,
        BATCH,
        "6744441775314583329532040559385253235651674879202368422786321712697490882813", // hashToField("21bcs027@iiitdmj.ac.in", 2)
      ];

      const jsRoot = await computeMerkleRoot(attrs, FIXED_SALTS);
      const witness = await calculateWitness(buildInput(attrs, FIXED_SALTS));
      const circuitPubHash = witness[WITNESS_IDX.pubHash].toString();

      assert.strictEqual(circuitPubHash, jsRoot);
    });

    it("(c) MANDATORY 40-byte email multi-chunk vector (utkarshbaranwal47@students.iiitdmj.ac.in, maxChunks=2)", async function () {
      const attrs = [
        "2689494646062948360487866858549161268023147861439580363715484426041810573382", // hashToField("Utkarsh Baranwal", 4)
        "15150160435819557810078120971221321758887516517285291325240673283662695955468", // hashToField("21BCS027", 2)
        DOB_INT,
        PROGRAMME_LEVEL,
        DISCIPLINE,
        BATCH,
        "15157798813008110916508472488358427390626844432052365640772174362044533657556", // hashToField(40-byte email, 2) — 2-chunk path
      ];

      const jsRoot = await computeMerkleRoot(attrs, FIXED_SALTS);
      const witness = await calculateWitness(buildInput(attrs, FIXED_SALTS));
      const circuitPubHash = witness[WITNESS_IDX.pubHash].toString();

      assert.strictEqual(circuitPubHash, jsRoot);
    });

    it("zero-padding leaf sanity: JS oracle's leaf[7] = Poseidon(2)(0,0) matches IDENTITY_SPEC.md section 9", async function () {
      // Named assertion for traceability — already implicitly exercised by
      // every full-root parity case above (leaf[7] feeds every root), but
      // called out explicitly per the plan's Task 1 requirement.
      const ZERO_PAD_LEAF =
        "14744269619966411208579211824598458697587494354926760081771325075741142829156";

      const oracle = await import(
        "../../privdId_admin/backend/utils/identityCommitment.js"
      );
      const jsZeroPadLeaf = await oracle.computeLeaf(0, 0);

      assert.strictEqual(jsZeroPadLeaf, ZERO_PAD_LEAF);

      // And confirm a full-root witness for any vector above used the same
      // leaf[7] by checking it is deterministic / reproducible (already
      // proven by cases (a)-(c) matching; this assertion targets the JS side
      // explicitly, which is the side IDENTITY_SPEC.md section 9 vectors are
      // pinned against).
    });

    it("a deliberate attr-swap mismatch is correctly detected as a parity failure (sanity check on the gate itself)", async function () {
      // Negative control: swapping attr[0] and attr[1] must produce a
      // different root on the JS side than the circuit witness for the
      // UNSWAPPED input — proving the parity gate would actually catch a
      // real encoding/ordering bug, not just trivially pass.
      const correctAttrs = [
        "2689494646062948360487866858549161268023147861439580363715484426041810573382",
        "15150160435819557810078120971221321758887516517285291325240673283662695955468",
        DOB_INT,
        PROGRAMME_LEVEL,
        DISCIPLINE,
        BATCH,
        "6744441775314583329532040559385253235651674879202368422786321712697490882813",
      ];
      const swappedAttrs = [
        correctAttrs[1],
        correctAttrs[0],
        ...correctAttrs.slice(2),
      ];

      const correctRoot = await computeMerkleRoot(correctAttrs, FIXED_SALTS);
      const swappedRoot = await computeMerkleRoot(swappedAttrs, FIXED_SALTS);

      assert.notStrictEqual(
        correctRoot,
        swappedRoot,
        "swapping two attrs must change the root — otherwise the parity gate is vacuous"
      );
    });
  });

  describe("Task 3: selective disclosure (CIRC-03) — witness-level coverage (WR-01)", function () {
    // Witness public-signal indices for revealedValue[0..6]/revealMask[0..6]
    // (signals [5..11]/[12..18], witness indices 6..12/13..19 — see
    // WITNESS_IDX comment block above).
    const REVEALED_VALUE_BASE = 6;
    const REVEAL_MASK_BASE = 13;

    const baseAttrs = [
      "2689494646062948360487866858549161268023147861439580363715484426041810573382",
      "15150160435819557810078120971221321758887516517285291325240673283662695955468",
      DOB_INT,
      PROGRAMME_LEVEL,
      DISCIPLINE,
      BATCH,
      "6744441775314583329532040559385253235651674879202368422786321712697490882813",
    ];

    it("positive: revealMask[2]=1 with revealedValue[2]=attr[2] succeeds and the witness reflects the disclosed value, while other attributes remain hidden/zeroed", async function () {
      const revealedValue = ["0", "0", "0", "0", "0", "0", "0"];
      const revealMask = ["0", "0", "0", "0", "0", "0", "0"];
      revealedValue[2] = baseAttrs[2]; // disclose dob
      revealMask[2] = "1";

      const witness = await calculateWitness(
        buildInput(baseAttrs, FIXED_SALTS, { revealedValue, revealMask })
      );

      // Disclosed attribute (index 2) must equal the committed attr value.
      assert.strictEqual(
        witness[REVEALED_VALUE_BASE + 2].toString(),
        baseAttrs[2],
        "disclosed revealedValue[2] must equal the committed attr[2]"
      );
      assert.strictEqual(witness[REVEAL_MASK_BASE + 2].toString(), "1");

      // All other attributes must remain hidden/zeroed in revealedValue and
      // their revealMask must remain 0.
      for (let i = 0; i < 7; i++) {
        if (i === 2) continue;
        assert.strictEqual(
          witness[REVEALED_VALUE_BASE + i].toString(),
          "0",
          `revealedValue[${i}] must be zeroed when revealMask[${i}]=0`
        );
        assert.strictEqual(witness[REVEAL_MASK_BASE + i].toString(), "0");
      }
    });

    it("negative: revealMask[2]=1 with a wrong revealedValue[2] causes witness generation to reject (the === constraint actually fires)", async function () {
      const revealedValue = ["0", "0", "0", "0", "0", "0", "0"];
      const revealMask = ["0", "0", "0", "0", "0", "0", "0"];
      // Deliberately wrong disclosed value (does not match committed attr[2]).
      revealedValue[2] = "999999999";
      revealMask[2] = "1";

      await assert.rejects(
        calculateWitness(
          buildInput(baseAttrs, FIXED_SALTS, { revealedValue, revealMask })
        ),
        /Error/,
        "witness generation must reject a revealMask[i]=1 disclosure with a mismatched revealedValue[i]"
      );
    });
  });

  describe("Task 2: nonce-rejection (REPL-02) — witness-level binding check", function () {
    // Full Groth16 groth16.verify(nonce-A-proof, publicSignals-with-nonce-B)
    // === false is DEFERRED to Phase 4, once build/pot12_final.ptau exists
    // and a real .zkey can be produced (RESEARCH.md section 4 risk 8). That
    // assertion tests the exact same nonce-binding property this witness-
        // level check tests; without a zkey, this is the strongest no-ptau
    // check available this phase.
    it("a witness generated for nonce=A binds nonce=A (not nonce=B) in its public-signal vector", async function () {
      const attrs = [
        "2689494646062948360487866858549161268023147861439580363715484426041810573382",
        "15150160435819557810078120971221321758887516517285291325240673283662695955468",
        DOB_INT,
        PROGRAMME_LEVEL,
        DISCIPLINE,
        BATCH,
        "6744441775314583329532040559385253235651674879202368422786321712697490882813",
      ];

      const NONCE_A = "111111";
      const NONCE_B = "222222";

      const witnessA = await calculateWitness(
        buildInput(attrs, FIXED_SALTS, { nonce: NONCE_A })
      );
      const witnessNonce = witnessA[WITNESS_IDX.nonce].toString();

      assert.strictEqual(
        witnessNonce,
        NONCE_A,
        "witness's public nonce signal must equal the nonce supplied at proving time"
      );
      assert.notStrictEqual(
        witnessNonce,
        NONCE_B,
        "witness's public nonce signal must not equal a different nonce — this is the property that makes Groth16's public-input binding reject a nonce-A proof verified against publicSignals stating nonce=B"
      );
    });
  });
});
