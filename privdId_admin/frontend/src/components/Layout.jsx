import { NavLink, Outlet, useNavigate } from "react-router-dom";

import { logout } from "../services/auth.js";

const navigation = [
  { to: "/", label: "Dashboard" },
  { to: "/students/new", label: "Add Student" },
  { to: "/students/upload", label: "Upload Excel" },
  { to: "/pending-approvals", label: "Pending Approvals" },
];

export default function Layout() {
  const navigate = useNavigate();

  function handleLogout() {
    logout();
    navigate("/official-login", { replace: true });
  }

  return (
    <div className="relative min-h-screen overflow-hidden text-slate-100">
      <div className="relative mx-auto flex min-h-screen w-full max-w-7xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
        <header className="panel flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.35em] text-zinc-400">PrivdId Admin</p>
            <h1 className="mt-2 text-2xl font-semibold text-white sm:text-3xl">Student registry dashboard</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-300">
              Create students, upload Excel sheets, and distribute credentials while every record is protected with Poseidon hashing.
            </p>
          </div>

          <nav className="flex flex-wrap gap-2">
            {navigation.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === "/"}
                className={({ isActive }) => `${isActive ? "nav-link nav-link-active" : "nav-link"}`}
              >
                {item.label}
              </NavLink>
            ))}
            <button type="button" onClick={handleLogout} className="nav-link">
              Logout
            </button>
          </nav>
        </header>

        <main className="flex-1">
          <Outlet />
        </main>
      </div>
    </div>
  );
}