import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";

const emptyForm = {
  name: "",
  address: "",
  email: "",
  phone: "",
  adminName: "",
  adminEmail: "",
  adminPassword: "",
};

export default function AdminSchools() {
  const [schools, setSchools] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const data = await api.get("/schools");
      setSchools(data.schools);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function createSchool(e) {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      await api.post("/schools", form);
      setForm(emptyForm);
      setShowForm(false);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(school) {
    try {
      await api.put(`/schools/${school.id}`, { ...school, active: !school.active });
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>All Schools</h1>
          <p>Platform-wide control — create schools, manage their admins, and jump into any school's data.</p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowForm((s) => !s)}>
          {showForm ? "Cancel" : "+ New School"}
        </button>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      {showForm && (
        <div className="card">
          <h3>Create school + first admin login</h3>
          <form onSubmit={createSchool}>
            <div className="grid-2">
              <div className="field">
                <label>School name</label>
                <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
              </div>
              <div className="field">
                <label>Address</label>
                <input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
              </div>
              <div className="field">
                <label>School email</label>
                <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
              </div>
              <div className="field">
                <label>School phone</label>
                <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
              </div>
            </div>

            <hr style={{ border: "none", borderTop: "1px solid var(--border)", margin: "14px 0" }} />
            <p className="muted" style={{ fontSize: 13, marginBottom: 10 }}>First school-admin login</p>

            <div className="grid-3">
              <div className="field">
                <label>Admin name</label>
                <input value={form.adminName} onChange={(e) => setForm({ ...form, adminName: e.target.value })} required />
              </div>
              <div className="field">
                <label>Admin email</label>
                <input type="email" value={form.adminEmail} onChange={(e) => setForm({ ...form, adminEmail: e.target.value })} required />
              </div>
              <div className="field">
                <label>Admin password</label>
                <input type="password" value={form.adminPassword} onChange={(e) => setForm({ ...form, adminPassword: e.target.value })} required minLength={8} />
              </div>
            </div>

            <button className="btn btn-primary" disabled={saving}>
              {saving ? "Creating…" : "Create school"}
            </button>
          </form>
        </div>
      )}

      <div className="card" style={{ padding: 0 }}>
        {loading ? (
          <div className="empty-state">Loading schools…</div>
        ) : schools.length === 0 ? (
          <div className="empty-state">No schools yet — create the first one above.</div>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>School</th>
                <th>Teachers</th>
                <th>Classes</th>
                <th>Logins</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {schools.map((s) => (
                <tr key={s.id}>
                  <td>
                    <strong>{s.name}</strong>
                    <div className="muted" style={{ fontSize: 12 }}>{s.address}</div>
                  </td>
                  <td>{s._count.teachers}</td>
                  <td>{s._count.classes}</td>
                  <td>{s._count.users}</td>
                  <td>
                    <span className={`badge ${s.active ? "badge-school" : ""}`} style={!s.active ? { background: "#f3d9d9", color: "#a33" } : {}}>
                      {s.active ? "Active" : "Disabled"}
                    </span>
                  </td>
                  <td>
                    <div className="flex gap-8">
                      <Link className="btn btn-outline btn-sm" to={`/schools/${s.id}/timetable`}>
                        Manage
                      </Link>
                      <button className="btn btn-outline btn-sm" onClick={() => toggleActive(s)}>
                        {s.active ? "Disable" : "Enable"}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
