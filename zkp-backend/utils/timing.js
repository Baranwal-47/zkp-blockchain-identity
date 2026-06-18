/**
 * timing.js — shared performance instrumentation helper (CommonJS copy).
 *
 * Canonical source: docs/CLAUDE_CODE_BLUEPRINT.md §10.1. zkp-backend is
 * CommonJS, so this file exports via module.exports; privdId_admin/backend
 * has an independent ESM copy (privdId_admin/backend/utils/timing.js) per
 * module-system note D-15 — deliberately NOT shared across services.
 *
 * timed(label, fn) awaits fn(), measures elapsed wall-clock time via the
 * global `performance.now()` (Node 16+, no extra dependency), prints
 * `[perf] {label}: {seconds.toFixed(3)} s`, and returns { out, seconds }
 * where `out` is fn()'s return value verbatim (T-05-01: response/result
 * shape is never altered by this wrapper).
 */

async function timed(label, fn) {
  const t0 = performance.now();
  const out = await fn();
  const seconds = (performance.now() - t0) / 1000;
  console.log(`[perf] ${label}: ${seconds.toFixed(3)} s`);
  return { out, seconds };
}

module.exports = { timed };
