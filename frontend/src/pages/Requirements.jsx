import React, { useEffect, useState } from "react";
import { api } from "../api";
import { useSchoolScope } from "../hooks/useSchoolScope.js";

export default function Requirements() {
  const { schoolId, params } = useSchoolScope();
  const [classes, setClasses] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [teachers, setTeachers] = useState([]);
  const [requirements, setRequirements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [selectedDivision, setSelectedDivision] = useState("");
  const [form, setForm] = useState({ subjectId: "", teacherId: "", hoursPerWeek: 4 });

  async function load() {
    setLoading(true);
    try {
      const [c, s, t, r] = await Promise.all([
        api.get("/classes", params),
        api.get("/subjects", params),
        api.get("/teachers", params),
        api.get(`/requirements/schools/${schoolId}`),
      ]);
      setClasses(c.classes);
      setSubjects(s.subjects);
      setTeachers(t.teachers);
      setRequirements(r.requirements);
      const firstDivision = c.classes.flatMap((cl) => cl.divisions)[0];
      if (firstDivision && !selectedDivision) setSelectedDivision(firstDivision.id);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schoolId]);

  const eligibleTeachers = teachers.filter((t) => t.teacherSubjects.some((ts) => ts.subject.id === form.subjectId));

  async function submit(e) {
    e.preventDefault();
    if (!selectedDivision || !form.subjectId || !form.teacherId) return;
    setError("");
    try {
      await api.post("/requirements", { divisionId: selectedDivision, ...form });
      setForm({ subjectId: "", teacherId: "", hoursPerWeek: 4 });
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  async function remove(id) {
    try {
      await api.delete(`/requirements/${id}`);
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  const divisionOptions = classes.flatMap((cl) => cl.divisions.map((d) => ({ id: d.id, label: `${cl.name} ${d.name}` })));
  const divisionReqs = requirements.filter((r) => r.divisionId === selectedDivision);
  const totalHours = divisionReqs.reduce((sum, r) => sum + r.hoursPerWeek, 0);

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Curriculum</h1>
          <p>For each division: which subject, taught by whom, how many periods a week.</p>
        </div>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      <div className="card">
        <div className="field" style={{ maxWidth: 280 }}>
          <label>Division</label>
          <select value={selectedDivision} onChange={(e) => setSelectedDivision(e.target.value)}>
            {divisionOptions.map((d) => (
              <option key={d.id} value={d.id}>
                {d.label}
              </option>
            ))}
          </select>
        </div>

        {selectedDivision && (
          <>
            <form onSubmit={submit} className="grid-3" style={{ alignItems: "end", marginTop: 6 }}>
              <div className="field">
                <label>Subject</label>
                <select value={form.subjectId} onChange={(e) => setForm({ ...form, subjectId: e.target.value, teacherId: "" })} required>
                  <option value="">Select subject…</option>
                  {subjects.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label>Teacher</label>
                <select value={form.teacherId} onChange={(e) => setForm({ ...form, teacherId: e.target.value })} required disabled={!form.subjectId}>
                  <option value="">Select teacher…</option>
                  {eligibleTeachers.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
                {form.subjectId && eligibleTeachers.length === 0 && (
                  <p className="muted" style={{ fontSize: 12, marginTop: 4 }}>
                    No teacher is qualified for this subject yet — add it under Teachers.
                  </p>
                )}
              </div>
              <div className="field">
                <label>Hours / week</label>
                <div className="flex gap-8">
                  <input
                    type="number"
                    min={1}
                    max={20}
                    value={form.hoursPerWeek}
                    onChange={(e) => setForm({ ...form, hoursPerWeek: +e.target.value })}
                  />
                  <button className="btn btn-primary" style={{ whiteSpace: "nowrap" }}>
                    Add
                  </button>
                </div>
              </div>
            </form>

            <table className="table" style={{ marginTop: 16 }}>
              <thead>
                <tr>
                  <th>Subject</th>
                  <th>Teacher</th>
                  <th>Hours / week</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {divisionReqs.length === 0 && (
                  <tr>
                    <td colSpan={4} className="muted">
                      No subjects assigned yet for this division.
                    </td>
                  </tr>
                )}
                {divisionReqs.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <span className="chip" style={{ background: r.subject.color + "22", color: r.subject.color }}>
                        {r.subject.name}
                      </span>
                    </td>
                    <td>{r.teacher.name}</td>
                    <td className="mono">{r.hoursPerWeek}</td>
                    <td>
                      <button className="btn btn-danger btn-sm" onClick={() => remove(r.id)}>
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {divisionReqs.length > 0 && (
              <p className="muted" style={{ marginTop: 10, fontSize: 13 }}>
                Total: <strong className="mono">{totalHours}</strong> periods/week assigned to this division.
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
