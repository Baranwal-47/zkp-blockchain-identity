import { useEffect, useState } from "react";
import toast from "react-hot-toast";

import StudentsTable from "../components/StudentsTable.jsx";
import api, { getApiErrorMessage } from "../services/api.js";

export default function DashboardPage() {
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState([]);
  const [emailSendDetails, setEmailSendDetails] = useState([]);

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

  async function handleRevoke(studentId) {
    if (window.confirm("Are you sure you want to revoke this student's credential? This action is irreversible.")) {
      try {
        await api.delete(`/students/${studentId}`);
        toast.success("Student credential revoked successfully.");
        await loadStudents();
      } catch (error) {
        toast.error(getApiErrorMessage(error));
      }
    }
  }

  useEffect(() => {
    void loadStudents();
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