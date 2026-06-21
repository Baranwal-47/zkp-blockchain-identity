import axios from "axios";

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || "http://localhost:5000/api",
  timeout: 15000,
});

api.interceptors.request.use((config) => {
  const isOfficialRoute = typeof config.url === "string" && (config.url.includes("/safe") || config.url.includes("/admin/role-login"));
  const officialToken = localStorage.getItem("officialToken");
  const adminToken = localStorage.getItem("adminToken");
  const token = isOfficialRoute ? officialToken || adminToken : adminToken || officialToken;
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error?.response?.status === 401) {
      localStorage.removeItem("adminToken");
      window.location.href = "/login";
    }
    return Promise.reject(error);
  }
);

export function getApiErrorMessage(error) {
  return error?.response?.data?.message || error?.response?.data?.error || error?.message || "Request failed";
}

export default api;