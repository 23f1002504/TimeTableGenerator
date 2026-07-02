import React, { useEffect, useState } from "react";
import { api } from "../api";
import { useSchoolScope } from "../hooks/useSchoolScope.js";

const COLORS = ["#4F46E5", "#0EA5E9", "#16A34A", "#F59E0B", "#DB2777", "#65A30D", "#9333EA", "#DC2626", "#0F8B8D"];

export default function Subjects() {
  const { params } = useSchoolScope();
  const [subjects, setSubjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [form, setForm] = useState({ name: "", code: "", color: COLORS[0], isDoublePeriod: false });
  const [editingId, setEditingId] = useState(null);

  async function load() {
    setLoading(true);
    try {
      const data = await api.get("/subjects", params);
      setSubjects(data.subjects);
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
    setForm({ name: "", code: "", color: COLORS[0], isDoublePeriod: false });
    setEditingId(null);
  }

  async function submit(e) {
    e.preventDefault();
    setError("");
    try {
      if (editingId) {
        await api.put(`/subjects/${editingId}`, form);
      } else {
        await api.post("/subjects", { ...form, ...params });
      }
      resetForm();
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  function edit(subject) {
    setEditingId(subject.id);
    setForm({ name: subject.name, code: subject.code || "", color: subject.color, isDoublePeriod: subject.isDoublePeriod });
  }

  async function remove(id) {
    if (!confirm("Delete this subject? This also removes any curriculum requirements using it.")) return;
    try {
      await api.delete(`/subjects/${id}`);
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Subjects</h1>
          <p>Everything taught at this school. Mark labs or similar as double-period.</p>
        </div>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      <div className="card">
        <h3>{editingId ? "Edit subject" : "Add a subject"}</h3>
        <form onSubmit={submit}>
          <div className="grid-3">
            <div className="field">
              <label>Name</label>
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
            </div>
            <div className="field">
              <label>Code</label>
              <input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="e.g. MATH" />
            </div>
            <div className="field">
              <label>Color</label>
              <div className="tag-row">
                {COLORS.map((c) => (
                  <button
                    type="button"
                    key={c}
                    onClick={() => setForm({ ...form, color: c })}
                    style={{
                      width: 26,
                      height: 26,
                      borderRadius: 999,
                      background: c,
                      border: form.color === c ? "2px solid var(--ink)" : "2px solid transparent",
                      cursor: "pointer",
                    }}
                  />
                ))}
              </div>
            </div>
          </div>
          <label className="checkbox-row" style={{ marginTop: 4 }}>
            <input type="checkbox" checked={form.isDoublePeriod} onChange={(e) => setForm({ ...form, isDoublePeriod: e.target.checked })} />
            Needs double (back-to-back) periods, e.g. lab sessions
          </label>
          <div className="flex gap-8" style={{ marginTop: 10 }}>
            <button className="btn btn-primary">{editingId ? "Save changes" : "Add subject"}</button>
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
        ) : subjects.length === 0 ? (
          <div className="empty-state">No subjects yet.</div>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Subject</th>
                <th>Code</th>
                <th>Type</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {subjects.map((s) => (
                <tr key={s.id}>
                  <td>
                    <span className="chip" style={{ background: s.color + "22", color: s.color }}>
                      <span style={{ width: 8, height: 8, borderRadius: 99, background: s.color, display: "inline-block" }} />
                      {s.name}
                    </span>
                  </td>
                  <td className="mono">{s.code}</td>
                  <td>{s.isDoublePeriod ? "Double period" : "Single period"}</td>
                  <td>
                    <div className="flex gap-8">
                      <button className="btn btn-outline btn-sm" onClick={() => edit(s)}>
                        Edit
                      </button>
                      <button className="btn btn-danger btn-sm" onClick={() => remove(s.id)}>
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
