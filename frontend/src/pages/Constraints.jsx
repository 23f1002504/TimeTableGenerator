import React, { useEffect, useState } from "react";
import { api } from "../api";
import { useSchoolScope } from "../hooks/useSchoolScope.js";

const DEFAULTS = {
  maxSameSubjectPerDay: 2,
  teacherMaxConsecutivePeriods: 0,
  spreadSubjectsAcrossWeek: true,
  preferMorningForPriority: true,
  avoidTeacherGaps: true,
};

const HARD_CONSTRAINTS = [
  { title: "Teacher never double-booked", detail: "A teacher can't teach two divisions in the same period." },
  { title: "Division never double-booked", detail: "A division can't have two subjects in the same period." },
  { title: "Teacher qualification required", detail: "A teacher can only be assigned periods for subjects they're marked qualified to teach (set on the Teachers page)." },
  { title: "Teacher daily & weekly limits", detail: "Each teacher's max periods/day and max periods/week (set per-teacher) are never exceeded." },
  { title: "Teacher unavailability respected", detail: "Slots a teacher has marked unavailable are never used for them." },
  { title: "Double periods stay together", detail: "Subjects marked \"double period\" (e.g. labs) are always placed as two consecutive periods on the same day." },
  { title: "Locked cells are preserved", detail: "Manually locked timetable cells are kept exactly as-is when you regenerate." },
  { title: "Max repeats of a subject per day", detail: "Editable below — a division never gets more of the same subject in one day than the limit you set.", editable: true },
  { title: "Teacher max consecutive periods", detail: "Editable below — a teacher is never scheduled beyond this many periods in a row without a gap.", editable: true },
];

const SOFT_CONSTRAINTS = [
  { title: "Spread subjects across the week", detail: "Prefers different days for a subject's lessons over stacking them, when the daily cap allows more than one.", editable: true },
  { title: "Morning priority for difficult subjects", detail: "Subjects flagged \"prefer morning\" (set on the Subjects page) are nudged toward earlier periods.", editable: true },
  { title: "Minimize teacher gaps", detail: "Prefers slots next to a teacher's other lessons that day over leaving them an idle period in between.", editable: true },
];

const NOT_YET_SUPPORTED = [
  "Room / lab booking (a room being used by only one class at a time)",
  "Elective group synchronization across classes (e.g. Hindi/Sanskrit/French run at the same slot so students can mix)",
  "Fixed non-teaching activities beyond breaks (assembly, club periods, library slots pinned to an exact time)",
  "Exam period / invigilation scheduling",
  "Multi-campus travel time between periods",
  "Explicit teacher day-off or no-first/last-period preferences",
];

