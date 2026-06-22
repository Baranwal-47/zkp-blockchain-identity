import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import toast from "react-hot-toast";

import StudentsTable from "../components/StudentsTable.jsx";
import api, { getApiErrorMessage } from "../services/api.js";

const TYPE_LABEL = { issue: "Issue", revoke: "Revoke" };
const SIGN_THRESHOLD = 2;

export default function DashboardPage() {
  const navigate = useNavigate();
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState([]);
  const [emailSendDetails, setEmailSendDetails] = useState([]);
  const [pendingActions, setPendingActions] = useState([]);

  async function loadStudents() {
    setLoading(true);

    try {
      const response = await api.get("/students");
      setStudents(response.data.students || []);
    } catch (error) {
      toast.error(getApiErrorMessage(error));
    } finally {
      setLoading(false);
    }
  }

  async function loadPendingActions() {
    try {
      const response = await api.get("/safe/pending");
      setPendingActions(response.data.pending || []);
    } catch (error) {
      toast.error(getApiErrorMessage(error));
    }
  }

  function handleToggleSelect(studentId) {
    setSelectedIds((current) =>
      current.includes(studentId) ? current.filter((id) => id !== studentId) : [...current, studentId]
    );
  }

  function handleToggleSelectAll() {
    setSelectedIds((current) => (current.length === students.length ? [] : students.map((student) => student.id)));
  }

  async function handleSendSelected() {
    if (!selectedIds.length) {
      toast.error("Select at least one student first.");
      return;
    }

    try {
      const response = await api.post("/students/send-email", { studentIds: selectedIds });
      setEmailSendDetails(response.data.details || []);
      await loadStudents();
      setSelectedIds([]);

      const sentCount = response.data.summary?.sent?.length || 0;
      const skippedCount = response.data.summary?.skipped?.length || 0;
      const failedCount = Array.isArray(response.data.summary?.failed) ? response.data.summary.failed.length : 0;

      toast.success(`Emails processed: ${sentCount} sent, ${skippedCount} skipped, ${failedCount} failed.`);
    } catch (error) {
      toast.error(getApiErrorMessage(error));
    }
  }

  function handleRevoke(studentId) {
    const student = students.find((s) => s.id === studentId);
    if (!student) return;
    if (student.revoked) {
      toast.error("This credential is already revoked.");
      return;
    }
    // Revocation is Safe-governed: hand off to Pending Approvals, where the
    // acad-admin signs the proposal in MetaMask (1 of 2) and officials approve.
    if (
      window.confirm(
        `Propose revoking ${student.rollNo}? You'll sign it in MetaMask, then 2 of 3 officials must approve before it executes on-chain.`
      )
    ) {
      navigate("/pending-approvals", { state: { proposeRevokeRollNo: student.rollNo } });
    }
  }

  useEffect(() => {
    void loadStudents();
    void loadPendingActions();
  }, []);

  const totalStudents = students.length;
  const uniqueProgrammes = new Set(students.map((student) => student.programmeLevel)).size;
  const emailedStudents = students.filter((student) => student.emailSent).length;

  return (
    <div className="space-y-6">
      <section className="grid gap-4 md:grid-cols-3">
        <div className="panel-soft">
          <p className="text-sm text-slate-400">Total students</p>
          <h3 className="mt-3 text-3xl font-semibold text-white">{totalStudents}</h3>
        </div>
        <div className="panel-soft">
          <p className="text-sm text-slate-400">Emails sent</p>
          <h3 className="mt-3 text-3xl font-semibold text-white">{emailedStudents}</h3>
        </div>
        <div className="panel-soft">
          <p className="text-sm text-slate-400">Programmes</p>
          <h3 className="mt-3 text-3xl font-semibold text-white">{uniqueProgrammes}</h3>
        </div>
      </section>

      <section className="panel-soft">
        <h3 className="text-lg font-semibold text-white">Pending Registry Actions</h3>

        {pendingActions.length === 0 ? (
          <p className="mt-3 text-sm text-slate-400">No pending registry actions.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {pendingActions.map((tx) => {
              const signedCount = tx.signedCount ?? tx.confirmations ?? 0;
              const remaining = Math.max(SIGN_THRESHOLD - signedCount, 0);
              const typeLabel = TYPE_LABEL[tx.type] || tx.type;
              return (
                <li
                  key={tx.safeTxHash}
                  className="flex items-center justify-between rounded-2xl bg-white/5 px-4 py-3"
                >
                  <span className="text-sm text-slate-200">
                    {typeLabel} requested for {tx.rollNo}, awaiting {remaining} more signature{remaining === 1 ? "" : "s"}
                  </span>
                  <span className="rounded-full bg-amber-400/15 px-3 py-1 text-xs font-medium text-amber-200">
                    {signedCount}/{SIGN_THRESHOLD}
                  </span>
                </li>
              );
            })}
          </ul>
        )}

        <p className="mt-3 text-sm text-slate-500">
          <Link to="/pending-approvals" className="hover:text-slate-300">
            View and sign in Pending Approvals.
          </Link>
        </p>
      </section>

      <StudentsTable
        students={students}
        loading={loading}
        onRefresh={loadStudents}
        selectedIds={selectedIds}
        onToggleSelect={handleToggleSelect}
        onToggleSelectAll={handleToggleSelectAll}
        onSendSelected={handleSendSelected}
        onRevoke={handleRevoke}
      />

      {emailSendDetails.length > 0 && (
        <section className="panel space-y-4">
          <div>
            <h3 className="text-lg font-semibold text-white">Last Email Run</h3>
            <p className="mt-1 text-sm text-slate-400">Per-student success and failure details for your latest selection.</p>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full border-separate border-spacing-y-2 text-left">
              <thead>
                <tr className="text-xs uppercase tracking-[0.2em] text-slate-500">
                  <th className="px-4 py-2">Student</th>
                  <th className="px-4 py-2">Email</th>
                  <th className="px-4 py-2">Result</th>
                  <th className="px-4 py-2">Detail</th>
                </tr>
              </thead>
              <tbody>
                {emailSendDetails.map((entry) => (
                  <tr key={entry.studentId} className="bg-white/5 text-sm text-slate-200">
                    <td className="rounded-l-2xl px-4 py-3 font-medium text-white">{entry.name}</td>
                    <td className="px-4 py-3">{entry.email}</td>
                    <td className="px-4 py-3">
                      <span
                        className={
                          entry.status === "sent"
                            ? "rounded-full bg-zinc-600/40 px-3 py-1 text-xs font-medium text-zinc-100"
                            : entry.status === "failed"
                              ? "rounded-full bg-zinc-700/60 px-3 py-1 text-xs font-medium text-zinc-200"
                              : "rounded-full bg-zinc-800/80 px-3 py-1 text-xs font-medium text-zinc-300"
                        }
                      >
                        {entry.status}
                      </span>
                    </td>
                    <td className="rounded-r-2xl px-4 py-3 text-slate-300">{entry.message}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}