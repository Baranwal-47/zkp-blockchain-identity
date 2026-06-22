import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { ethers } from "ethers";
import toast from "react-hot-toast";

import api, { getApiErrorMessage } from "../services/api.js";
import { getRole, logout } from "../services/auth.js";
import PendingTxCard from "../components/PendingTxCard.jsx";

const ROLE_LABELS = { acadadmin: "Academic Admin", registrar: "Assistant Registrar", dean: "Dean" };

const EXPECTED_OWNER_BY_ROLE = {
  acadadmin: import.meta.env.VITE_SAFE_OWNER_ACADADMIN,
  registrar: import.meta.env.VITE_SAFE_OWNER_REGISTRAR,
  dean: import.meta.env.VITE_SAFE_OWNER_DEAN,
};

const SIGN_THRESHOLD = 2;
const SAFE_OWNER_COUNT = 3;
const POLL_INTERVAL_MS = 10000;
// The Safe lives on Sepolia (locked decision). The EIP-712 domain chainId must
// match the Safe's chain, NOT MetaMask's currently-selected network — otherwise
// the signature is made over the wrong digest and the Safe service rejects it (422).
const SAFE_CHAIN_ID = Number(import.meta.env.VITE_SAFE_CHAIN_ID || 11155111);

// The Safe Tx Service validates confirmations against the EIP-712 SafeTx digest
// (not personal_sign). Signing this typed struct ecrecovers to the same hash as
// safeTxHash — shared by the propose (1st sig) and the sign (2nd sig) flows.
const SAFE_TX_TYPES = {
  SafeTx: [
    { type: "address", name: "to" },
    { type: "uint256", name: "value" },
    { type: "bytes", name: "data" },
    { type: "uint8", name: "operation" },
    { type: "uint256", name: "safeTxGas" },
    { type: "uint256", name: "baseGas" },
    { type: "uint256", name: "gasPrice" },
    { type: "address", name: "gasToken" },
    { type: "address", name: "refundReceiver" },
    { type: "uint256", name: "nonce" },
  ],
};

async function ensureSepolia() {
  // Make MetaMask switch to Sepolia so the signature, and any later on-chain
  // step, target the right chain. Signing still uses the fixed SAFE_CHAIN_ID
  // domain regardless, but this keeps the wallet UX consistent.
  const hexChainId = "0x" + SAFE_CHAIN_ID.toString(16);
  try {
    await window.ethereum.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: hexChainId }],
    });
  } catch (err) {
    // 4902 = chain not added; ignore — signing uses the explicit domain anyway.
    if (err?.code !== 4902) {
      console.warn("Could not switch MetaMask network:", err?.message);
    }
  }
}

async function signSafeTx(d, safeAddress) {
  await ensureSepolia();
  const provider = new ethers.BrowserProvider(window.ethereum);
  const signer = await provider.getSigner();
  const domain = { chainId: SAFE_CHAIN_ID, verifyingContract: safeAddress };
  const message = {
    to: d.to,
    value: d.value,
    data: d.data,
    operation: d.operation,
    safeTxGas: d.safeTxGas,
    baseGas: d.baseGas,
    gasPrice: d.gasPrice,
    gasToken: d.gasToken,
    refundReceiver: d.refundReceiver,
    nonce: d.nonce,
  };
  return signer.signTypedData(domain, SAFE_TX_TYPES, message);
}

