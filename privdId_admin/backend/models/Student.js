import mongoose from "mongoose";

const studentSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
    },
    rollNo: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    dob: {
      type: String,
      required: false,
      trim: true,
    },
    hashedData: {
      type: String,
      required: false,
      default: null,
    },
    password: {
      type: String,
      required: true,
    },
    emailSent: {
      type: Boolean,
      default: false,
    },
    emailSentAt: {
      type: Date,
      default: null,
    },
    ciphertextCID: {
      type: String,
      default: null,
    },
    custodyShareA: {
      type: String,
      default: null,
      select: false, // plaintext Shamir share — admin-readable, A→AcadAdmin, D-03
    },
    custodyShareB: {
      type: String,
      default: null,
      select: false, // base64 RSA-OAEP ciphertext to Registrar pubkey, B→Registrar
    },
    custodyShareC: {
      type: String,
      default: null,
      select: false, // base64 RSA-OAEP ciphertext to Dean pubkey, C→Dean
    },
    pendingDek: {
      type: String,
      default: null,
      // TRANSIENT base64 DEK for the issuance→claim window ONLY — wiped at claim;
      // NOT the custodial copy (shares are), NOT the old `dek` field.
      // Open Question #1 resolution, CUST-03 — see 10-02-PLAN.md.
      select: false,
    },
    pubKey: {
      type: String,
      default: null, // intentionally public per KEY-02 — NOT select:false
    },
    dekEnvelopeCID: {
      type: String,
      default: null, // mirrors ciphertextCID — a CID pointer, safe to return
    },
    enrollmentPhase: {
      type: String,
      enum: ["awaiting-keypair", "active", "revoked"],
      default: "awaiting-keypair", // ENROLL-01: every new student lands here automatically
    },
    onChainTxHash: {
      type: String,
      default: null,
    },
    onChainBlock: {
      type: Number,
      default: null,
    },
    anchorPending: {
      type: Boolean,
      default: false,
    },
    lastAnchorError: {
      type: String,
      default: null,
    },
    revoked: {
      type: Boolean,
      default: false,
    },
    revokedAt: {
      type: Date,
      default: null,
    },
    // GOV-02/GOV-03 (D-12): records an in-flight Safe propose for this student's
    // issue/revoke registry write. Terminal state (onChainTxHash/onChainBlock or
    // revoked/revokedAt) is set only once the proposal executes (09-03).
    pendingRegistryAction: {
      safeTxHash: { type: String, default: null },
      type: { type: String, enum: ["issue", "revoke"], default: null },
    },
    // --- 7-attribute salted Merkle commitment fields (plan 03) ---
    programmeLevel: {
      type: String,
      required: false,
      trim: true,
    },
    discipline: {
      type: String,
      required: false,
      trim: true,
    },
    batch: {
      type: Number,
      required: false,
      default: null,
    },
    dobInt: {
      type: Number,
      required: false,
      default: null,
    },
    salts: {
      type: [String],
      required: false,
      default: [],
    },
    merkleRoot: {
      type: String,
      required: false,
      default: null,
    },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
  }
);

const Student = mongoose.model("Student", studentSchema);

export default Student;