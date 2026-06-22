import { Navigate, Route, Routes } from "react-router-dom";

import Layout from "./components/Layout.jsx";
import DashboardPage from "./pages/DashboardPage.jsx";
import AddStudentPage from "./pages/AddStudentPage.jsx";
import EditStudentPage from "./pages/EditStudentPage.jsx";
import UploadPage from "./pages/UploadPage.jsx";
import RoleLoginPage from "./pages/RoleLoginPage.jsx";
import PendingApprovalsPage from "./pages/PendingApprovalsPage.jsx";
import { getRole } from "./services/auth.js";

// Academic Admin is the full registry admin (dashboard + student CRUD).
// Registrar/Dean are officials limited to the pending-approvals queue.
function RequireAdmin({ children }) {
  const role = getRole();
  if (!role) return <Navigate to="/official-login" replace />;
  if (role !== "acadadmin") return <Navigate to="/pending-approvals" replace />;
  return children;
}

function RequireOfficial({ children }) {
  if (!getRole()) return <Navigate to="/official-login" replace />;
  return children;
}

export default function App() {
  return (
    <Routes>
      {/* /login retired — single official sign-in for all roles */}
      <Route path="/login" element={<Navigate to="/official-login" replace />} />
      <Route path="/official-login" element={<RoleLoginPage />} />
      <Route
        path="/pending-approvals"
        element={
          <RequireOfficial>
            <PendingApprovalsPage />
          </RequireOfficial>
        }
      />
      <Route
        element={
          <RequireAdmin>
            <Layout />
          </RequireAdmin>
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
