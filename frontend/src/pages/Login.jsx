import React, { useState } from "react";
import { Navigate, Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";

export default function Login() {
  const { user, login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  if (user) return <Navigate to="/" replace />;

  async function onSubmit(e) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      await login(email, password);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login-screen">
      <div className="login-hero">
        <span className="brand-mark" style={{ width: "fit-content" }}>
          TT
        </span>
        <h1 style={{ marginTop: 18 }}>One schedule engine, every school, zero clashes.</h1>
        <p>
          Enter teachers, subjects, classes and weekly hours — the generator works out every
          permutation so no teacher or division is ever double-booked, across a fully custom
          6-day bell schedule.
        </p>
        <div className="clock-grid">
          {["MON", "TUE", "WED", "THU", "FRI", "SAT"].map((d) => (
            <span key={d}>{d}</span>
          ))}
          {["08:00", "08:45", "09:30", "10:30", "11:15", "12:45"].map((t, i) => (
            <span key={i}>{t}</span>
          ))}
        </div>
      </div>

      <div className="login-panel">
        <form className="login-box" onSubmit={onSubmit}>
          <h2>Sign in</h2>
          <p className="sub">Platform admin or school admin — same door, different keys.</p>

          {error && <div className="alert alert-error">{error}</div>}

          <div className="field">
            <label>Email</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
          </div>
          <div className="field">
            <label>Password</label>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </div>

          <button className="btn btn-primary" style={{ width: "100%", justifyContent: "center", marginTop: 6 }} disabled={busy}>
            {busy ? "Signing in…" : "Sign in"}
          </button>

          <p className="muted" style={{ fontSize: 12.5, marginTop: 14, textAlign: "center" }}>
            New school? <Link to="/register">Register</Link>
          </p>
        </form>
      </div>
    </div>
  );
}
