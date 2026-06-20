import { useState } from "react";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";

import api, { getApiErrorMessage } from "../services/api.js";

export default function LoginPage() {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setLoading(true);

    try {
      const response = await api.post("/admin/login", { password });
      localStorage.setItem("adminToken", response.data.token);
      navigate("/", { replace: true });
    } catch (error) {
      toast.error(getApiErrorMessage(error));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4 text-slate-100">
      <form onSubmit={handleSubmit} className="panel w-full max-w-sm gap-5 flex flex-col">
        <div>
          <p className="text-xs uppercase tracking-[0.35em] text-zinc-400">PrivdId Admin</p>
          <h1 className="mt-2 text-2xl font-semibold text-white">Admin sign in</h1>
        </div>

        <label className="flex flex-col gap-2 text-sm text-slate-300">
          Admin password
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
          className="rounded-lg bg-blue-600 px-4 py-2.5 font-semibold text-white disabled:opacity-50"
        >
          {loading ? "Signing in..." : "Sign in"}
        </button>
      </form>
    </div>
  );
}