export default function PendingApprovalsPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [role] = useState(() => getRole());
  const [walletAddress, setWalletAddress] = useState(null);
  const [connecting, setConnecting] = useState(false);
  const [pending, setPending] = useState([]);
  const [loading, setLoading] = useState(true);
  const [keyRegistered, setKeyRegistered] = useState(null); // null=loading, true, false

  useEffect(() => {
    if (role === "acadadmin") return;
    api.get("/custodians/status")
      .then(r => setKeyRegistered(r.data.registered?.[role] ?? false))
      .catch(() => setKeyRegistered(false));
  }, [role]);
  // Roll number handed in by the dashboard "Revoke" button (auto-propose target).
  const [revokeTarget, setRevokeTarget] = useState(() => location.state?.proposeRevokeRollNo || null);

  const roleLabel = ROLE_LABELS[role] || role || "Unknown";
  const expectedOwner = EXPECTED_OWNER_BY_ROLE[role];
  const addressMismatch =
    walletAddress && expectedOwner && walletAddress.toLowerCase() !== expectedOwner.toLowerCase();

  async function loadPending() {
    setLoading(true);
    try {
      const response = await api.get("/safe/pending");
      setPending(response.data.pending || []);
    } catch (error) {
      toast.error(getApiErrorMessage(error));
    } finally {
      setLoading(false);
    }
  }

  async function connectWallet() {
    if (!window.ethereum) {
      toast.error("MetaMask not detected. Install MetaMask to continue.");
      return;
    }
    setConnecting(true);
    try {
      await ensureSepolia();
      // Force MetaMask's account picker. eth_requestAccounts alone returns the
      // already-permitted account (often a different role's wallet), which is
      // why switching the active account in MetaMask didn't help — the dApp
      // permission was still scoped to the old account. This re-prompts so the
      // user can pick THIS role's wallet.
      await window.ethereum.request({
        method: "wallet_requestPermissions",
        params: [{ eth_accounts: {} }],
      });
      const accounts = await window.ethereum.request({ method: "eth_accounts" });
      setWalletAddress(accounts[0] || null);
    } catch (error) {
      toast.error(error?.code === 4001 ? "Wallet connection cancelled." : getApiErrorMessage(error));
    } finally {
      setConnecting(false);
    }
  }

  function requireWallet() {
    if (!walletAddress) {
      toast.error("Connect your MetaMask wallet first.");
      return false;
    }
    if (addressMismatch) {
      toast.error("Connected wallet does not match your role. Switch accounts and reconnect.");
      return false;
    }
    return true;
  }

  async function handleSign(tx) {
    if (!requireWallet()) return;
    try {
      const signature = await signSafeTx(tx, tx.safe);
      await api.post("/safe/sign", {
        safeTxHash: tx.safeTxHash,
        signature,
        signerAddress: walletAddress,
      });
      toast.success("Signature submitted.");
      await loadPending();
    } catch (error) {
      toast.error(getApiErrorMessage(error));
    }
  }

  // Proposer flow (1st signature): build the unsigned Safe tx server-side, sign
  // its hash in MetaMask, relay the proposal. action is "revoke" or "acceptAdmin".
  async function proposeAction(action, rollNo) {
    if (!requireWallet()) return;
    try {
      const { data: built } = await api.post("/safe/propose-build", { action, rollNo });
      const signature = await signSafeTx(built.safeTransactionData, built.safe);
      await api.post("/safe/propose", {
        action,
        rollNo,
        safeTransactionData: built.safeTransactionData,
        safeTxHash: built.safeTxHash,
        signature,
        signerAddress: walletAddress,
      });
      toast.success(action === "revoke" ? `Revocation proposed for ${rollNo}.` : "Admin handoff proposed.");
      await loadPending();
    } catch (error) {
      toast.error(getApiErrorMessage(error));
    }
  }

  async function handleReject(tx) {
    if (!window.confirm("Reject and dismiss this proposal? It will not be executed.")) return;
    try {
      await api.post("/safe/reject", { safeTxHash: tx.safeTxHash });
      toast.success("Proposal rejected.");
      await loadPending();
    } catch (error) {
      toast.error(getApiErrorMessage(error));
    }
  }

  async function handleExecute(tx) {
    const typeLabel = tx.type === "issue" ? "issue" : "revoke";
    if (
      window.confirm(
        `Execute this ${typeLabel} transaction now? This will submit it on-chain and cannot be undone.`
      )
    ) {
      try {
        await api.post("/safe/execute", { safeTxHash: tx.safeTxHash });
        toast.success("Transaction executed successfully.");
        await loadPending();
      } catch (error) {
        toast.error(getApiErrorMessage(error));
      }
    }
  }

  useEffect(() => {
    void loadPending();
    const interval = setInterval(() => {
      void loadPending();
    }, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, []);

  // Keep the connected wallet in sync when the user switches accounts in
  // MetaMask, so the role-match check and "Signed" state reflect reality.
  useEffect(() => {
    if (!window.ethereum?.on) return undefined;
    const handler = (accounts) => setWalletAddress(accounts[0] || null);
    window.ethereum.on("accountsChanged", handler);
    return () => window.ethereum.removeListener?.("accountsChanged", handler);
  }, []);

  return (
    <div className="min-h-screen px-4 py-10 text-slate-100 sm:px-8">
      <div className="mx-auto max-w-3xl space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.35em] text-zinc-400">PrivdId Admin</p>
            <h1 className="mt-2 text-2xl font-semibold text-white">Pending Approvals</h1>
          </div>
          <div className="flex gap-2">
            {role === "acadadmin" && (
              <button
                type="button"
                onClick={() => navigate("/")}
                className="rounded-lg border border-slate-700 bg-slate-900/60 px-4 py-2 text-sm font-medium text-slate-200 hover:border-slate-500"
              >
                Dashboard
              </button>
            )}
            <button
              type="button"
              onClick={() => navigate("/recovery")}
              className="rounded-lg border border-slate-700 bg-slate-900/60 px-4 py-2 text-sm font-medium text-slate-200 hover:border-slate-500"
            >
              Recovery
            </button>
            {role !== "acadadmin" && (
              <button
                type="button"
                onClick={() => navigate("/custodian-onboarding")}
                className="relative rounded-lg border border-slate-700 bg-slate-900/60 px-4 py-2 text-sm font-medium text-slate-200 hover:border-slate-500"
                title={keyRegistered ? "Custodian key registered" : "Custodian key not yet registered"}
              >
                Custodian Key
                {keyRegistered === false && (
                  <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-amber-400" />
                )}
                {keyRegistered === true && (
                  <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-green-400" />
                )}
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                logout();
                navigate("/official-login", { replace: true });
              }}
              className="rounded-lg border border-slate-700 bg-slate-900/60 px-4 py-2 text-sm font-medium text-slate-200 hover:border-slate-500"
            >
              Logout
            </button>
          </div>
        </div>

        <div className="panel-soft">
          <h2 className="text-lg font-semibold text-white">Signing as: {roleLabel}</h2>

          {!walletAddress ? (
            <div className="mt-4 space-y-3">
              <p className="text-sm text-slate-400">Connect MetaMask to review pending transactions.</p>
              <button
                type="button"
                onClick={connectWallet}
                disabled={connecting}
                className="inline-flex items-center justify-center rounded-2xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {connecting ? "Connecting..." : "Connect Wallet"}
              </button>
            </div>
          ) : addressMismatch ? (
            <p className="mt-4 rounded-2xl bg-red-400/15 px-4 py-3 text-sm font-medium text-red-200">
              Connected wallet does not match the expected address for {roleLabel}. Switch accounts in MetaMask and
              reconnect.
            </p>
          ) : (
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <p className="inline-block rounded-full bg-blue-400/15 px-3 py-1 text-xs font-medium text-blue-200">
                Connected: {walletAddress}
              </p>
              {role === "acadadmin" && !addressMismatch && (
                <button
                  type="button"
                  onClick={() => proposeAction("acceptAdmin", null)}
                  className="rounded-lg border border-slate-700 bg-slate-900/60 px-3 py-1.5 text-xs font-medium text-slate-300 hover:border-slate-500"
                  title="One-time: make the Safe the registry admin so revocations can execute on-chain."
                >
                  Finish admin handoff (one-time)
                </button>
              )}
            </div>
          )}
        </div>

        {revokeTarget && role === "acadadmin" && (
          <div className="panel-soft border border-amber-400/30">
            <h3 className="text-base font-semibold text-white">Propose revocation: {revokeTarget}</h3>
            <p className="mt-1 text-sm text-slate-400">
              Sign in MetaMask to create the 2-of-3 proposal. The other officials then approve it before you can execute.
            </p>
            <button
              type="button"
              disabled={!walletAddress || addressMismatch}
              onClick={async () => {
                await proposeAction("revoke", revokeTarget);
                setRevokeTarget(null);
              }}
              className="mt-3 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Sign &amp; Propose Revocation
            </button>
          </div>
        )}

        {loading ? (
          <div className="panel grid gap-3">
            {Array.from({ length: 2 }).map((_, index) => (
              <div key={index} className="h-20 animate-pulse rounded-2xl bg-white/5" />
            ))}
          </div>
        ) : pending.length === 0 ? (
          <div className="panel">
            <h3 className="text-lg font-semibold text-white">No pending approvals.</h3>
            <p className="mt-2 text-sm text-slate-400">
              All registry actions are currently signed and executed, or none have been proposed yet.
            </p>
          </div>
        ) : (
          <div className="panel space-y-3">
            {pending.map((tx) => (
              <PendingTxCard
                key={tx.safeTxHash}
                tx={tx}
                onSign={handleSign}
                onExecute={handleExecute}
                onReject={handleReject}
                canReject={role !== "acadadmin"}
                alreadySigned={Boolean(
                  walletAddress &&
                    !addressMismatch &&
                    Array.isArray(tx.confirmedSigners) &&
                    tx.confirmedSigners.some((signer) => signer.toLowerCase() === walletAddress.toLowerCase())
                )}
                threshold={SIGN_THRESHOLD}
                ownerCount={SAFE_OWNER_COUNT}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
