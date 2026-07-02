import React, { useEffect, useState } from "react";
import { api } from "../api";
import { useSchoolScope } from "../hooks/useSchoolScope.js";

const emptyForm = { name: "", email: "", maxPeriodsPerDay: 6, maxPeriodsPerWeek: 30, subjectIds: [] };

export default function Teachers() {
  const { params } = useSchoolScope();
  const [teachers, setTeachers] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState(null);

  async function load() {
    setLoading(true);
    try {
      const [t, s] = await Promise.all([api.get("/teachers", params), api.get("/subjects", params)]);
      setTeachers(t.teachers);
      setSubjects(s.subjects);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params?.schoolId]);

  function resetForm() {
    setForm(emptyForm);
    setEditingId(null);
  }

  function toggleSubject(id) {
    setForm((f) => ({
      ...f,
      subjectIds: f.subjectIds.includes(id) ? f.subjectIds.filter((x) => x !== id) : [...f.subjectIds, id],
    }));
  }

  async function submit(e) {
    e.preventDefault();
    setError("");
    try {
      if (editingId) {
        await api.put(`/teachers/${editingId}`, form);
      } else {
        await api.post("/teachers", { ...form, ...params });
      }
      resetForm();
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  function edit(t) {
    setEditingId(t.id);
    setForm({
      name: t.name,
      email: t.email || "",
      maxPeriodsPerDay: t.maxPeriodsPerDay,
      maxPeriodsPerWeek: t.maxPeriodsPerWeek,
      subjectIds: t.teacherSubjects.map((ts) => ts.subject.id),
    });
  }

  async function remove(id) {
    if (!confirm("Delete this teacher? This also removes their curriculum assignments.")) return;
    try {
      await api.delete(`/teachers/${id}`);
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Teachers</h1>
          <p>Who can teach what, and how many periods they can take per day/week.</p>
        </div>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      <div className="card">
        <h3>{editingId ? "Edit teacher" : "Add a teacher"}</h3>
        <form onSubmit={submit}>
          <div className="grid-2">
            <div className="field">
              <label>Full name</label>
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
            </div>
            <div className="field">
              <label>Email (optional)</label>
              <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </div>
            <div className="field">
              <label>Max periods / day</label>
              <input type="number" min={1} max={12} value={form.maxPeriodsPerDay} onChange={(e) => setForm({ ...form, maxPeriodsPerDay: +e.target.value })} />
            </div>
            <div className="field">
              <label>Max periods / week</label>
              <input type="number" min={1} max={60} value={form.maxPeriodsPerWeek} onChange={(e) => setForm({ ...form, maxPeriodsPerWeek: +e.target.value })} />
            </div>
          </div>

          <div className="field">
            <label>Qualified to teach</label>
            <div className="tag-row">
              {subjects.map((s) => (
                <button
                  type="button"
                  key={s.id}
                  onClick={() => toggleSubject(s.id)}
                  className="chip"
                  style={{
                    cursor: "pointer",
                    border: "1px solid " + (form.subjectIds.includes(s.id) ? s.color : "var(--border)"),
                    background: form.subjectIds.includes(s.id) ? s.color + "22" : "#fff",
                    color: form.subjectIds.includes(s.id) ? s.color : "var(--text-muted)",
                  }}
                >
                  {s.name}
                </button>
              ))}
              {subjects.length === 0 && <span className="muted">Add subjects first.</span>}
            </div>
          </div>

          <div className="flex gap-8" style={{ marginTop: 10 }}>
            <button className="btn btn-primary">{editingId ? "Save changes" : "Add teacher"}</button>
            {editingId && (
              <button type="button" className="btn btn-outline" onClick={resetForm}>
                Cancel
              </button>
            )}
          </div>
        </form>
      </div>

      <div className="card" style={{ padding: 0 }}>
        {loading ? (
          <div className="empty-state">Loading…</div>
        ) : teachers.length === 0 ? (
          <div className="empty-state">No teachers yet.</div>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Teacher</th>
                <th>Subjects</th>
                <th>Limits</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {teachers.map((t) => (
                <tr key={t.id}>
                  <td>
                    <strong>{t.name}</strong>
                    {t.email && <div className="muted" style={{ fontSize: 12 }}>{t.email}</div>}
                  </td>
                  <td>
                    <div className="tag-row">
                      {t.teacherSubjects.map((ts) => (
                        <span key={ts.id} className="chip" style={{ background: ts.subject.color + "22", color: ts.subject.color }}>
                          {ts.subject.name}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="mono">
                    {t.maxPeriodsPerDay}/day · {t.maxPeriodsPerWeek}/wk
                  </td>
                  <td>
                    <div className="flex gap-8">
                      <button className="btn btn-outline btn-sm" onClick={() => edit(t)}>
                        Edit
                      </button>
                      <button className="btn btn-danger btn-sm" onClick={() => remove(t.id)}>
                        Delete
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
