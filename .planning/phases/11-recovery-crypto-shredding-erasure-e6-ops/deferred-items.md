# Deferred Items — Phase 11

Items discovered during execution that are out of scope for the current plan's
files and were NOT auto-fixed (per executor scope-boundary rule).

## 11-01

- **react-hooks/set-state-in-effect lint error in PendingApprovalsPage.jsx**
  (`loadPending()` called synchronously inside `useEffect` at line ~223).
  Pre-existing from Phase 09/10 work, unrelated to the Task 5 change (which only
  added a "Recovery" nav button). Out of scope for 11-01 — left untouched.
