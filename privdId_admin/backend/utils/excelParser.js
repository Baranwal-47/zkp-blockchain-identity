import xlsx from "xlsx";

import AppError from "./appError.js";

function normalizeKey(key) {
  return String(key ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function getField(row, aliases) {
  for (const [key, value] of Object.entries(row)) {
    if (aliases.includes(normalizeKey(key))) {
      return String(value ?? "").trim();
    }
  }

  return "";
}

export function parseStudentsFromWorkbook(buffer) {
  const workbook = xlsx.read(buffer, { type: "buffer" });
  const sheetName = workbook.SheetNames[0];

  if (!sheetName) {
    throw new AppError("Excel file does not contain a worksheet.", 400);
  }

  const worksheet = workbook.Sheets[sheetName];
  const rows = xlsx.utils.sheet_to_json(worksheet, { defval: "" });

  return rows.map((row, index) => ({
    name: getField(row, ["name"]),
    email: getField(row, ["email", "mail"]),
    rollNo: getField(row, ["rollno", "rollnumber", "roll"]),
    programmeLevel: getField(row, ["programmelevel", "programme", "program"]),
    discipline: getField(row, ["discipline", "branch"]),
    batch: getField(row, ["batch", "batchyear", "year"]),
    dob: getField(row, ["dob", "dateofbirth"]),
    rowNumber: index + 2,
  }));
}