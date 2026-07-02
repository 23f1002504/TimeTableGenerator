import React, { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api } from "../api";

export default function ApplySuccess() {
  const [searchParams] = useSearchParams();
  const sessionId = searchParams.get("session_id");

  const [application, setApplication] = useState(null);
  const [error, setError] = useState("");
  const [attempts, setAttempts] = useState(0);

  useEffect(() => {
    if (!sessionId) {
      setError("Missing session reference — if you completed payment, contact us and we'll sort it out.");
      return;
    }
    let cancelled = false;

    async function poll() {
      try {
        const data = await api.get(`/applications/status/${sessionId}`);
        if (cancelled) return;
        setApplication(data.application);
        // Stripe's webhook usually lands within a couple of seconds; keep
        // polling a few times in case it hasn't arrived yet.
        if (data.application.status === "PENDING_PAYMENT" && attempts < 10) {
          setTimeout(() => setAttempts((a) => a + 1), 1500);
        }
      } catch (err) {
        if (!cancelled) setError(err.message);
      }
    }
    poll();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, attempts]);

  return (
    <div className="login-screen">
      <div className="login-hero">
        <span className="brand-mark" style={{ width: "fit-content" }}>
          TT
        </span>
        <h1 style={{ marginTop: 18 }}>Almost there.</h1>
        <p>We just need a moment to confirm your payment with Stripe.</p>
      </div>

      <div className="login-panel">
        <div className="login-box">
          {error && <div className="alert alert-error">{error}</div>}

          {!error && !application && <p className="sub">Confirming payment…</p>}

          {application && application.status === "PENDING_PAYMENT" && (
            <>
              <h2>Confirming payment…</h2>
              <p className="sub">This usually takes a few seconds. Hang tight.</p>
            </>
          )}

          {application && application.status !== "PENDING_PAYMENT" && (
            <>
              <h2>Payment received 🎉</h2>
              <p className="sub">
                Thanks — <strong>{application.schoolName}</strong>'s application is now in our review
                queue. You'll receive your login details by email or phone once it's approved.
              </p>
              <Link to="/login" className="btn btn-outline" style={{ width: "100%", justifyContent: "center", marginTop: 10 }}>
                Back to sign in
              </Link>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
