// Mirrors privdId_admin/backend/constants/enumCodes.js exactly (FROZEN,
// circuit-hardcoded integer codes) — do not reorder/rename without updating
// enumCodes.js and the circuit's set-membership check in lockstep.
const PROGRAMME_LEVELS = ["B.Tech", "B.Des", "Dual", "M.Tech", "M.Des", "PhD"];
const DISCIPLINES = ["CSE", "ECE", "ME", "SmartMfg", "Design", "NatSci"];

export default function StudentForm({ formData, onChange, onSubmit, loading, submitLabel }) {
  return (
    <form className="panel grid gap-5" onSubmit={onSubmit}>
      <div className="grid gap-5 md:grid-cols-2">
        <div>
          <label className="field-label" htmlFor="name">
            Full name
          </label>
          <input className="field-input" id="name" name="name" value={formData.name} onChange={onChange} placeholder="Aarav Sharma" />
        </div>
        <div>
          <label className="field-label" htmlFor="email">
            Email address
          </label>
          <input className="field-input" id="email" name="email" type="email" value={formData.email} onChange={onChange} placeholder="student@college.edu" />
        </div>
        <div>
          <label className="field-label" htmlFor="rollNo">
            Roll number
          </label>
          <input className="field-input" id="rollNo" name="rollNo" value={formData.rollNo} onChange={onChange} placeholder="CS-2026-014" />
        </div>
        <div>
          <label className="field-label" htmlFor="batch">
            Batch (year)
          </label>
          <input className="field-input" id="batch" name="batch" type="number" value={formData.batch} onChange={onChange} placeholder="2026" />
        </div>
        <div>
          <label className="field-label" htmlFor="programmeLevel">
            Programme
          </label>
          <select className="field-input" id="programmeLevel" name="programmeLevel" value={formData.programmeLevel} onChange={onChange}>
            <option value="">Select programme</option>
            {PROGRAMME_LEVELS.map((level) => (
              <option key={level} value={level}>
                {level}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="field-label" htmlFor="discipline">
            Branch
          </label>
          <select className="field-input" id="discipline" name="discipline" value={formData.discipline} onChange={onChange}>
            <option value="">Select branch</option>
            {DISCIPLINES.map((discipline) => (
              <option key={discipline} value={discipline}>
                {discipline}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label className="field-label" htmlFor="dob">
          Date of Birth
        </label>
        <input className="field-input" id="dob" name="dob" value={formData.dob} onChange={onChange} placeholder="DDMMYYYY" />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button className="primary-button" type="submit" disabled={loading}>
          {loading ? "Saving..." : submitLabel}
        </button>
        <p className="text-sm text-slate-400">A temporary password will be generated and sent by email.</p>
      </div>
    </form>
  );
}