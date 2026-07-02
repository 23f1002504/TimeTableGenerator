import React from "react";
import { NavLink, useParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";

const NAV_ITEMS = [
  { segment: "timetable", label: "Timetable", icon: "🗓️" },
  { segment: "requirements", label: "Curriculum", icon: "📋" },
  { segment: "teachers", label: "Teachers", icon: "🧑‍🏫" },
  { segment: "subjects", label: "Subjects", icon: "📚" },
  { segment: "classes", label: "Classes & Divisions", icon: "🏫" },
  { segment: "periods", label: "Bell Schedule", icon: "⏱️" },
];

export default function Layout({ children }) {
  const { user, logout } = useAuth();
  const { schoolId } = useParams();

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">TT</span>
          <span className="brand-name">Timetable</span>
        </div>

        <nav>
          {user.role === "SUPER_ADMIN" && (
            <>
              <NavLink to="/admin/schools" className={({ isActive }) => "nav-link" + (isActive ? " active" : "")}>
                🛡️ All Schools
              </NavLink>
              <NavLink to="/admin/applications" className={({ isActive }) => "nav-link" + (isActive ? " active" : "")}>
                📥 Applications
              </NavLink>
            </>
          )}
          {schoolId &&
            NAV_ITEMS.map((item) => (
              <NavLink
                key={item.segment}
                to={`/schools/${schoolId}/${item.segment}`}
                className={({ isActive }) => "nav-link" + (isActive ? " active" : "")}
              >
                <span>{item.icon}</span> {item.label}
              </NavLink>
            ))}
        </nav>

        <div className="footer-user">
          <div className="name">{user.name}</div>
          <div className="muted" style={{ fontSize: 12 }}>
            {user.email}
          </div>
          <span className={`badge ${user.role === "SUPER_ADMIN" ? "badge-super" : "badge-school"}`} style={{ marginTop: 6, display: "inline-block" }}>
            {user.role === "SUPER_ADMIN" ? "Platform Admin" : "School Admin"}
          </span>
          <button className="logout-btn" onClick={logout}>
            Log out
          </button>
        </div>
      </aside>

      <main className="main">{children}</main>
    </div>
  );
}
