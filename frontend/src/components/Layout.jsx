import React, { useRef, useState } from "react";
import { createPortal } from "react-dom";
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
    hint: "Add grades/classes and their sections (A, B...) — or create a whole range at once (e.g. Grade 1–10). Needed before Curriculum.",
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
    hint: "For each division, assign a subject + teacher + hours/week — then copy it to other divisions in one click instead of repeating it. Requires Subjects, Teachers, and Classes & Divisions first.",
  },
  {
    segment: "constraints",
    label: "Constraints",
    icon: "⚙️",
    hint: "Tune the scheduling rules — max repeats of a subject per day, teacher consecutive-period limits, and other preferences the generator honors.",
  },
  {
    segment: "timetable",
    label: "Timetable",
    icon: "🗓️",
    hint: "Generate the conflict-free schedule once everything above is set up, then fine-tune any cell by hand.",
  },
];

const TOOLTIP_WIDTH = 250;

function InfoIcon({ text }) {
  const iconRef = useRef(null);
  const [tooltip, setTooltip] = useState(null); // { top, left, placement }

  function show() {
    const rect = iconRef.current.getBoundingClientRect();
    const margin = 12;
    const spaceRight = window.innerWidth - rect.right;
    const placement = spaceRight > TOOLTIP_WIDTH + 20 ? "right" : "below";

    if (placement === "right") {
      setTooltip({ top: rect.top + rect.height / 2, left: rect.right + 10, placement });
    } else {
      const left = Math.min(Math.max(rect.left - TOOLTIP_WIDTH + 24, margin), window.innerWidth - TOOLTIP_WIDTH - margin);
      setTooltip({ top: rect.bottom + 10, left, arrowLeft: rect.left - left + 6, placement });
    }
  }

  function hide() {
    setTooltip(null);
  }

  return (
    <>
      <span
        ref={iconRef}
        className="info-icon"
        onMouseEnter={show}
        onMouseLeave={hide}
        onFocus={show}
        onBlur={hide}
        tabIndex={0}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
        }}
      >
        i
      </span>
      {tooltip &&
        createPortal(
          <div
            className={`info-tooltip info-tooltip-${tooltip.placement}`}
            style={{
              top: tooltip.top,
              left: tooltip.left,
              ...(tooltip.placement === "right" ? { transform: "translateY(-50%)" } : {}),
              ...(tooltip.placement === "below" ? { "--arrow-left": `${tooltip.arrowLeft}px` } : {}),
            }}
          >
            {text}
          </div>,
          document.body
        )}
    </>
  );
}

export default function Layout({ children }) {
  const { user, logout } = useAuth();
  const { schoolId } = useParams();
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="app-shell">
      <div className="mobile-topbar">
        <button className="hamburger-btn" onClick={() => setMenuOpen(true)} aria-label="Open menu">
          <span />
          <span />
          <span />
        </button>
        <span className="brand-mark">TT</span>
        <span className="brand-name" style={{ color: "var(--ink)" }}>
          Timetable
        </span>
      </div>

      {menuOpen && <div className="sidebar-backdrop" onClick={() => setMenuOpen(false)} />}

      <aside className={`sidebar ${menuOpen ? "open" : ""}`}>
        <div className="brand">
          <span className="brand-mark">TT</span>
          <span className="brand-name">Timetable</span>
          <button className="sidebar-close-btn" onClick={() => setMenuOpen(false)} aria-label="Close menu">
            ✕
          </button>
        </div>

        <nav onClick={() => setMenuOpen(false)}>
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
