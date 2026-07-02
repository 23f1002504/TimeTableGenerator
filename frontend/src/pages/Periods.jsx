import React, { useEffect, useState } from "react";
import { api } from "../api";
import { useSchoolScope } from "../hooks/useSchoolScope.js";

const DAYS = ["MON", "TUE", "WED", "THU", "FRI", "SAT"];
const DAY_LABELS = { MON: "Monday", TUE: "Tuesday", WED: "Wednesday", THU: "Thursday", FRI: "Friday", SAT: "Saturday" };

function blankRow(periodNumber) {
  return { periodNumber, startTime: "09:00", endTime: "09:45", isBreak: false, label: "" };
}

export default function Periods() {
  const { params } = useSchoolScope();
  const [byDay, setByDay] = useState(() => Object.fromEntries(DAYS.map((d) => [d, []])));
  const [activeDay, setActiveDay] = useState("MON");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  async function load() {
    setLoading(true);
    try {
      const data = await api.get("/periods", params);
      const grouped = Object.fromEntries(DAYS.map((d) => [d, []]));
      for (const p of data.periods) {
        grouped[p.day].push(p);
      }
      for (const d of DAYS) grouped[d].sort((a, b) => a.periodNumber - b.periodNumber);
      setByDay(grouped);
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

  function updateRow(day, index, field, value) {
    setByDay((s) => {
      const rows = [...s[day]];
      rows[index] = { ...rows[index], [field]: value };
      return { ...s, [day]: rows };
    });
  }

  function addRow(day) {
    setByDay((s) => {
      const rows = s[day];
      const nextNum = rows.length ? Math.max(...rows.map((r) => r.periodNumber)) + 1 : 1;
      return { ...s, [day]: [...rows, blankRow(nextNum)] };
    });
  }

  function removeRow(day, index) {
    setByDay((s) => ({ ...s, [day]: s[day].filter((_, i) => i !== index) }));
  }

  function copyToAllDays() {
    const template = byDay[activeDay];
    setByDay((s) => {
      const next = { ...s };
      for (const d of DAYS) if (d !== activeDay) next[d] = template.map((r) => ({ ...r }));
      return next;
    });
  }

  async function save() {
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      const schedule = DAYS.flatMap((day) =>
        byDay[day].map((r, i) => ({
          day,
          periodNumber: i + 1,
          startTime: r.startTime,
          endTime: r.endTime,
          isBreak: r.isBreak,
          label: r.label,
        }))
      );
      await api.put("/periods", { schedule, ...params });
      setSuccess("Bell schedule saved.");
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  const rows = byDay[activeDay] || [];

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Bell Schedule</h1>
          <p>Define exact start/end times per period, per day — 6 days a week, fully custom.</p>
        </div>
        <button className="btn btn-primary" onClick={save} disabled={saving}>
          {saving ? "Saving…" : "Save schedule"}
        </button>
      </div>

      {error && <div className="alert alert-error">{error}</div>}
      {success && <div className="alert alert-success">{success}</div>}

      <div className="card">
        <div className="flex gap-8 wrap" style={{ marginBottom: 16 }}>
          {DAYS.map((d) => (
            <button
              key={d}
              className={activeDay === d ? "btn btn-primary btn-sm" : "btn btn-outline btn-sm"}
              onClick={() => setActiveDay(d)}
            >
              {DAY_LABELS[d]}
              <span className="mono" style={{ marginLeft: 6, opacity: 0.75 }}>({byDay[d].length})</span>
            </button>
          ))}
        </div>

        {loading ? (
          <div className="empty-state">Loading…</div>
        ) : (
          <>
            <table className="table">
              <thead>
                <tr>
                  <th style={{ width: 50 }}>#</th>
                  <th>Start</th>
                  <th>End</th>
                  <th>Break?</th>
                  <th>Label</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i}>
                    <td className="mono">{i + 1}</td>
                    <td>
                      <input type="time" value={r.startTime} onChange={(e) => updateRow(activeDay, i, "startTime", e.target.value)} />
                    </td>
                    <td>
                      <input type="time" value={r.endTime} onChange={(e) => updateRow(activeDay, i, "endTime", e.target.value)} />
                    </td>
                    <td>
                      <input type="checkbox" checked={r.isBreak} onChange={(e) => updateRow(activeDay, i, "isBreak", e.target.checked)} style={{ width: "auto" }} />
                    </td>
                    <td>
                      <input
                        placeholder={r.isBreak ? "e.g. Lunch" : "optional"}
                        value={r.label}
                        onChange={(e) => updateRow(activeDay, i, "label", e.target.value)}
                      />
                    </td>
                    <td>
                      <button className="btn btn-danger btn-sm" onClick={() => removeRow(activeDay, i)}>
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="flex gap-8" style={{ marginTop: 14 }}>
              <button className="btn btn-outline btn-sm" onClick={() => addRow(activeDay)}>
                + Add period to {DAY_LABELS[activeDay]}
              </button>
              <button className="btn btn-outline btn-sm" onClick={copyToAllDays}>
                Copy {DAY_LABELS[activeDay]}'s schedule to all other days
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
