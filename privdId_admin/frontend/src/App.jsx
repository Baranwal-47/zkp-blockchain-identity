import { Navigate, Route, Routes } from "react-router-dom";

import Layout from "./components/Layout.jsx";
import DashboardPage from "./pages/DashboardPage.jsx";
import AddStudentPage from "./pages/AddStudentPage.jsx";
import EditStudentPage from "./pages/EditStudentPage.jsx";
import UploadPage from "./pages/UploadPage.jsx";
import LoginPage from "./pages/LoginPage.jsx";
import RoleLoginPage from "./pages/RoleLoginPage.jsx";
import PendingApprovalsPage from "./pages/PendingApprovalsPage.jsx";

function RequireAuth({ children }) {
  if (!localStorage.getItem("adminToken")) {
    return <Navigate to="/login" replace />;
  }
  return children;
}

function RequireOfficialAuth({ children }) {
  if (!localStorage.getItem("officialToken")) {
    return <Navigate to="/official-login" replace />;
  }
  return children;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/official-login" element={<RoleLoginPage />} />
      <Route
        path="/pending-approvals"
        element={
          <RequireOfficialAuth>
            <PendingApprovalsPage />
          </RequireOfficialAuth>
        }
      />
      <Route
        element={
          <RequireAuth>
            <Layout />
          </RequireAuth>
        }
      >
        <Route index element={<DashboardPage />} />
        <Route path="students/new" element={<AddStudentPage />} />
        <Route path="students/:id/edit" element={<EditStudentPage />} />
        <Route path="students/upload" element={<UploadPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
