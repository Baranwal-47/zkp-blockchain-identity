import { useState } from "react";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";

import api, { getApiErrorMessage } from "../services/api.js";

const ROLE_OPTIONS = [
  { value: "acadadmin", label: "Academic Admin" },
  { value: "registrar", label: "Assistant Registrar" },
  { value: "dean", label: "Dean" },
];

export default function RoleLoginPage() {
  const navigate = useNavigate();
  const [role, setRole] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [roleError, setRoleError] = useState("");

  async function handleSubmit(event) {
    event.preventDefault();

    if (!role) {
      setRoleError("Select your role first.");
      return;
    }
    setRoleError("");
    setLoading(true);

    try {
      const response = await api.post("/admin/role-login", { role, password });
      localStorage.setItem("officialToken", response.data.token);
      // Academic Admin lands on the full dashboard; officials go to approvals.
      navigate(role === "acadadmin" ? "/" : "/pending-approvals", { replace: true });
    } catch (error) {
      toast.error(getApiErrorMessage(error) || "Incorrect password for this role. Try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4 text-slate-100">
      <form onSubmit={handleSubmit} className="panel w-full max-w-sm gap-5 flex flex-col">
        <div>
          <p className="text-xs uppercase tracking-[0.35em] text-zinc-400">PrivdId Admin</p>
          <h1 className="mt-2 text-2xl font-semibold text-white">Official sign-in</h1>
        </div>

        <div className="flex flex-col gap-2 text-sm text-slate-300">
          Role
          <div className="flex flex-wrap gap-2">
            {ROLE_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => {
                  setRole(option.value);
                  setRoleError("");
                }}
                className={
                  role === option.value
                    ? "rounded-lg border border-blue-500 bg-blue-600/20 px-3 py-2 text-sm font-semibold text-blue-200"
                    : "rounded-lg border border-slate-700 bg-slate-900/60 px-3 py-2 text-sm text-slate-300 hover:border-slate-500"
                }
              >
                {option.label}
              </button>
            ))}
          </div>
          {roleError && <p className="text-xs font-medium text-red-400">{roleError}</p>}
        </div>

        <label className="flex flex-col gap-2 text-sm text-slate-300">
          Password
          <input
            type="password"
            autoFocus
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="rounded-lg border border-slate-700 bg-slate-900/60 px-3 py-2 text-slate-100 outline-none focus:border-blue-500"
          />
        </label>

        <button
          type="submit"
          disabled={loading || !password}
          className="min-h-[44px] rounded-lg bg-blue-600 px-4 py-2.5 font-semibold text-white disabled:opacity-50"
        >
          {loading ? "Signing in..." : "Continue"}
        </button>
      </form>
    </div>
  );
}
