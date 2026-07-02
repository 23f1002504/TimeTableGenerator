import React, { useEffect, useMemo, useState } from "react";
import { api } from "../api";
import { useSchoolScope } from "../hooks/useSchoolScope.js";

const DAYS = ["MON", "TUE", "WED", "THU", "FRI", "SAT"];
const DAY_LABELS = { MON: "Mon", TUE: "Tue", WED: "Wed", THU: "Thu", FRI: "Fri", SAT: "Sat" };

export default function Timetable() {
  const { schoolId, params } = useSchoolScope();

  const [versions, setVersions] = useState([]);
  const [activeVersionId, setActiveVersionId] = useState("");
  const [grid, setGrid] = useState({ entries: [], periods: [], classes: [] });
  const [subjects, setSubjects] = useState([]);
  const [teachers, setTeachers] = useState([]);

  const [viewMode, setViewMode] = useState("division"); // "division" | "teacher"
  const [selectedDivision, setSelectedDivision] = useState("");
  const [selectedTeacher, setSelectedTeacher] = useState("");

  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState("");
  const [generateResult, setGenerateResult] = useState(null);
  const [editCell, setEditCell] = useState(null); // { day, periodNumber, entry? }

  async function loadStaticData() {
    const [s, t] = await Promise.all([api.get("/subjects", params), api.get("/teachers", params)]);
    setSubjects(s.subjects);
    setTeachers(t.teachers);
  }

  async function loadVersions(preferVersionId) {
    const v = await api.get(`/timetable/schools/${schoolId}/versions`);
    setVersions(v.versions);
    const target = preferVersionId || (v.versions[0] && v.versions[0].id) || "";
    setActiveVersionId(target);
    return target;
  }

  async function loadGrid(versionId) {
    if (!versionId) {
      setGrid({ entries: [], periods: [], classes: [] });
      return;
    }
    const g = await api.get(`/timetable/schools/${schoolId}/versions/${versionId}/grid`);
    setGrid(g);
    if (!selectedDivision) {
      const firstDivision = g.classes.flatMap((c) => c.divisions)[0];
      if (firstDivision) setSelectedDivision(firstDivision.id);
    }
  }

  async function initialLoad() {
    setLoading(true);
    setError("");
    try {
      await loadStaticData();
      const versionId = await loadVersions();
      await loadGrid(versionId);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    initialLoad();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schoolId]);

  useEffect(() => {
    if (activeVersionId) loadGrid(activeVersionId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeVersionId]);

  useEffect(() => {
    if (!selectedTeacher && teachers.length > 0) setSelectedTeacher(teachers[0].id);
  }, [teachers]); // eslint-disable-line react-hooks/exhaustive-deps

  async function generate(keepLocked) {
    setGenerating(true);
    setError("");
    setGenerateResult(null);
    try {
      const result = await api.post(`/timetable/schools/${schoolId}/generate`, {
        label: `Generated ${new Date().toLocaleString()}`,
        keepLocked,
      });
      setGenerateResult(result);
      const versionId = await loadVersions(result.versionId);
      await loadGrid(versionId);
    } catch (err) {
      setError(err.message);
    } finally {
      setGenerating(false);
    }
  }

  // Build day -> ordered period rows (using the union so custom per-day
  // schedules still render sensibly).
  const periodsByDay = useMemo(() => {
    const map = Object.fromEntries(DAYS.map((d) => [d, []]));
    for (const p of grid.periods) map[p.day].push(p);
    for (const d of DAYS) map[d].sort((a, b) => a.periodNumber - b.periodNumber);
    return map;
  }, [grid.periods]);

  const maxRows = Math.max(0, ...DAYS.map((d) => periodsByDay[d].length));

  const divisionOptions = grid.classes.flatMap((c) => c.divisions.map((d) => ({ id: d.id, label: `${c.name} ${d.name}` })));

  function entryFor(day, periodNumber) {
    if (viewMode === "division") {
      return grid.entries.find((e) => e.divisionId === selectedDivision && e.day === day && e.periodNumber === periodNumber);
    }
    return grid.entries.find((e) => e.teacherId === selectedTeacher && e.day === day && e.periodNumber === periodNumber);
  }

  function periodMeta(day, periodNumber) {
    return periodsByDay[day].find((p) => p.periodNumber === periodNumber);
  }

  async function toggleLock(entry) {
    try {
      await api.post(`/timetable/entries/${entry.id}/toggle-lock`);
      loadGrid(activeVersionId);
    } catch (err) {
      setError(err.message);
    }
  }

  async function deleteEntry(entry) {
    try {
      await api.delete(`/timetable/entries/${entry.id}`);
      loadGrid(activeVersionId);
    } catch (err) {
      setError(err.message);
    }
  }

  function openCell(day, periodNumber) {
    if (viewMode !== "division") return; // manual edits are per-division
    const existing = entryFor(day, periodNumber);
    setEditCell({ day, periodNumber, entry: existing || null });
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Timetable</h1>
          <p>Generate a conflict-free schedule, then fine-tune any cell by hand.</p>
        </div>
        <div className="flex gap-8">
          <button className="btn btn-outline" onClick={() => generate(true)} disabled={generating}>
            {generating ? "Generating…" : "Regenerate (keep locked cells)"}
          </button>
          <button className="btn btn-primary" onClick={() => generate(false)} disabled={generating}>
            {generating ? "Generating…" : "Generate fresh timetable"}
          </button>
        </div>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      {generateResult && (
        <div className={`alert ${generateResult.success ? "alert-success" : "alert-warn"}`}>
          Placed {generateResult.placedCount} of {generateResult.totalLessons} lesson slots.
          {generateResult.unplaced.length > 0 && (
            <ul style={{ margin: "8px 0 0", paddingLeft: 18 }}>
              {generateResult.unplaced.slice(0, 12).map((u, i) => (
                <li key={i}>
                  {u.divisionLabel} — {u.subjectName} ({u.teacherName}): {u.reason}
                </li>
              ))}
              {generateResult.unplaced.length > 12 && <li>…and {generateResult.unplaced.length - 12} more.</li>}
            </ul>
          )}
        </div>
      )}

      {!loading && versions.length === 0 && (
        <div className="card empty-state">
          No timetable generated yet. Make sure you've added teachers, subjects, classes, a bell schedule and
          curriculum requirements, then click "Generate fresh timetable" above.
        </div>
      )}

      {versions.length > 0 && (
        <div className="card">
          <div className="flex space-between wrap gap-12">
            <div className="flex gap-12 wrap">
              <div className="field" style={{ marginBottom: 0, minWidth: 220 }}>
                <label>Version</label>
                <select value={activeVersionId} onChange={(e) => setActiveVersionId(e.target.value)}>
                  {versions.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.label} {v.published ? "(published)" : ""} — {v._count.entries} lessons
                    </option>
                  ))}
                </select>
              </div>

              <div className="field" style={{ marginBottom: 0 }}>
                <label>View by</label>
                <div className="flex gap-8">
                  <button className={viewMode === "division" ? "btn btn-primary btn-sm" : "btn btn-outline btn-sm"} onClick={() => setViewMode("division")}>
                    Division
                  </button>
                  <button className={viewMode === "teacher" ? "btn btn-primary btn-sm" : "btn btn-outline btn-sm"} onClick={() => setViewMode("teacher")}>
                    Teacher
                  </button>
                </div>
              </div>

              {viewMode === "division" ? (
                <div className="field" style={{ marginBottom: 0, minWidth: 180 }}>
                  <label>Division</label>
                  <select value={selectedDivision} onChange={(e) => setSelectedDivision(e.target.value)}>
                    {divisionOptions.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.label}
                      </option>
                    ))}
                  </select>
                </div>
              ) : (
                <div className="field" style={{ marginBottom: 0, minWidth: 180 }}>
                  <label>Teacher</label>
                  <select value={selectedTeacher} onChange={(e) => setSelectedTeacher(e.target.value)}>
                    {teachers.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {versions.length > 0 && maxRows > 0 && (
        <div className="card timetable-wrap">
          <table className="timetable-grid">
            <thead>
              <tr>
                <th></th>
                {DAYS.map((d) => (
                  <th key={d}>{DAY_LABELS[d]}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: maxRows }).map((_, rowIdx) => {
                const periodNumber = rowIdx + 1;
                return (
                  <tr key={rowIdx}>
                    <td className="time-cell">
                      {periodMeta("MON", periodNumber) ? `${periodMeta("MON", periodNumber).startTime}` : `P${periodNumber}`}
                    </td>
                    {DAYS.map((day) => {
                      const meta = periodMeta(day, periodNumber);
                      if (!meta) return <td key={day}></td>;
                      if (meta.isBreak) {
                        return (
                          <td key={day}>
                            <div className="break-cell">{meta.label || "Break"}</div>
                          </td>
                        );
                      }
                      const entry = entryFor(day, periodNumber);
                      const subj = entry?.subject;
                      return (
                        <td key={day}>
                          <div
                            className={`lesson-cell ${entry ? "" : "empty"} ${entry?.locked ? "locked" : ""}`}
                            style={entry ? { background: subj.color + "20", border: `1px solid ${subj.color}55` } : {}}
                            onClick={() => openCell(day, periodNumber)}
                            title={viewMode === "teacher" ? "Switch to Division view to edit" : entry ? "Click to edit" : "Click to add"}
                          >
                            {entry ? (
                              <>
                                <span className="subj" style={{ color: subj.color }}>
                                  {subj.name}
                                </span>
                                <span className="teacher">{viewMode === "division" ? entry.teacher.name : `${entry.division.class.name} ${entry.division.name}`}</span>
                              </>
                            ) : (
                              <span className="muted" style={{ fontSize: 11 }}>—</span>
                            )}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {editCell && (
        <EditCellModal
          editCell={editCell}
          subjects={subjects}
          teachers={teachers}
          versionId={activeVersionId}
          divisionId={selectedDivision}
          onClose={() => setEditCell(null)}
          onSaved={() => {
            setEditCell(null);
            loadGrid(activeVersionId);
          }}
          onToggleLock={toggleLock}
          onDelete={deleteEntry}
          setError={setError}
        />
      )}
    </div>
  );
}

function EditCellModal({ editCell, subjects, teachers, versionId, divisionId, onClose, onSaved, onToggleLock, onDelete, setError }) {
  const { day, periodNumber, entry } = editCell;
  const [subjectId, setSubjectId] = useState(entry?.subjectId || "");
  const [teacherId, setTeacherId] = useState(entry?.teacherId || "");
  const [saving, setSaving] = useState(false);

  const eligibleTeachers = teachers.filter((t) => t.teacherSubjects.some((ts) => ts.subject.id === subjectId));

  async function save() {
    if (!subjectId || !teacherId) return;
    setSaving(true);
    try {
      await api.put(`/timetable/versions/${versionId}/entries`, {
        divisionId,
        subjectId,
        teacherId,
        day,
        periodNumber,
        entryId: entry?.id,
      });
      onSaved();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>
          {DAY_LABELS[day]} · Period {periodNumber}
        </h3>

        <div className="field">
          <label>Subject</label>
          <select value={subjectId} onChange={(e) => { setSubjectId(e.target.value); setTeacherId(""); }}>
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
          <select value={teacherId} onChange={(e) => setTeacherId(e.target.value)} disabled={!subjectId}>
            <option value="">Select teacher…</option>
            {eligibleTeachers.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </div>

        <div className="modal-actions">
          {entry && (
            <>
              <button className="btn btn-outline btn-sm" onClick={() => onToggleLock(entry)}>
                {entry.locked ? "Unlock" : "Lock"}
              </button>
              <button className="btn btn-danger btn-sm" onClick={() => onDelete(entry)}>
                Remove
              </button>
            </>
          )}
          <button className="btn btn-outline btn-sm" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary btn-sm" onClick={save} disabled={saving || !subjectId || !teacherId}>
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