export default function Constraints() {
  const { params } = useSchoolScope();
  const [settings, setSettings] = useState(DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  async function load() {
    setLoading(true);
    try {
      const data = await api.get("/settings", params);
      setSettings(data.settings);
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

  async function save(e) {
    e.preventDefault();
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      const data = await api.put("/settings", { ...settings, ...params });
      setSettings(data.settings);
      setSuccess("Saved — these apply the next time you generate or regenerate a timetable.");
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Constraints</h1>
          <p>What the scheduling engine always guarantees, what it optimizes for, and what you can tune.</p>
        </div>
      </div>

      {error && <div className="alert alert-error">{error}</div>}
      {success && <div className="alert alert-success">{success}</div>}

      <div className="card">
        <h3>Editable settings</h3>
        <p className="muted" style={{ fontSize: 13, marginTop: -8, marginBottom: 16 }}>
          These are the "prime" knobs — change them here, then Generate or Regenerate the timetable for them to take effect.
        </p>

        {loading ? (
          <div className="empty-state">Loading…</div>
        ) : (
          <form onSubmit={save}>
            <div className="grid-2">
              <div className="field">
                <label>Max periods of the same subject, per division, per day</label>
                <input
                  type="number"
                  min={0}
                  max={20}
                  value={settings.maxSameSubjectPerDay}
                  onChange={(e) => setSettings({ ...settings, maxSameSubjectPerDay: +e.target.value })}
                />
                <p className="muted" style={{ fontSize: 12, marginTop: 4 }}>
                  0 = unlimited. Hard limit — never exceeded.
                </p>
              </div>
              <div className="field">
                <label>Teacher max consecutive periods (no gap)</label>
                <input
                  type="number"
                  min={0}
                  max={20}
                  value={settings.teacherMaxConsecutivePeriods}
                  onChange={(e) => setSettings({ ...settings, teacherMaxConsecutivePeriods: +e.target.value })}
                />
                <p className="muted" style={{ fontSize: 12, marginTop: 4 }}>
                  0 = unlimited. Hard limit — never exceeded.
                </p>
              </div>
            </div>

            <label className="checkbox-row" style={{ marginTop: 6 }}>
              <input
                type="checkbox"
                checked={settings.spreadSubjectsAcrossWeek}
                onChange={(e) => setSettings({ ...settings, spreadSubjectsAcrossWeek: e.target.checked })}
              />
              Spread each subject's lessons across different days where possible
            </label>
            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={settings.preferMorningForPriority}
                onChange={(e) => setSettings({ ...settings, preferMorningForPriority: e.target.checked })}
              />
              Give subjects marked "prefer morning" earlier periods where possible
            </label>
            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={settings.avoidTeacherGaps}
                onChange={(e) => setSettings({ ...settings, avoidTeacherGaps: e.target.checked })}
              />
              Minimize idle gaps in teachers' daily schedules
            </label>

            <button className="btn btn-primary" style={{ marginTop: 14 }} disabled={saving}>
              {saving ? "Saving…" : "Save settings"}
            </button>
          </form>
        )}
      </div>

      <div className="card">
        <h3>Always enforced (hard constraints)</h3>
        <p className="muted" style={{ fontSize: 13, marginTop: -8, marginBottom: 14 }}>
          The generator will never produce a timetable that breaks any of these.
        </p>
        <ConstraintList items={HARD_CONSTRAINTS} tone="hard" />
      </div>

      <div className="card">
        <h3>Optimized for (soft preferences)</h3>
        <p className="muted" style={{ fontSize: 13, marginTop: -8, marginBottom: 14 }}>
          The generator tries hard to honor these, but will relax one rather than fail to produce a timetable at all.
        </p>
        <ConstraintList items={SOFT_CONSTRAINTS} tone="soft" />
      </div>

      <div className="card">
        <h3>Not yet supported</h3>
        <p className="muted" style={{ fontSize: 13, marginTop: -8, marginBottom: 14 }}>
          Real scheduling concerns worth knowing about — just not built into this engine yet.
        </p>
        <ul style={{ margin: 0, paddingLeft: 20, fontSize: 13.5, lineHeight: 1.9, color: "var(--text-muted)" }}>
          {NOT_YET_SUPPORTED.map((item, i) => (
            <li key={i}>{item}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function ConstraintList({ items, tone }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {items.map((item, i) => (
        <div key={i} className="flex gap-12" style={{ alignItems: "flex-start" }}>
          <span
            style={{
              flexShrink: 0,
              width: 20,
              height: 20,
              borderRadius: "50%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 11,
              fontWeight: 700,
              marginTop: 1,
              background: tone === "hard" ? "#e6f6ee" : "#fff6e5",
              color: tone === "hard" ? "var(--green)" : "var(--amber-dark)",
            }}
          >
            {tone === "hard" ? "✓" : "~"}
          </span>
          <div>
            <div style={{ fontWeight: 600, fontSize: 13.5 }}>
              {item.title}
              {item.editable && (
                <span className="chip" style={{ marginLeft: 8, background: "#eef1f8", color: "var(--ink-soft)", fontSize: 10.5 }}>
                  editable above
                </span>
              )}
            </div>
            <div className="muted" style={{ fontSize: 12.5, marginTop: 2 }}>
              {item.detail}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
