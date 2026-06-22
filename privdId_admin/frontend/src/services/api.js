import axios from "axios";

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || "http://localhost:5000/api",
  timeout: 15000,
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("officialToken");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error?.response?.status === 401) {
      localStorage.removeItem("officialToken");
      window.location.href = "/official-login";
    }
    return Promise.reject(error);
  }
);

export function getApiErrorMessage(error) {
  return error?.response?.data?.message || error?.response?.data?.error || error?.message || "Request failed";
}

export default api;