import React, { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api } from "../api";

const emptyForm = { schoolName: "", address: "", contactName: "", contactEmail: "", contactPhone: "" };

export default function RequestAccess() {
  const [searchParams] = useSearchParams();
  const canceled = searchParams.get("canceled");

  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      const data = await api.post("/applications", form);
      if (data.checkoutUrl) {
        window.location.href = data.checkoutUrl; // hand off to Stripe Checkout
        return;
      }
      // No payment configured yet — application goes straight to the
      // platform admin's approval queue.
      setSubmitted(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  if (submitted) {
    return (
      <div className="login-screen">
        <div className="login-hero">
          <span className="brand-mark" style={{ width: "fit-content" }}>
            TT
          </span>
          <h1 style={{ marginTop: 18 }}>Request received.</h1>
          <p>We'll take it from here.</p>
        </div>
        <div className="login-panel">
          <div className="login-box">
            <h2>You're in the queue 🎉</h2>
            <p className="sub">
              Thanks — your registration is waiting for approval by the platform admin. You'll get
              your login details once it's approved.
            </p>
            <Link to="/login" className="btn btn-outline" style={{ width: "100%", justifyContent: "center", marginTop: 10 }}>
              Back to sign in
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="login-screen">
      <div className="login-hero">
        <span className="brand-mark" style={{ width: "fit-content" }}>
          TT
        </span>
        <h1 style={{ marginTop: 18 }}>Bring your school onto Timetable.</h1>
        <p>
          Tell us about your school below. Your registration goes into a short review queue —
          you'll get login details once it's approved.
        </p>
      </div>

      <div className="login-panel">
        <form className="login-box" style={{ maxWidth: 440 }} onSubmit={submit}>
          <h2>Register your school</h2>
          <p className="sub">Takes about a minute.</p>

          {canceled && <div className="alert alert-warn">Checkout was canceled — no charge was made. You can try again below.</div>}
          {error && <div className="alert alert-error">{error}</div>}

          <div className="field">
            <label>School name</label>
            <input value={form.schoolName} onChange={(e) => setForm({ ...form, schoolName: e.target.value })} required />
          </div>
          <div className="field">
            <label>School address</label>
            <input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
          </div>
          <div className="field">
            <label>Your name</label>
            <input value={form.contactName} onChange={(e) => setForm({ ...form, contactName: e.target.value })} required />
          </div>
          <div className="field">
            <label>Your email</label>
            <input type="email" value={form.contactEmail} onChange={(e) => setForm({ ...form, contactEmail: e.target.value })} required />
            <p className="muted" style={{ fontSize: 12, marginTop: 4 }}>
              This becomes your school-admin login once approved.
            </p>
          </div>
          <div className="field">
            <label>Phone (optional)</label>
            <input value={form.contactPhone} onChange={(e) => setForm({ ...form, contactPhone: e.target.value })} />
          </div>

          <button className="btn btn-primary" style={{ width: "100%", justifyContent: "center", marginTop: 6 }} disabled={submitting}>
            {submitting ? "Submitting…" : "Register"}
          </button>

          <p className="muted" style={{ fontSize: 12.5, marginTop: 14, textAlign: "center" }}>
            Already approved? <Link to="/login">Sign in</Link>
          </p>
        </form>
      </div>
    </div>
  );
}
