const TYPE_LABEL = { issue: "Issue", revoke: "Revoke" };

export default function PendingTxCard({ tx, onSign, onExecute, alreadySigned, threshold }) {
  const signedCount = tx.signedCount ?? tx.confirmations ?? 0;
  const readyToExecute = signedCount >= threshold;
  const remaining = Math.max(threshold - signedCount, 0);
  const typeLabel = TYPE_LABEL[tx.type] || tx.type;

  return (
    <div className="rounded-2xl bg-white/5 px-4 py-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-white">
            {typeLabel} — {tx.rollNo || tx.safeTxHash}
          </h3>
          <span
            className={
              readyToExecute
                ? "mt-2 inline-block rounded-full bg-emerald-400/15 px-3 py-1 text-xs font-medium text-emerald-200"
                : "mt-2 inline-block rounded-full bg-amber-400/15 px-3 py-1 text-xs font-medium text-amber-200"
            }
          >
            {readyToExecute
              ? `Ready to execute — ${threshold} of ${threshold} signed`
              : `Awaiting ${remaining} more signature${remaining === 1 ? "" : "s"}`}
          </span>
        </div>

        <div className="flex items-center gap-2">
          {alreadySigned ? (
            <span className="text-xs font-semibold text-emerald-400">Signed</span>
          ) : (
            <button
              type="button"
              onClick={() => onSign(tx)}
              className="inline-flex items-center justify-center rounded-2xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Sign
            </button>
          )}

          <button
            type="button"
            onClick={() => onExecute(tx)}
            disabled={!readyToExecute}
            className="destructive-button min-h-[44px]"
          >
            Execute
          </button>
        </div>
      </div>
    </div>
  );
}
