import React from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { useAuth } from "./context/AuthContext.jsx";

import Login from "./pages/Login.jsx";
import RequestAccess from "./pages/RequestAccess.jsx";
import ApplySuccess from "./pages/ApplySuccess.jsx";
import Layout from "./components/Layout.jsx";
import AdminSchools from "./pages/AdminSchools.jsx";
import AdminApplications from "./pages/AdminApplications.jsx";
import Teachers from "./pages/Teachers.jsx";
import Subjects from "./pages/Subjects.jsx";
import ClassesDivisions from "./pages/ClassesDivisions.jsx";
import Periods from "./pages/Periods.jsx";
import Requirements from "./pages/Requirements.jsx";
import Timetable from "./pages/Timetable.jsx";

function ProtectedRoute({ children, roles }) {
  const { user, loading } = useAuth();
  if (loading) return <div style={{ padding: 40 }}>Loading…</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (roles && !roles.includes(user.role)) return <Navigate to="/" replace />;
  return children;
}

function HomeRedirect() {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  if (user.role === "SUPER_ADMIN") return <Navigate to="/admin/schools" replace />;
  return <Navigate to={`/schools/${user.schoolId}/timetable`} replace />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<RequestAccess />} />
      <Route path="/apply" element={<RequestAccess />} />
      <Route path="/apply/success" element={<ApplySuccess />} />

      <Route path="/" element={<ProtectedRoute><HomeRedirect /></ProtectedRoute>} />

      <Route
        path="/admin/schools"
        element={
          <ProtectedRoute roles={["SUPER_ADMIN"]}>
            <Layout><AdminSchools /></Layout>
          </ProtectedRoute>
        }
      />

      <Route
        path="/admin/applications"
        element={
          <ProtectedRoute roles={["SUPER_ADMIN"]}>
            <Layout><AdminApplications /></Layout>
          </ProtectedRoute>
        }
      />

      {[
        ["subjects", Subjects],
        ["teachers", Teachers],
        ["classes", ClassesDivisions],
        ["periods", Periods],
        ["requirements", Requirements],
        ["timetable", Timetable],
      ].map(([segment, Component]) => (
        <Route
          key={segment}
          path={`/schools/:schoolId/${segment}`}
          element={
            <ProtectedRoute roles={["SCHOOL_ADMIN", "SUPER_ADMIN"]}>
              <Layout><Component /></Layout>
            </ProtectedRoute>
          }
        />
      ))}

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
