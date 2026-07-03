import React, { useEffect, useState } from "react";
import { api } from "../api";
import { useSchoolScope } from "../hooks/useSchoolScope.js";

export default function ClassesDivisions() {
  const { params } = useSchoolScope();
  const [classes, setClasses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [mode, setMode] = useState("single"); // "single" | "range"
  const [newClassName, setNewClassName] = useState("");
  const [newClassDivisions, setNewClassDivisions] = useState(1);
  const [rangeForm, setRangeForm] = useState({ prefix: "Grade", startNum: 1, endNum: 5, divisionsCount: 2 });
  const [creatingRange, setCreatingRange] = useState(false);

  const [newDivisionInputs, setNewDivisionInputs] = useState({});
  const [bulkDivisionInputs, setBulkDivisionInputs] = useState({});

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

  function flash(message) {
    setSuccess(message);
    setTimeout(() => setSuccess(""), 4000);
  }

  async function addClass(e) {
    e.preventDefault();
    if (!newClassName.trim()) return;
    setError("");
    try {
      await api.post("/classes", { name: newClassName, order: classes.length, divisionsCount: newClassDivisions, ...params });
      setNewClassName("");
      setNewClassDivisions(1);
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  async function createRange(e) {
    e.preventDefault();
    setError("");
    setCreatingRange(true);
    try {
      const data = await api.post("/classes/bulk-range", { ...rangeForm, ...params });
      flash(`Created ${data.classes.length} classes (${rangeForm.prefix} ${rangeForm.startNum}–${rangeForm.endNum}), each with ${rangeForm.divisionsCount} division(s).`);
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setCreatingRange(false);
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

  async function addDivisionsBulk(cls) {
    const count = Number(bulkDivisionInputs[cls.id] || 0);
    if (!count || count < 1) return;
    setError("");
    try {
      await api.post(`/classes/${cls.id}/divisions/bulk`, { count });
      setBulkDivisionInputs((s) => ({ ...s, [cls.id]: "" }));
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
      {success && <div className="alert alert-success">{success}</div>}

      <div className="card">
        <div className="flex gap-8" style={{ marginBottom: 14 }}>
          <button className={mode === "single" ? "btn btn-primary btn-sm" : "btn btn-outline btn-sm"} onClick={() => setMode("single")}>
            Add one class
          </button>
          <button className={mode === "range" ? "btn btn-primary btn-sm" : "btn btn-outline btn-sm"} onClick={() => setMode("range")}>
            Create a range (e.g. Grade 1–10)
          </button>
        </div>

        {mode === "single" ? (
          <form onSubmit={addClass} className="flex gap-8 wrap" style={{ alignItems: "end" }}>
            <div className="field" style={{ marginBottom: 0 }}>
              <label>Class name</label>
              <input style={{ minWidth: 200 }} placeholder="e.g. Grade 9, Class X" value={newClassName} onChange={(e) => setNewClassName(e.target.value)} />
            </div>
            <div className="field" style={{ marginBottom: 0 }}>
              <label>Divisions</label>
              <input type="number" min={1} max={26} style={{ width: 90 }} value={newClassDivisions} onChange={(e) => setNewClassDivisions(+e.target.value)} />
            </div>
            <button className="btn btn-primary">Add class</button>
            <p className="muted" style={{ fontSize: 12, width: "100%", marginTop: -4 }}>
              {newClassDivisions > 1 ? `Creates divisions A–${String.fromCharCode(64 + Math.min(newClassDivisions, 26))} automatically.` : "Creates division A automatically."}
            </p>
          </form>
        ) : (
          <form onSubmit={createRange}>
            <div className="grid-3">
              <div className="field">
                <label>Prefix</label>
                <input value={rangeForm.prefix} onChange={(e) => setRangeForm({ ...rangeForm, prefix: e.target.value })} placeholder="e.g. Grade" required />
              </div>
              <div className="field">
                <label>From</label>
                <input type="number" min={1} value={rangeForm.startNum} onChange={(e) => setRangeForm({ ...rangeForm, startNum: +e.target.value })} />
              </div>
              <div className="field">
                <label>To</label>
                <input type="number" min={rangeForm.startNum} value={rangeForm.endNum} onChange={(e) => setRangeForm({ ...rangeForm, endNum: +e.target.value })} />
              </div>
            </div>
            <div className="field" style={{ maxWidth: 200 }}>
              <label>Divisions per class</label>
              <input type="number" min={1} max={26} value={rangeForm.divisionsCount} onChange={(e) => setRangeForm({ ...rangeForm, divisionsCount: +e.target.value })} />
            </div>
            <p className="muted" style={{ fontSize: 12.5, marginBottom: 12 }}>
              Will create <strong>{Math.max(0, rangeForm.endNum - rangeForm.startNum + 1)}</strong> classes: "{rangeForm.prefix} {rangeForm.startNum}" through "
              {rangeForm.prefix} {rangeForm.endNum}", each with divisions A–{String.fromCharCode(64 + Math.min(rangeForm.divisionsCount || 1, 26))}.
            </p>
            <button className="btn btn-primary" disabled={creatingRange}>
              {creatingRange ? "Creating…" : "Create range"}
            </button>
          </form>
        )}
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

            <div className="flex gap-8 wrap">
              <input
                style={{ maxWidth: 140 }}
                placeholder="New division, e.g. C"
                value={newDivisionInputs[cls.id] || ""}
                onChange={(e) => setNewDivisionInputs((s) => ({ ...s, [cls.id]: e.target.value }))}
              />
              <button className="btn btn-outline btn-sm" onClick={() => addDivision(cls)}>
                + Add division
              </button>

              <span className="muted" style={{ fontSize: 12 }}>
                or
              </span>

              <input
                type="number"
                min={1}
                max={26}
                style={{ maxWidth: 70 }}
                placeholder="#"
                value={bulkDivisionInputs[cls.id] || ""}
                onChange={(e) => setBulkDivisionInputs((s) => ({ ...s, [cls.id]: e.target.value }))}
              />
              <button className="btn btn-outline btn-sm" onClick={() => addDivisionsBulk(cls)}>
                + Add that many at once
              </button>
            </div>
          </div>
        ))
      )}
    </div>
  );
}
