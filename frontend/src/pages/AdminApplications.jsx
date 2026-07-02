import React, { useEffect, useState } from "react";
import { api } from "../api";

const TABS = [
  { key: "PAID,PENDING_APPROVAL", label: "Awaiting review" },
  { key: "PENDING_PAYMENT", label: "Awaiting payment" },
  { key: "APPROVED", label: "Approved" },
  { key: "REJECTED", label: "Rejected" },
];

const STATUS_STYLE = {
  PENDING_PAYMENT: { background: "#fff6e5", color: "#c9822a" },
  PAID: { background: "#d9f0ea", color: "#0b6a6c" },
  PENDING_APPROVAL: { background: "#d9f0ea", color: "#0b6a6c" },
  APPROVED: { background: "#e6f6ee", color: "#1e8e5a" },
  REJECTED: { background: "#fdecea", color: "#c0392b" },
};

export default function AdminApplications() {
  const [tab, setTab] = useState("PAID");
  const [applications, setApplications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState(null);
  const [credentials, setCredentials] = useState(null); // { school, tempPassword }

  async function load() {
    setLoading(true);
    try {
      const data = await api.get("/applications", { status: tab });
      setApplications(data.applications);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  async function approve(app) {
    setBusyId(app.id);
    setError("");
    try {
      const data = await api.post(`/applications/${app.id}/approve`);
      setCredentials({ school: data.school, admin: data.admin, tempPassword: data.tempPassword });
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId(null);
    }
  }

  async function reject(app) {
    const reason = prompt(`Reject ${app.schoolName}'s application? Optional reason:`);
    if (reason === null) return; // cancelled
    setBusyId(app.id);
    setError("");
    try {
      await api.post(`/applications/${app.id}/reject`, { reason });
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Applications</h1>
          <p>Schools that requested access and paid via Stripe checkout — review and approve here.</p>
        </div>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      <div className="card" style={{ paddingBottom: 8 }}>
        <div className="flex gap-8 wrap">
          {TABS.map((t) => (
            <button key={t.key} className={tab === t.key ? "btn btn-primary btn-sm" : "btn btn-outline btn-sm"} onClick={() => setTab(t.key)}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="card" style={{ padding: 0 }}>
        {loading ? (
          <div className="empty-state">Loading…</div>
        ) : applications.length === 0 ? (
          <div className="empty-state">Nothing here yet.</div>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>School</th>
                <th>Contact</th>
                <th>Submitted</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {applications.map((app) => (
                <tr key={app.id}>
                  <td>
                    <strong>{app.schoolName}</strong>
                    {app.address && <div className="muted" style={{ fontSize: 12 }}>{app.address}</div>}
                  </td>
                  <td>
                    {app.contactName}
                    <div className="muted" style={{ fontSize: 12 }}>{app.contactEmail}{app.contactPhone ? ` · ${app.contactPhone}` : ""}</div>
                  </td>
                  <td className="mono" style={{ fontSize: 12 }}>{new Date(app.createdAt).toLocaleDateString()}</td>
                  <td>
                    <span className="badge" style={STATUS_STYLE[app.status]}>{app.status.replace("_", " ")}</span>
                    {app.status === "REJECTED" && app.rejectionReason && (
                      <div className="muted" style={{ fontSize: 12, marginTop: 4, maxWidth: 200 }}>{app.rejectionReason}</div>
                    )}
                  </td>
                  <td>
                    {["PAID", "PENDING_APPROVAL"].includes(app.status) && (
                      <div className="flex gap-8">
                        <button className="btn btn-primary btn-sm" disabled={busyId === app.id} onClick={() => approve(app)}>
                          {busyId === app.id ? "Approving…" : "Approve"}
                        </button>
                        <button className="btn btn-danger btn-sm" disabled={busyId === app.id} onClick={() => reject(app)}>
                          Reject
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {credentials && (
        <div className="modal-backdrop" onClick={() => setCredentials(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>{credentials.school.name} approved 🎉</h3>
            <p className="muted" style={{ fontSize: 13.5, marginBottom: 14 }}>
              Share these login details with the school now — this password is shown only once and isn't stored anywhere.
            </p>
            <div className="field">
              <label>Login email</label>
              <input readOnly value={credentials.admin.email} />
            </div>
            <div className="field">
              <label>Temporary password</label>
              <input readOnly value={credentials.tempPassword} className="mono" />
            </div>
            <p className="muted" style={{ fontSize: 12 }}>They should change this password after their first login.</p>
            <div className="modal-actions">
              <button className="btn btn-primary btn-sm" onClick={() => setCredentials(null)}>
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
