import { formatDate, truncate } from "../utils/format.js";
import { Link } from "react-router-dom";

export default function StudentsTable({
  students,
  loading,
  onRefresh,
  selectedIds,
  onToggleSelect,
  onToggleSelectAll,
  onSendSelected,
  onRevoke,
  onRecover,
}) {
  const allSelected = students.length > 0 && selectedIds.length === students.length;
  const someSelected = selectedIds.length > 0 && selectedIds.length < students.length;

  if (loading) {
    return (
      <div className="panel grid gap-4">
        <div className="h-6 w-40 animate-pulse rounded-full bg-white/10" />
        <div className="grid gap-3">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="h-16 animate-pulse rounded-2xl bg-white/5" />
          ))}
        </div>
      </div>
    );
  }

  if (!students.length) {
    return (
      <div className="panel flex flex-col items-start gap-4">
        <div>
          <h3 className="text-lg font-semibold text-white">No students yet</h3>
          <p className="mt-2 text-sm text-slate-400">Add a student manually or upload an Excel sheet to populate the dashboard.</p>
        </div>
        <button className="secondary-button" type="button" onClick={onRefresh}>
          Refresh list
        </button>
      </div>
    );
  }

  return (
    <div className="panel overflow-hidden">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-white">Students</h2>
          <p className="mt-1 text-sm text-slate-400">Select students below, then send credentials from the dashboard.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className="secondary-button" type="button" onClick={onRefresh}>
            Refresh
          </button>
          <button className="primary-button" type="button" onClick={onSendSelected} disabled={!selectedIds.length}>
            Send Email to Selected
          </button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full border-separate border-spacing-y-3 text-left">
          <thead>
            <tr className="text-xs uppercase tracking-[0.25em] text-slate-500">
              <th className="px-4 py-2">
                <input
                  type="checkbox"
                  aria-label="Select all students"
                  checked={allSelected}
                  ref={(input) => {
                    if (input) {
                      input.indeterminate = someSelected;
                    }
                  }}
                  onChange={onToggleSelectAll}
                />
              </th>
              <th className="px-4 py-2">Name</th>
              <th className="px-4 py-2">Email</th>
              <th className="px-4 py-2">Roll No</th>
              <th className="px-4 py-2">Programme</th>
              <th className="px-4 py-2">Branch</th>
              <th className="px-4 py-2">Batch</th>
              <th className="px-4 py-2">DOB</th>
              <th className="px-4 py-2">Email Status</th>
              <th className="px-4 py-2">Hash</th>
              <th className="px-4 py-2">Created</th>
              <th className="px-4 py-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {students.map((student) => (
              <tr key={student.id} className="rounded-2xl bg-white/5 text-sm text-slate-200">
                <td className="rounded-l-2xl px-4 py-4 align-middle">
                  <input
                    type="checkbox"
                    aria-label={`Select ${student.name}`}
                    checked={selectedIds.includes(student.id)}
                    onChange={() => onToggleSelect(student.id)}
                  />
                </td>
                <td className="px-4 py-4 font-medium text-white">{student.name}</td>
                <td className="px-4 py-4">{student.email}</td>
                <td className="px-4 py-4">{student.rollNo}</td>
                <td className="px-4 py-4">{student.programmeLevel}</td>
                <td className="px-4 py-4">{student.discipline}</td>
                <td className="px-4 py-4">{student.batch}</td>
                <td className="px-4 py-4">{student.dob}</td>
                <td className="px-4 py-4">
                  <span className={student.revoked ? "rounded-full bg-red-400/15 px-3 py-1 text-xs font-medium text-red-200" : student.emailSent ? "rounded-full bg-emerald-400/15 px-3 py-1 text-xs font-medium text-emerald-200" : "rounded-full bg-amber-400/15 px-3 py-1 text-xs font-medium text-amber-200"}>
                    {student.revoked ? "Revoked" : student.emailSent ? `Sent${student.emailSentAt ? ` • ${formatDate(student.emailSentAt)}` : ""}` : "Pending"}
                  </span>
                </td>
                <td className="px-4 py-4 font-mono text-xs text-zinc-300">{truncate(student.hashedData, 22)}</td>
                <td className="px-4 py-4 text-slate-400">{formatDate(student.createdAt)}</td>
                <td className="rounded-r-2xl px-4 py-4 text-slate-400">
                  <div className="flex items-center gap-2">
                    <Link to={`/students/${student.id}/edit`} className="text-xs font-semibold text-blue-400 hover:text-blue-300">
                      Edit
                    </Link>
                    <button
                      onClick={() => onRevoke(student.id)}
                      className="text-xs font-semibold text-red-400 hover:text-red-300 disabled:cursor-not-allowed disabled:text-zinc-500"
                      disabled={student.revoked}
                    >
                      {student.revoked ? "Revoked" : "Revoke"}
                    </button>
                    <button
                      onClick={() => onRecover(student.id)}
                      className="text-xs font-semibold text-indigo-400 hover:text-indigo-300"
                    >
                      Recover
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}