import { useEffect, useState } from "react";
import { ethers } from "ethers";
import toast from "react-hot-toast";

import api, { getApiErrorMessage } from "../services/api.js";
import PendingTxCard from "../components/PendingTxCard.jsx";

const ROLE_LABELS = { acadadmin: "Academic Admin", registrar: "Assistant Registrar", dean: "Dean" };

const EXPECTED_OWNER_BY_ROLE = {
  acadadmin: import.meta.env.VITE_SAFE_OWNER_ACADADMIN,
  registrar: import.meta.env.VITE_SAFE_OWNER_REGISTRAR,
  dean: import.meta.env.VITE_SAFE_OWNER_DEAN,
};

const SIGN_THRESHOLD = 2;
const POLL_INTERVAL_MS = 10000;

function decodeRoleFromToken(token) {
  if (!token) return null;
  try {
    const payload = JSON.parse(atob(token.split(".")[1]));
    return payload.role || null;
  } catch {
    return null;
  }
}

export default function PendingApprovalsPage() {
  const [role] = useState(() => decodeRoleFromToken(localStorage.getItem("officialToken")));
  const [walletAddress, setWalletAddress] = useState(null);
  const [connecting, setConnecting] = useState(false);
  const [pending, setPending] = useState([]);
  const [loading, setLoading] = useState(true);

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
      const provider = new ethers.BrowserProvider(window.ethereum);
      const [address] = await provider.send("eth_requestAccounts", []);
      setWalletAddress(address);
    } catch (error) {
      toast.error(getApiErrorMessage(error));
    } finally {
      setConnecting(false);
    }
  }

  async function handleSign(tx) {
    if (addressMismatch || !walletAddress) {
      toast.error("Connect the correct MetaMask account before signing.");
      return;
    }
    try {
      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      const signature = await signer.signMessage(tx.safeTxHash);
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

  return (
    <div className="min-h-screen px-4 py-10 text-slate-100 sm:px-8">
      <div className="mx-auto max-w-3xl space-y-6">
        <div>
          <p className="text-xs uppercase tracking-[0.35em] text-zinc-400">PrivdId Admin</p>
          <h1 className="mt-2 text-2xl font-semibold text-white">Pending Approvals</h1>
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
            <p className="mt-4 inline-block rounded-full bg-blue-400/15 px-3 py-1 text-xs font-medium text-blue-200">
              Connected: {walletAddress}
            </p>
          )}
        </div>

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
                alreadySigned={Boolean(
                  walletAddress &&
                    Array.isArray(tx.confirmedSigners) &&
                    tx.confirmedSigners.some((signer) => signer.toLowerCase() === walletAddress.toLowerCase())
                )}
                threshold={SIGN_THRESHOLD}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
