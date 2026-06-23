import { useState, useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import toast from "react-hot-toast";

import api, { getApiErrorMessage } from "../services/api.js";
import { getRole } from "../services/auth.js";

function base64ToArrayBuffer(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

function pemToDer(pem) {
  const b64 = pem
    .replace(/-----BEGIN [^-]+-----/, "")
    .replace(/-----END [^-]+-----/, "")
    .replace(/\s+/g, "");
  return base64ToArrayBuffer(b64);
}

function copyToClipboard(text) {
  navigator.clipboard.writeText(text);
  toast.success("Copied to clipboard.");
}

// 11-02 REDESIGN: this panel is now device-loss-only. Credential-mod sessions
// are opened transparently from the Edit flow's 409 (EditStudentPage.jsx) —
// no dropdown, no manual-pubkey input. The student supplies their new pubkey
// later from their own device (mobile app), so the admin's only job here is
// to pick the student and open the session; the resulting Session ID is what
// the student and a custodian both need.
function AcadAdminInitiatePanel({ preselectedStudentId }) {
  const [students, setStudents] = useState([]);
  const [studentId, setStudentId] = useState(preselectedStudentId || "");
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null); // { sessionId, sharesReceived, sharesNeeded }

  useEffect(() => {
    api
      .get("/students")
      .then((r) => setStudents(r.data.students || r.data || []))
      .catch((err) => toast.error(getApiErrorMessage(err)));
  }, []);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!studentId) {
      toast.error("Pick a student.");
      return;
    }

    setSubmitting(true);
    try {
      const { data } = await api.post("/recovery/initiate", {
        studentId,
        operationType: "device-loss",
      });
      setResult(data);
      toast.success("Recovery session opened.");
    } catch (err) {
      toast.error(getApiErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="panel-soft space-y-4">
      <h2 className="text-lg font-semibold text-white">Initiate Device-Loss Recovery</h2>
      <p className="text-sm text-slate-400">
        The student will generate a fresh keypair on their own device and submit the new public
        key into this session — you don&apos;t need to know or enter it here.
      </p>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-slate-300">Student</label>
          <select
            value={studentId}
            onChange={(e) => setStudentId(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900/60 px-3 py-2 text-sm text-slate-100"
          >
            <option value="">— Select a student —</option>
            {students.map((s) => (
              <option key={s.id} value={s.id}>
                {s.rollNo} — {s.name}
              </option>
            ))}
          </select>
        </div>

        <button
          type="submit"
          disabled={submitting}
          className="inline-flex items-center justify-center rounded-2xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {submitting ? "Opening session…" : "Initiate Device-Loss Recovery"}
        </button>
      </form>

      {result && (
        <div className="rounded-lg bg-green-50 border border-green-200 p-4 text-sm text-green-900 space-y-2">
          <p className="font-semibold text-base">Session opened</p>
          <div className="flex items-center gap-2">
            <code className="select-all rounded bg-white px-2 py-1 font-mono text-xs text-green-900 border border-green-200">
              {result.sessionId}
            </code>
            <button
              type="button"
              onClick={() => copyToClipboard(result.sessionId)}
              className="rounded border border-green-300 px-2 py-1 text-xs font-medium text-green-800 hover:bg-green-100"
            >
              Copy
            </button>
            <span className="inline-block rounded-full bg-green-200 px-3 py-1 text-xs font-medium text-green-900">
              {result.sharesReceived}/{result.sharesNeeded} shares
            </span>
          </div>
          <p>
            Share this Session ID with one custodian (Registrar or Dean) so they can submit their
            share below, and with the student so they can log in on the mobile app and claim a
            new device key. Either can happen first.
          </p>
        </div>
      )}
    </div>
  );
}

const OP_LABELS = { "credential-mod": "Credential update", "device-loss": "Device-loss recovery" };

export function CustodianSubmitPanel({ filter = null }) {
  const navigate = useNavigate();
  const [sessions, setSessions] = useState(null); // null = loading, [] = none
  const [selectedId, setSelectedId] = useState("");
  const [pemFile, setPemFile] = useState(null);
  const [working, setWorking] = useState(false);
  const [outcome, setOutcome] = useState(null);

  useEffect(() => {
    api.get("/recovery/status")
      .then((r) => {
        const map = r.data.sessions || {};
        let list = Object.entries(map).map(([studentId, s]) => ({ studentId, ...s }));
        if (filter) list = list.filter((s) => s.operationType === filter);
        setSessions(list);
      })
      .catch((err) => { toast.error(getApiErrorMessage(err)); setSessions([]); });
  }, [filter]);

  const sessionId = selectedId;

  async function handleFetchAndSubmit() {
    if (!sessionId) {
      toast.error("Select an open session first.");
      return;
    }
    if (!pemFile) {
      toast.error("Select your private key PEM file.");
      return;
    }

    setWorking(true);
    setOutcome(null);
    try {
      const pemText = await pemFile.text();
      const derBytes = pemToDer(pemText);
      const privateKey = await window.crypto.subtle.importKey(
        "pkcs8",
        derBytes,
        { name: "RSA-OAEP", hash: "SHA-256" },
        false,
        ["decrypt"]
      );

      const { data } = await api.get(`/recovery/${sessionId}/my-share`);

      const decryptedBuffer = await window.crypto.subtle.decrypt(
        { name: "RSA-OAEP" },
        privateKey,
        base64ToArrayBuffer(data.wrappedShare)
      );
      const shareHex = new TextDecoder("utf-8").decode(decryptedBuffer);

      const { data: submitResult } = await api.post("/recovery/submit-share", {
        sessionId,
        shareHex,
      });

      setOutcome(submitResult);
      toast.success(
        submitResult.status === "complete" ? "Recovery completed." : "Share submitted — waiting for more."
      );
    } catch (err) {
      toast.error(getApiErrorMessage(err));
    } finally {
      setWorking(false);
    }
  }

  return (
    <div className="panel-soft space-y-4">
      <h2 className="text-lg font-semibold text-white">Submit My Custodian Share</h2>
      <p className="text-sm text-slate-400">
        Open sessions are listed automatically. Pick one, load your private key PEM (downloaded at
        onboarding), and submit. Your decrypted share goes straight to the server — never displayed.
      </p>

      <div>
        <label className="block text-sm font-medium text-slate-300">Open recovery sessions</label>
        {sessions === null ? (
          <p className="mt-1 text-sm text-slate-500">Loading…</p>
        ) : sessions.length === 0 ? (
          <p className="mt-1 rounded-lg border border-slate-700 bg-slate-900/40 px-3 py-3 text-sm text-slate-400">
            No open recovery sessions right now. Ask the AcadAdmin to initiate one.
          </p>
        ) : (
          <div className="mt-1 space-y-2">
            {sessions.map((s) => (
              <button
                key={s.sessionId}
                type="button"
                onClick={() => setSelectedId(s.sessionId)}
                className={`w-full text-left rounded-lg border px-4 py-3 text-sm transition ${
                  selectedId === s.sessionId
                    ? "border-indigo-500 bg-indigo-500/10 text-white"
                    : "border-slate-700 bg-slate-900/40 text-slate-300 hover:border-slate-500"
                }`}
              >
                <span className="font-medium">{OP_LABELS[s.operationType] ?? s.operationType}</span>
                <span className="ml-2 rounded-full bg-slate-700 px-2 py-0.5 text-xs text-slate-400">
                  {s.sharesReceived}/2 shares
                </span>
                <span className="ml-1 font-mono text-xs text-slate-500">{s.sessionId.slice(0, 8)}…</span>
              </button>
            ))}
          </div>
        )}
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-300">Your private key (.pem)</label>
        <input
          type="file"
          accept=".pem"
          onChange={(e) => setPemFile(e.target.files?.[0] || null)}
          className="mt-1 w-full text-sm text-slate-300"
        />
      </div>

      <button
        type="button"
        onClick={handleFetchAndSubmit}
        disabled={working || !selectedId}
        className="inline-flex items-center justify-center rounded-2xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {working ? "Working…" : "Submit My Share"}
      </button>

      {outcome && outcome.status === "pending" && (
        <p className="rounded-lg bg-amber-50 border border-amber-200 p-4 text-sm text-amber-800">
          {outcome.waitingOnPubKey
            ? "Share received — now waiting on the student to submit their new device key before this can complete."
            : "Waiting on one more share."}
        </p>
      )}
      {outcome && outcome.status === "complete" && outcome.operationType === "device-loss" && (
        <div className="rounded-lg bg-green-50 border border-green-200 p-4 text-sm text-green-900 space-y-1">
          <p className="font-semibold text-base">Device-loss recovery complete</p>
          <p>
            The student&apos;s new device key is now live. Daily access is restored — no on-chain
            transaction was needed.
          </p>
          {outcome.result?.dekEnvelopeCID && (
            <p className="font-mono text-xs text-green-800">
              New DEK envelope CID: {outcome.result.dekEnvelopeCID}
            </p>
          )}
        </div>
      )}
      {outcome && outcome.status === "complete" && outcome.operationType === "credential-mod" && (
        <div className="rounded-lg bg-green-50 border border-green-200 p-4 text-sm text-green-900 space-y-1">
          {outcome.result?.anchorPending ? (
            <>
              <p className="font-semibold text-base">Credential re-encrypted — Safe proposal required</p>
              <p>
                New ciphertext pinned. The on-chain update requires a 2-of-3 Safe approval —
                go to Pending Approvals to propose and sign it.
              </p>
              {outcome.result?.ciphertextCID && (
                <p className="font-mono text-xs text-green-800">
                  New ciphertext CID: {outcome.result.ciphertextCID}
                </p>
              )}
              {outcome.result?.student?.rollNo && (
                <button
                  type="button"
                  onClick={() =>
                    navigate("/pending-approvals", {
                      state: { proposeUpdateRollNo: outcome.result.student.rollNo },
                    })
                  }
                  className="mt-2 rounded bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-500"
                >
                  Propose on-chain update →
                </button>
              )}
            </>
          ) : (
            <>
              <p className="font-semibold text-base">Credential updated and re-anchored on-chain</p>
              <p>New ciphertext pinned and the new Merkle root is anchored on-chain.</p>
              {outcome.result?.onChainTxHash && (
                <p className="font-mono text-xs text-green-800">
                  Tx hash: {outcome.result.onChainTxHash}
                </p>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

export default function RecoveryPage() {
  const role = getRole();
  const location = useLocation();
  const navigate = useNavigate();
  const preselectedStudentId = location.state?.studentId;

  return (
    <div className="min-h-screen px-4 py-10 text-slate-100 sm:px-8">
      <div className="mx-auto max-w-3xl space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.35em] text-zinc-400">PrivdId Admin</p>
            <h1 className="mt-2 text-2xl font-semibold text-white">Credential Recovery</h1>
          </div>
          <button
            type="button"
            onClick={() => navigate(role === "acadadmin" ? "/" : "/pending-approvals")}
            className="rounded-lg border border-slate-700 bg-slate-900/60 px-4 py-2 text-sm font-medium text-slate-200 hover:border-slate-500 whitespace-nowrap"
          >
            ← Back
          </button>
        </div>

        {role === "acadadmin" ? (
          <AcadAdminInitiatePanel preselectedStudentId={preselectedStudentId} />
        ) : (
          <CustodianSubmitPanel filter="device-loss" />
        )}
      </div>
    </div>
  );
}
