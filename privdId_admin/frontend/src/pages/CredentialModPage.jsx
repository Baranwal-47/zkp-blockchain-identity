import { useNavigate } from "react-router-dom";
import { CustodianSubmitPanel } from "./RecoveryPage.jsx";
import { getRole } from "../services/auth.js";

export default function CredentialModPage() {
  const navigate = useNavigate();
  const role = getRole();

  return (
    <div className="min-h-screen px-4 py-10 text-slate-100 sm:px-8">
      <div className="mx-auto max-w-3xl space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.35em] text-zinc-400">PrivdId Admin</p>
            <h1 className="mt-2 text-2xl font-semibold text-white">Credential Modification</h1>
          </div>
          <button
            type="button"
            onClick={() => navigate(role === "acadadmin" ? "/" : "/pending-approvals")}
            className="rounded-lg border border-white/10 px-4 py-2 text-sm text-slate-300 hover:bg-white/5"
          >
            {role === "acadadmin" ? "Dashboard" : "Pending Approvals"}
          </button>
        </div>

        {role === "acadadmin" ? (
          <div className="rounded-lg border border-white/10 bg-white/5 p-5 text-sm text-slate-300 space-y-2">
            <p className="font-semibold text-white">How credential modification works</p>
            <p>
              Sessions are opened automatically when you edit a claimed student — the system detects
              the credential is locked and initiates a Shamir recovery session. A custodian (Registrar
              or Dean) then submits their share here to complete re-encryption.
            </p>
            <p>
              Once re-encryption completes you will be prompted to propose the on-chain update via
              Safe 2-of-3 in Pending Approvals.
            </p>
          </div>
        ) : (
          <CustodianSubmitPanel filter="credential-mod" />
        )}
      </div>
    </div>
  );
}
