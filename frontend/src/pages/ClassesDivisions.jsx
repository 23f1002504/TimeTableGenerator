import React, { useEffect, useState } from "react";
import { api } from "../api";
import { useSchoolScope } from "../hooks/useSchoolScope.js";

export default function ClassesDivisions() {
  const { params } = useSchoolScope();
  const [classes, setClasses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [newClassName, setNewClassName] = useState("");
  const [newDivisionInputs, setNewDivisionInputs] = useState({});

  async function load() {
    setLoading(true);
    try {
      const data = await api.get("/classes", params);
      setClasses(data.classes);
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

  async function addClass(e) {
    e.preventDefault();
    if (!newClassName.trim()) return;
    try {
      await api.post("/classes", { name: newClassName, order: classes.length, divisionNames: ["A"], ...params });
      setNewClassName("");
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  async function renameClass(cls, name) {
    try {
      await api.put(`/classes/${cls.id}`, { name, order: cls.order });
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  async function removeClass(cls) {
    if (!confirm(`Delete "${cls.name}" and all its divisions? This also removes their curriculum & timetable entries.`)) return;
    try {
      await api.delete(`/classes/${cls.id}`);
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  async function addDivision(cls) {
    const name = (newDivisionInputs[cls.id] || "").trim();
    if (!name) return;
    try {
      await api.post(`/classes/${cls.id}/divisions`, { name });
      setNewDivisionInputs((s) => ({ ...s, [cls.id]: "" }));
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  async function renameDivision(cls, division, name) {
    try {
      await api.put(`/classes/${cls.id}/divisions/${division.id}`, { name, studentCount: division.studentCount });
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  async function removeDivision(cls, division) {
    if (!confirm(`Delete division "${division.name}"?`)) return;
    try {
      await api.delete(`/classes/${cls.id}/divisions/${division.id}`);
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Classes & Divisions</h1>
          <p>Grades/classes, and their sections — fully editable, add or rename any time.</p>
        </div>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      <div className="card">
        <h3>Add a class</h3>
        <form onSubmit={addClass} className="flex gap-8">
          <input
            style={{ maxWidth: 260 }}
            placeholder="e.g. Grade 9, Class X"
            value={newClassName}
            onChange={(e) => setNewClassName(e.target.value)}
          />
          <button className="btn btn-primary">Add class</button>
        </form>
      </div>

      {loading ? (
        <div className="empty-state">Loading…</div>
      ) : classes.length === 0 ? (
        <div className="card empty-state">No classes yet — add one above.</div>
      ) : (
        classes.map((cls) => (
          <div className="card" key={cls.id}>
            <div className="flex space-between" style={{ marginBottom: 12 }}>
              <input
                defaultValue={cls.name}
                onBlur={(e) => e.target.value !== cls.name && renameClass(cls, e.target.value)}
                style={{ fontWeight: 700, fontSize: 15, maxWidth: 240, border: "none", background: "transparent", padding: "4px 0" }}
              />
              <button className="btn btn-danger btn-sm" onClick={() => removeClass(cls)}>
                Delete class
              </button>
            </div>

            <div className="tag-row" style={{ marginBottom: 10 }}>
              {cls.divisions.map((d) => (
                <div key={d.id} className="chip" style={{ background: "#eef1f8", paddingRight: 4 }}>
                  <input
                    defaultValue={d.name}
                    onBlur={(e) => e.target.value !== d.name && renameDivision(cls, d, e.target.value)}
                    style={{ width: 46, border: "none", background: "transparent", fontWeight: 700, fontSize: 12.5, padding: 0 }}
                  />
                  <button
                    onClick={() => removeDivision(cls, d)}
                    style={{ border: "none", background: "none", cursor: "pointer", color: "var(--red)", fontSize: 12 }}
                    title="Remove division"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>

            <div className="flex gap-8">
              <input
                style={{ maxWidth: 140 }}
                placeholder="New division, e.g. C"
                value={newDivisionInputs[cls.id] || ""}
                onChange={(e) => setNewDivisionInputs((s) => ({ ...s, [cls.id]: e.target.value }))}
              />
              <button className="btn btn-outline btn-sm" onClick={() => addDivision(cls)}>
                + Add division
              </button>
            </div>
          </div>
        ))
      )}
    </div>
  );
}
