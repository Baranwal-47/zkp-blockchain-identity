/**
 * timing.js — shared performance instrumentation helper (ESM copy).
 *
 * Canonical source: docs/CLAUDE_CODE_BLUEPRINT.md §10.1. privdId_admin/backend
 * is ESM, so this file exports via `export`; zkp-backend has an independent
 * CommonJS copy (zkp-backend/utils/timing.js) per module-system note D-15 —
 * deliberately NOT shared across services (no cross-service import).
 *
 * timed(label, fn) awaits fn(), measures elapsed wall-clock time via the
 * global `performance.now()` (Node 16+, no extra dependency), prints
 * `[perf] {label}: {seconds.toFixed(3)} s`, and returns { out, seconds }
 * where `out` is fn()'s return value verbatim (T-05-01: response/result
 * shape is never altered by this wrapper).
 */

export async function timed(label, fn) {
  const t0 = performance.now();
  const out = await fn();
  const seconds = (performance.now() - t0) / 1000;
  console.log(`[perf] ${label}: ${seconds.toFixed(3)} s`);
  return { out, seconds };
}
