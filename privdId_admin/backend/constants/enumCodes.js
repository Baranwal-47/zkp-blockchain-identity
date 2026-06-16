// privdId_admin/backend/constants/enumCodes.js
//
// FROZEN — append-only (per D-07).
//
// CRITICAL: Changing an existing mapping (renumbering, reordering) invalidates
// ALL prior student commitments and forces a Phase-2 circuit rebuild + full
// Groth16 trusted-setup redo. The Phase-2 circuit must hardcode these same
// integer values in its set-membership check for `isPostgrad`.
//
// To add a new programme or discipline: append the next free integer (7+).
// Never reuse or renumber an existing code.
//
// NOTE: Dual (code 3) is EXCLUDED from isPostgrad. If IIITDM dual-degree
// programmes confer postgrad standing, code 3 must be added to POSTGRAD_CODES
// AND the Phase-2 circuit's set-membership constants BEFORE the circuit is
// frozen. This cannot be changed after trusted setup without a full redo.
// Confirm with users before the Phase-2 circuit freeze.
//
// See: docs/current/research/IDENTITY_SPEC.md §5 for the informational copy
// of these tables. This file is the canonical machine-readable source of truth.

// programmeLevel integer codes (leaf index 3 in the Merkle commitment)
export const PROGRAMME_LEVEL = {
  "B.Tech": 1,
  "B.Des": 2,
  "Dual": 3,
  "M.Tech": 4,
  "M.Des": 5,
  "PhD": 6,
};

// discipline integer codes (leaf index 4 in the Merkle commitment)
export const DISCIPLINE = {
  "CSE": 1,
  "ECE": 2,
  "ME": 3,
  "SmartMfg": 4,
  "Design": 5,
  "NatSci": 6,
};

// isPostgrad predicate: programmeLevel code ∈ POSTGRAD_CODES → student is postgraduate
// M.Tech (4), M.Des (5), PhD (6). Dual (3) is intentionally excluded.
export const POSTGRAD_CODES = new Set([4, 5, 6]);
