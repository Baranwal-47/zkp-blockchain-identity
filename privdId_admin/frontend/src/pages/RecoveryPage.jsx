import { useState, useEffect } from "react";
import { useLocation } from "react-router-dom";
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

function CustodianSubmitPanel() {
  const [sessionId, setSessionId] = useState("");
  const [pemFile, setPemFile] = useState(null);
  const [working, setWorking] = useState(false);
  const [outcome, setOutcome] = useState(null); // { status, sharesReceived } | null

  async function handleFetchAndSubmit() {
    if (!sessionId.trim()) {
      toast.error("Paste the Session ID first.");
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

      const { data } = await api.get(`/recovery/${sessionId.trim()}/my-share`);

      const decryptedBuffer = await window.crypto.subtle.decrypt(
        { name: "RSA-OAEP" },
        privateKey,
        base64ToArrayBuffer(data.wrappedShare)
      );
      const shareHex = new TextDecoder("utf-8").decode(decryptedBuffer);

      const { data: submitResult } = await api.post("/recovery/submit-share", {
        sessionId: sessionId.trim(),
        shareHex,
      });

      setOutcome(submitResult);
      toast.success(
        submitResult.status === "complete" ? "Recovery completed." : "Share submitted."
      );
    } catch (err) {
      toast.error(getApiErrorMessage(err));
    } finally {
      setWorking(false);
    }
  }

  return (
    <div className="panel-soft space-y-4">
      <h2 className="text-lg font-semibold text-white">Submit My Share</h2>
      <p className="text-sm text-slate-400">
        Paste the Session ID from the AcadAdmin, select your private key PEM (downloaded at
        onboarding), and submit. Your decrypted share is never displayed or stored — it goes
        straight from decryption into the submission request.
      </p>

      <div>
        <label className="block text-sm font-medium text-slate-300">Session ID</label>
        <input
          type="text"
          value={sessionId}
          onChange={(e) => setSessionId(e.target.value)}
          className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900/60 px-3 py-2 text-sm font-mono text-slate-100"
          placeholder="paste session id"
        />
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
        disabled={working}
        className="inline-flex items-center justify-center rounded-2xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {working ? "Working…" : "Fetch & Submit My Share"}
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
              <p className="font-semibold text-base">Credential updated — on-chain anchor pending</p>
              <p>
                New ciphertext was pinned, but the on-chain anchor write failed and will need a
                retry.
              </p>
              {outcome.result?.ciphertextCID && (
                <p className="font-mono text-xs text-green-800">
                  New ciphertext CID: {outcome.result.ciphertextCID}
                </p>
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
  const preselectedStudentId = location.state?.studentId;

  return (
    <div className="min-h-screen px-4 py-10 text-slate-100 sm:px-8">
      <div className="mx-auto max-w-3xl space-y-6">
        <div>
          <p className="text-xs uppercase tracking-[0.35em] text-zinc-400">PrivdId Admin</p>
          <h1 className="mt-2 text-2xl font-semibold text-white">Credential Recovery</h1>
        </div>

        {role === "acadadmin" ? (
          <AcadAdminInitiatePanel preselectedStudentId={preselectedStudentId} />
        ) : (
          <CustodianSubmitPanel />
        )}
      </div>
    </div>
  );
}
