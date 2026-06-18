/**
 * predicates.js — server-side predicate derivation for the identity circuit's
 * isOver18 / isPostgrad public inputs.
 *
 * THREAT MITIGATION (T-04-01, 04-01-PLAN.md threat_model): the circuit declares
 * isOver18/isPostgrad as `signal input` that it constrains equal to its own
 * internally-recomputed value — it does NOT derive them as outputs. The
 * caller (an untrusted app/client) must never be allowed to supply these
 * values directly; the backend, which holds the real dob/programmeLevel,
 * computes them itself from the SAME attrs feeding attr[2]/attr[3].
 *
 * Logic mirrors zk-proofs/circuits/identity.circom's digit-shift age check
 * and set-membership predicate exactly (verified against
 * zk-proofs/test/circuitParity.test.js).
 */

/**
 * computeIsOver18(currentDateInt, dobInt) -> 0|1
 *
 * Inclusive boundary (matches circuit's GreaterEqThan):
 *   (currentDateInt - 18*10000) >= dobInt  ?  1 : 0
 *
 * @param {string|number|bigint} currentDateInt — "YYYYMMDD" session date
 * @param {string|number|bigint} dobInt — "YYYYMMDD" date of birth
 * @returns {number} 0 or 1
 */
function computeIsOver18(currentDateInt, dobInt) {
  return BigInt(currentDateInt) - 180000n >= BigInt(dobInt) ? 1 : 0;
}

/**
 * computeIsPostgrad(programmeLevelCode) -> 0|1
 *
 * Set membership: programmeLevelCode in {4 (M.Tech), 5 (M.Des), 6 (PhD)}.
 * Dual (3) is intentionally excluded (mirrors enumCodes.js::POSTGRAD_CODES).
 *
 * @param {string|number} programmeLevelCode
 * @returns {number} 0 or 1
 */
function computeIsPostgrad(programmeLevelCode) {
  return [4, 5, 6].includes(Number(programmeLevelCode)) ? 1 : 0;
}

module.exports = {
  computeIsOver18,
  computeIsPostgrad,
};
