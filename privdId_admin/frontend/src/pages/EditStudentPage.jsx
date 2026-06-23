import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import toast from "react-hot-toast";

import StudentForm from "../components/StudentForm.jsx";
import api, { getApiErrorMessage } from "../services/api.js";

export default function EditStudentPage() {
  const navigate = useNavigate();
  const { id } = useParams();
  const [formData, setFormData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [recoverySessionId, setRecoverySessionId] = useState(null);

  useEffect(() => {
    async function fetchStudent() {
      setLoading(true);
      try {
        const response = await api.get(`/students/${id}`);
        const student = response.data.student;
        setFormData({
          name: student.name,
          email: student.email,
          rollNo: student.rollNo,
          programmeLevel: student.programmeLevel || "",
          discipline: student.discipline || "",
          batch: student.batch || "",
          dob: student.dob || "",
        });
      } catch (error) {
        toast.error(`Failed to load student data: ${getApiErrorMessage(error)}`);
        navigate("/");
      } finally {
        setLoading(false);
      }
    }
    fetchStudent();
  }, [id, navigate]);

  function handleChange(event) {
    const { name, value } = event.target;
    setFormData((current) => ({ ...current, [name]: value }));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setLoading(true);

    try {
      const response = await api.put(`/students/${id}`, formData);
      if (response.data.status === "warning") {
        toast.error(response.data.anchorWarning || response.data.message, { icon: "⚠️" });
      } else {
        toast.success(response.data.message || "Student updated successfully");
      }
      navigate("/");
    } catch (error) {
      // Phase 11 redesign: updateStudent() throws 409 for an already-claimed
      // student (no pendingDek — re-issuance needs a live custodian 2-of-3
      // Shamir session). Instead of surfacing this as an error, transparently
      // open a credential-mod recovery session with the same attribute
      // payload the form was submitting, then close the modal immediately
      // (fire-and-check-later — the admin sees session status as a pill on
      // the Dashboard row, not a blocking wait here).
      if (error?.response?.status === 409) {
        try {
          const { data } = await api.post("/recovery/initiate", {
            studentId: id,
            operationType: "credential-mod",
            attributeUpdates: formData,
          });
          setRecoverySessionId(data.sessionId);
          toast.success("Recovery session opened — share the Session ID with a custodian (Registrar or Dean).");
          setLoading(false);
          return;
        } catch (initiateError) {
          toast.error(getApiErrorMessage(initiateError));
          setLoading(false);
          return;
        }
      }
      toast.error(getApiErrorMessage(error));
    } finally {
      setLoading(false);
    }
  }

  if (!formData) {
    return (
      <div className="panel">
        <p className="text-center">Loading student data...</p>
      </div>
    );
  }

  if (recoverySessionId) {
    return (
      <section className="space-y-6">
        <div className="panel">
          <p className="text-xs uppercase tracking-[0.3em] text-zinc-400">Edit student</p>
          <h2 className="mt-2 text-2xl font-semibold text-white">Custodian recovery session opened</h2>
          <p className="mt-2 text-sm text-slate-400">
            This student has already claimed their credential. A recovery session has been opened.
            Share the Session ID below with a custodian (Registrar or Dean) — they go to
            <strong className="text-white"> Recovery</strong> in the nav, select the open session, and submit their private key.
          </p>
        </div>
        <div className="panel-soft space-y-3">
          <p className="text-sm font-medium text-slate-300">Session ID</p>
          <div className="flex items-center gap-3">
            <code className="flex-1 select-all rounded-lg bg-slate-900 px-4 py-2 font-mono text-sm text-indigo-300 border border-slate-700">
              {recoverySessionId}
            </code>
            <button
              type="button"
              onClick={() => { navigator.clipboard.writeText(recoverySessionId); toast.success("Copied."); }}
              className="rounded-lg border border-slate-600 px-4 py-2 text-sm font-medium text-slate-200 hover:border-slate-400"
            >
              Copy
            </button>
          </div>
          <p className="text-xs text-slate-500">Session expires in 30 minutes. The custodian will see this session listed automatically on the Recovery page.</p>
        </div>
        <button
          type="button"
          onClick={() => navigate("/")}
          className="secondary-button"
        >
          ← Back to Dashboard
        </button>
      </section>
    );
  }

  return (
    <section className="space-y-6">
      <div className="panel">
        <p className="text-xs uppercase tracking-[0.3em] text-zinc-400">Edit student</p>
        <h2 className="mt-2 text-2xl font-semibold text-white">Update student record</h2>
        <p className="mt-2 max-w-2xl text-sm text-slate-400">
          Changing student details will re-issue the on-chain credential with a new IPFS hash. The student will not be re-notified by email.
        </p>
      </div>

      <StudentForm
        formData={formData}
        onChange={handleChange}
        onSubmit={handleSubmit}
        loading={loading}
        submitLabel="Update Student"
      />
    </section>
  );
}
