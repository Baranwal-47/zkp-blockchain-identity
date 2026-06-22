// Single token for all admin/official roles. acadadmin = full registry admin,
// registrar/dean = pending-approvals only. Role lives in the JWT payload.
export function getToken() {
  return localStorage.getItem("officialToken");
}

export function getRole() {
  const token = getToken();
  if (!token) return null;
  try {
    return JSON.parse(atob(token.split(".")[1])).role || null;
  } catch {
    return null;
  }
}

export function logout() {
  localStorage.removeItem("officialToken");
  // ponytail: legacy key cleanup so old sessions don't linger
  localStorage.removeItem("adminToken");
}
