export default function UploadPanel({ file, onFileChange, onSubmit, loading }) {
  return (
    <form className="panel grid gap-5" onSubmit={onSubmit}>
      <div className="rounded-3xl border border-dashed border-cyan-400/25 bg-cyan-400/5 p-6 text-center">
        <p className="text-lg font-semibold text-white">Upload an Excel workbook</p>
        <p className="mt-2 text-sm text-slate-400">Use columns for name, email, rollNo, programmeLevel, discipline, batch, and dob (DDMMYYYY).</p>
        <input className="mt-5 w-full text-sm text-slate-300 file:mr-4 file:rounded-2xl file:border-0 file:bg-cyan-400 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-slate-950 hover:file:bg-cyan-300" type="file" accept=".xlsx,.xls" onChange={onFileChange} />
        <p className="mt-3 text-xs text-slate-500">{file ? file.name : "No file selected"}</p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button className="primary-button" type="submit" disabled={loading || !file}>
          {loading ? "Uploading..." : "Upload Students"}
        </button>
        <p className="text-sm text-slate-400">Each row will be validated, hashed with Poseidon, and stored. Send emails later from Dashboard.</p>
      </div>
    </form>
  );
}