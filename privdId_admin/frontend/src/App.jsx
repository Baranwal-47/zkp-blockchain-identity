import { Navigate, Route, Routes } from "react-router-dom";

import Layout from "./components/Layout.jsx";
import DashboardPage from "./pages/DashboardPage.jsx";
import AddStudentPage from "./pages/AddStudentPage.jsx";
import EditStudentPage from "./pages/EditStudentPage.jsx";
import UploadPage from "./pages/UploadPage.jsx";
import LoginPage from "./pages/LoginPage.jsx";

function RequireAuth({ children }) {
  if (!localStorage.getItem("adminToken")) {
    return <Navigate to="/login" replace />;
  }
  return children;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
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
