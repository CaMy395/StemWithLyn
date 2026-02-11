import React, { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";

export default function PaymentSuccess() {
  const [status, setStatus] = useState("finalizing"); // finalizing | success | error
  const [error, setError] = useState("");
  const [appointment, setAppointment] = useState(null);

  const hasFinalizedRef = useRef(false);

  const apiUrl = process.env.REACT_APP_API_URL || "http://localhost:3001";

  const getPortalHome = () => {
    const role =
      localStorage.getItem("userRole") ||
      localStorage.getItem("role") ||
      (JSON.parse(localStorage.getItem("loggedInUser") || "null")?.role ?? null);

    if (role && role !== "admin") return "/client-portal";
    return "/";
  };

  useEffect(() => {
    // ✅ prevents double-fire (React StrictMode / dev)
    if (hasFinalizedRef.current) return;
    hasFinalizedRef.current = true;

    const finalize = async () => {
      try {
        const stored = localStorage.getItem("pendingAppointment");
        if (!stored) throw new Error("Missing booking details. Please book again.");

        const appointmentData = JSON.parse(stored);

        // ✅ Create appointment ONLY AFTER payment (your logic)
        const res = await fetch(`${apiUrl}/appointments`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...appointmentData,
            paid: true,
            amount_paid: appointmentData.price,
          }),
        });

        if (!res.ok) {
          const t = await res.text();
          throw new Error(t || "Failed to create appointment.");
        }

        const data = await res.json();
        setAppointment(data.appointment || data);

        localStorage.removeItem("pendingAppointment");
        setStatus("success");
      } catch (err) {
        setError(err?.message || "Failed to finalize booking.");
        setStatus("error");
      }
    };

    finalize();
  }, [apiUrl]);

  const formatDate = (dateStr) => {
    if (!dateStr) return "";
    const d = new Date(dateStr);
    return d.toLocaleDateString("en-US", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  };

  const formatTime = (timeStr) => {
    if (!timeStr) return "";
    const [h, m] = String(timeStr).split(":");
    const d = new Date();
    d.setHours(Number(h), Number(m || 0));
    return d.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
  };

  const container = {
    minHeight: "70vh",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "28px 16px",
  };

  const card = {
    width: "100%",
    maxWidth: 720,
    borderRadius: 16,
    background: "#ffffff",
    border: "1px solid rgba(0,0,0,0.08)",
    boxShadow: "0 10px 25px rgba(0,0,0,0.06)",
    overflow: "hidden",
  };

  const header = (bg) => ({
    padding: "18px 20px",
    background: bg,
    borderBottom: "1px solid rgba(0,0,0,0.08)",
  });

  const body = {
    padding: "18px 20px 22px",
  };

  const title = {
    margin: 0,
    fontSize: 22,
    fontWeight: 800,
    letterSpacing: "-0.2px",
  };

  const sub = {
    marginTop: 6,
    marginBottom: 0,
    opacity: 0.9,
    fontSize: 14,
    lineHeight: 1.4,
  };

  const row = {
    display: "flex",
    justifyContent: "space-between",
    gap: 12,
    padding: "10px 0",
    borderBottom: "1px solid rgba(0,0,0,0.06)",
    fontSize: 14,
  };

  const label = { opacity: 0.75 };
  const value = { fontWeight: 700, textAlign: "right" };

  const btnRow = {
    display: "flex",
    gap: 10,
    justifyContent: "flex-end",
    marginTop: 16,
    flexWrap: "wrap",
  };

  const btn = {
    display: "inline-block",
    padding: "10px 14px",
    borderRadius: 10,
    border: "1px solid rgba(0,0,0,0.12)",
    textDecoration: "none",
    fontWeight: 700,
    fontSize: 14,
  };

  const primaryBtn = {
    ...btn,
    background: "#111827",
    color: "#fff",
    borderColor: "#111827",
  };

  const secondaryBtn = {
    ...btn,
    background: "#fff",
    color: "#111827",
  };

  const portalHome = getPortalHome();

  return (
    <div style={container}>
      <div style={card}>
        {/* FINALIZING */}
        {status === "finalizing" && (
          <>
            <div style={header("#fff7ed")}>
              <h2 style={title}>Finalizing your booking…</h2>
              <p style={sub}>Please don’t close this tab while we confirm everything.</p>
            </div>
            <div style={body}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div
                  style={{
                    width: 10,
                    height: 10,
                    borderRadius: 999,
                    background: "#f59e0b",
                  }}
                />
                <p style={{ margin: 0, fontSize: 14, opacity: 0.85 }}>
                  This usually takes a few seconds.
                </p>
              </div>
            </div>
          </>
        )}

        {/* ERROR */}
        {status === "error" && (
          <>
            <div style={header("#fef2f2")}>
              <h2 style={title}>We hit a snag</h2>
              <p style={sub}>Your payment may have gone through, but the booking didn’t finalize.</p>
            </div>
            <div style={body}>
              <div
                style={{
                  background: "#fff",
                  border: "1px solid rgba(220,38,38,0.2)",
                  borderRadius: 12,
                  padding: 12,
                  color: "#991b1b",
                  fontSize: 14,
                  lineHeight: 1.4,
                }}
              >
                {error}
              </div>

              <div style={btnRow}>
                <Link to="/client-scheduling" style={secondaryBtn}>
                  Back to scheduling
                </Link>
                <Link to={portalHome} style={primaryBtn}>
                  Back to portal
                </Link>
              </div>
            </div>
          </>
        )}

        {/* SUCCESS */}
        {status === "success" && appointment && (
          <>
            <div style={header("#ecfdf5")}>
              <h2 style={title}>Appointment confirmed ✅</h2>
              <p style={sub}>You’re all set. We saved your booking and recorded your payment.</p>
            </div>

            <div style={body}>
              <div style={row}>
                <span style={label}>Service</span>
                <span style={value}>{appointment.title}</span>
              </div>

              <div style={row}>
                <span style={label}>Date</span>
                <span style={value}>{formatDate(appointment.date)}</span>
              </div>

              <div style={row}>
                <span style={label}>Time</span>
                <span style={value}>{formatTime(appointment.time)}</span>
              </div>

              <div style={{ ...row, borderBottom: "none" }}>
                <span style={label}>Payment</span>
                <span style={value}>Received</span>
              </div>

              <div style={btnRow}>
                <Link to="/client-scheduling" style={secondaryBtn}>
                  Book another
                </Link>
                <Link to={portalHome} style={primaryBtn}>
                  Back to portal
                </Link>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
