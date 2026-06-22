import { useState, useEffect } from "react";
import api, { getApiErrorMessage } from "../services/api.js";
import { getRole } from "../services/auth.js";

function pemFromBuffer(type, buffer) {
  const b64 = btoa(String.fromCharCode(...new Uint8Array(buffer)));
  const lines = b64.match(/.{1,64}/g).join("\n");
  return `-----BEGIN ${type}-----\n${lines}\n-----END ${type}-----\n`;
}

function downloadPem(filename, pem) {
  const blob = new Blob([pem], { type: "application/x-pem-file" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function CustodianOnboardingPage() {
  const role = getRole();
  const [status, setStatus] = useState("loading"); // loading | idle | generating | done | error
  const [error, setError] = useState(null);

  useEffect(() => {
    api.get("/custodians/status")
      .then(r => {
        if (r.data.registered?.[role]) setStatus("done");
        else setStatus("idle");
      })
      .catch(() => setStatus("idle"));
  }, [role]);

  if (role === "acadadmin") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-neutral-50">
        <div className="bg-white rounded-xl shadow p-8 max-w-md w-full text-center">
          <p className="text-neutral-600">
            AcadAdmin holds the plaintext Share A and does not require a custodian keypair (D-03).
          </p>
        </div>
      </div>
    );
  }

  async function handleGenerate() {
    setStatus("generating");
    setError(null);
    try {
      const keypair = await window.crypto.subtle.generateKey(
        {
          name: "RSA-OAEP",
          modulusLength: 2048,
          publicExponent: new Uint8Array([1, 0, 1]),
          hash: "SHA-256",
        },
        true,
        ["encrypt", "decrypt"]
      );

      const [pubDer, privDer] = await Promise.all([
        window.crypto.subtle.exportKey("spki",  keypair.publicKey),
        window.crypto.subtle.exportKey("pkcs8", keypair.privateKey),
      ]);

      const publicKeyPem  = pemFromBuffer("PUBLIC KEY",  pubDer);
      const privateKeyPem = pemFromBuffer("PRIVATE KEY", privDer);

      // Download private key to device — it is NEVER sent to the server.
      downloadPem(`${role}_private.pem`, privateKeyPem);

      // POST only the public key.
      await api.post("/custodians/register-key", { role, publicKeyPem });

      setStatus("done");
    } catch (err) {
      setError(getApiErrorMessage(err));
      setStatus("error");
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-neutral-50">
      <div className="bg-white rounded-xl shadow p-8 max-w-md w-full space-y-6">
        <h1 className="text-2xl font-semibold text-indigo-700">Custodian Key Onboarding</h1>
        <p className="text-neutral-600 text-sm">
          Generates your RSA-2048 keypair <strong>in this browser</strong>. Your private key is
          downloaded directly to your device and is <strong>never sent to the server</strong>. Only
          your public key is registered.
        </p>

        {status === "loading" ? (
          <p className="text-neutral-400 text-sm">Checking registration status…</p>
        ) : status === "idle" || status === "error" ? (
          <button
            onClick={handleGenerate}
            className="w-full py-2 px-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-medium transition-colors"
          >
            Generate my custodian keypair
          </button>
        ) : status === "generating" ? (
          <p className="text-indigo-600 text-sm">Generating keypair…</p>
        ) : (
          <div className="rounded-lg bg-green-50 border border-green-200 p-4 text-sm text-green-800 space-y-2">
            <p className="font-semibold text-base">✓ Custodian keypair registered</p>
            <p>Your <strong>public key</strong> is stored on the server and will be used to encrypt your DEK share at every issuance.</p>
            <p>Your <strong>private key</strong> was downloaded to your device (<code>{role}_private.pem</code>) and was <strong>never transmitted</strong> to the server. Keep it safe — it is required for Phase 11 DEK recovery.</p>
          </div>
        )}

        {status === "done" && (
          <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded p-3">
            ⚠ Save the downloaded <code>{role}_private.pem</code> securely. You will need it for
            Phase 11 DEK reconstruction. It cannot be re-downloaded.
          </p>
        )}

        {error && (
          <p className="text-sm text-red-600">{error}</p>
        )}
      </div>
    </div>
  );
}
