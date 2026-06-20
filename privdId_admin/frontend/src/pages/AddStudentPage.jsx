import { useState } from "react";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";

import StudentForm from "../components/StudentForm.jsx";
import api, { getApiErrorMessage } from "../services/api.js";

const initialFormState = {
  name: "",
  email: "",
  rollNo: "",
  programmeLevel: "",
  discipline: "",
  batch: "",
  dob: "",
};

export default function AddStudentPage() {
  const navigate = useNavigate();
  const [formData, setFormData] = useState(initialFormState);
  const [loading, setLoading] = useState(false);

  function handleChange(event) {
    const { name, value } = event.target;
    setFormData((current) => ({ ...current, [name]: value }));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setLoading(true);

    try {
      const response = await api.post("/students", formData);
      toast.success(response.data.message || "Student created successfully");
      setFormData(initialFormState);
      navigate("/");
    } catch (error) {
      toast.error(getApiErrorMessage(error));
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="space-y-6">
      <div className="panel">
        <p className="text-xs uppercase tracking-[0.3em] text-zinc-400">Add student</p>
        <h2 className="mt-2 text-2xl font-semibold text-white">Create a new student record</h2>
        <p className="mt-2 max-w-2xl text-sm text-slate-400">
          The backend validates the payload, hashes the student data with Poseidon, and stores the record. You can send credentials later from the dashboard.
        </p>
      </div>

      <StudentForm
        formData={formData}
        onChange={handleChange}
        onSubmit={handleSubmit}
        loading={loading}
        submitLabel="Create student"
      />
    </section>
  );
}