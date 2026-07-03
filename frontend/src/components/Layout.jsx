import React from "react";
import { NavLink, useParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";

// Ordered to match the order you'd actually set a school up in — each
// step only depends on ones before it, so working top to bottom always
// works.
const NAV_ITEMS = [
  {
    segment: "subjects",
    label: "Subjects",
    icon: "📚",
    hint: "Start here. List everything taught at your school (Math, Science, etc). Needed before Teachers or Curriculum.",
  },
  {
    segment: "teachers",
    label: "Teachers",
    icon: "🧑‍🏫",
    hint: "Add teachers and tick which subjects each can teach, plus how many periods they can take per day/week. Add Subjects first.",
  },
  {
    segment: "classes",
    label: "Classes & Divisions",
    icon: "🏫",
    hint: "Add grades/classes (e.g. Grade 6) and their sections (A, B...). Needed before Curriculum.",
  },
  {
    segment: "periods",
    label: "Bell Schedule",
    icon: "⏱️",
    hint: "Set exact start/end times for each period, for all 6 days. Needed before generating a Timetable.",
  },
  {
    segment: "requirements",
    label: "Curriculum",
    icon: "📋",
    hint: "For each division, assign a subject + teacher + hours/week. Requires Subjects, Teachers, and Classes & Divisions to be set up first.",
  },
  {
    segment: "timetable",
    label: "Timetable",
    icon: "🗓️",
    hint: "Generate the conflict-free schedule once everything above is set up, then fine-tune any cell by hand.",
  },
];

function InfoIcon({ text }) {
  return (
    <span
      className="info-icon"
      title={text}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
    >
      i
    </span>
  );
}

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
                <span className="nav-link-main">🛡️ All Schools</span>
                <InfoIcon text="See and manage every school on the platform — create schools directly, disable one, or jump into its data." />
              </NavLink>
              <NavLink to="/admin/applications" className={({ isActive }) => "nav-link" + (isActive ? " active" : "")}>
                <span className="nav-link-main">📥 Applications</span>
                <InfoIcon text="Review schools that registered via the public Register page. Approve to create their school + login, or reject." />
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
                <span className="nav-link-main">
                  <span>{item.icon}</span> {item.label}
                </span>
                <InfoIcon text={item.hint} />
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
