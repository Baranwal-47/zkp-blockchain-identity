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
