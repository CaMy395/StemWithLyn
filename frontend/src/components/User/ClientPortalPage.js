import React, { useEffect, useMemo, useState } from "react";

const ClientPortalPage = () => {
  const apiUrl = process.env.REACT_APP_API_URL || "http://localhost:3001";

  const loggedInUser = useMemo(() => {
    try {
      return JSON.parse(localStorage.getItem("loggedInUser"));
    } catch {
      return null;
    }
  }, []);

  const authHeaders = useMemo(() => {
    return {
      "Content-Type": "application/json",
      "x-user-id": loggedInUser?.id ? String(loggedInUser.id) : "",
      "x-username": loggedInUser?.username || "",
    };
  }, [loggedInUser]);

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  const [client, setClient] = useState(null);
  const [appointments, setAppointments] = useState([]);

  // reschedule modal state
  const [showReschedule, setShowReschedule] = useState(false);
  const [reschedAppt, setReschedAppt] = useState(null);
  const [newDate, setNewDate] = useState("");
  const [newTime, setNewTime] = useState("");

  // ✅ Allow portal access for these roles
  const canUsePortal = loggedInUser && loggedInUser.role !== "admin";


  const now = useMemo(() => new Date(), []);

  const upcoming = useMemo(() => {
    return appointments
      .filter((a) => {
        const d = a?.date ? String(a.date).slice(0, 10) : "";
        const t = a?.time ? String(a.time).slice(0, 5) : "00:00";
        if (!d) return false;
        const dt = new Date(`${d}T${t}:00`);
        return dt >= now;
      })
      .sort((a, b) => {
        const da = new Date(
          `${String(a.date).slice(0, 10)}T${String(a.time).slice(0, 5)}:00`
        );
        const db = new Date(
          `${String(b.date).slice(0, 10)}T${String(b.time).slice(0, 5)}:00`
        );
        return da - db;
      });
  }, [appointments, now]);

  const past = useMemo(() => {
    return appointments
      .filter((a) => {
        const d = a?.date ? String(a.date).slice(0, 10) : "";
        const t = a?.time ? String(a.time).slice(0, 5) : "00:00";
        if (!d) return false;
        const dt = new Date(`${d}T${t}:00`);
        return dt < now;
      })
      .sort((a, b) => {
        const da = new Date(
          `${String(a.date).slice(0, 10)}T${String(a.time).slice(0, 5)}:00`
        );
        const db = new Date(
          `${String(b.date).slice(0, 10)}T${String(b.time).slice(0, 5)}:00`
        );
        return db - da;
      });
  }, [appointments, now]);

useEffect(() => {
  const load = async () => {
    setLoading(true);
    setErr("");

    try {
      const meRes = await fetch(`${apiUrl}/client/me`, { headers: authHeaders });
      if (!meRes.ok) {
        const t = await meRes.text();
        throw new Error(t || "Failed to load client profile.");
      }

      const meData = await meRes.json();
      setClient(meData.client);

      const apptRes = await fetch(`${apiUrl}/client/appointments`, { headers: authHeaders });
      if (!apptRes.ok) {
        const t = await apptRes.text();
        throw new Error(t || "Failed to load appointments.");
      }

      const apptData = await apptRes.json();
      setAppointments(Array.isArray(apptData) ? apptData : []);
    } catch (e) {
      setErr(e.message || "Something went wrong.");
    } finally {
      setLoading(false);
    }
  };

  if (loggedInUser) {
    load();
  }
}, [apiUrl, authHeaders, loggedInUser]);


  const fmtDate = (d) => {
    try {
      const dd = String(d).slice(0, 10);
      const dt = new Date(`${dd}T00:00:00`);
      return dt.toLocaleDateString();
    } catch {
      return String(d || "");
    }
  };

  const fmtTime = (t) => String(t || "").slice(0, 5);

  const refreshAppointments = async () => {
    const apptRes = await fetch(`${apiUrl}/client/appointments`, { headers: authHeaders });
    if (!apptRes.ok) return;
    const apptData = await apptRes.json();
    setAppointments(Array.isArray(apptData) ? apptData : []);
  };

  const onCancel = async (appt) => {
    if (!appt?.id) return;

    const ok = window.confirm("Cancel this appointment? This action can only be used once.");
    if (!ok) return;

    try {
      setErr("");
      const res = await fetch(`${apiUrl}/client/appointments/${appt.id}/cancel`, {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify({}),
      });

      if (!res.ok) {
        const t = await res.text();
        throw new Error(t || "Failed to cancel appointment.");
      }

      await refreshAppointments();
    } catch (e) {
      setErr(e?.message || "Failed to cancel.");
    }
  };

  const openReschedule = (appt) => {
    setReschedAppt(appt);
    setNewDate(String(appt?.date || "").slice(0, 10));
    setNewTime(String(appt?.time || "").slice(0, 5));
    setShowReschedule(true);
  };

  const submitReschedule = async () => {
    if (!reschedAppt?.id) return;

    if (!newDate || !newTime) {
      setErr("Please choose a new date and time.");
      return;
    }

    try {
      setErr("");
      const res = await fetch(`${apiUrl}/client/appointments/${reschedAppt.id}/reschedule`, {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify({ date: newDate, time: newTime }),
      });

      if (!res.ok) {
        const t = await res.text();
        throw new Error(t || "Failed to reschedule.");
      }

      setShowReschedule(false);
      setReschedAppt(null);
      await refreshAppointments();
    } catch (e) {
      setErr(e?.message || "Failed to reschedule.");
    }
  };

if (loading) {
  return <div style={{ padding: 20 }}>Loading your portal…</div>;
}

if (!loggedInUser) {
  return <div style={{ padding: 20 }}>Please log in to view your client portal.</div>;
}

  return (
    <div style={{ padding: 20, maxWidth: 1050, margin: "0 auto" }}>
      <h1 style={{ marginBottom: 8 }}>Client Portal</h1>

      {err && (
        <div
          style={{
            background: "#ffe9e9",
            border: "1px solid #ffb3b3",
            padding: 12,
            borderRadius: 10,
            marginBottom: 14,
          }}
        >
          {err}
        </div>
      )}

      {!client ? (
        <div style={{ background: "#fff", padding: 16, borderRadius: 12 }}>
          Your client profile isn’t linked yet. Please contact support.
        </div>
      ) : (
        <>
          <div
            style={{
              background: "#fff",
              padding: 18,
              borderRadius: 14,
              marginBottom: 18,
              boxShadow: "0 6px 18px rgba(0,0,0,0.06)",
            }}
          >
            <h2 style={{ marginTop: 0, marginBottom: 10 }}>Profile</h2>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div>
                <b>Name:</b> {client.full_name}
              </div>
              <div>
                <b>Email:</b> {client.email || "—"}
              </div>
              <div>
                <b>Phone:</b> {client.phone || "—"}
              </div>
              <div>
                <b>Category:</b> {client.category || "—"}
              </div>
            </div>
            <div style={{ marginTop: 10, color: "#666", fontSize: 13 }}>
              Note: You can cancel or reschedule an appointment <b>once</b>. After that, you’ll need to contact support.
            </div>
          </div>

          <div
            style={{
              background: "#fff",
              padding: 18,
              borderRadius: 14,
              marginBottom: 18,
              boxShadow: "0 6px 18px rgba(0,0,0,0.06)",
            }}
          >
            <h2 style={{ marginTop: 0 }}>Upcoming Appointments</h2>

            {upcoming.length === 0 ? (
              <div style={{ color: "#666" }}>No upcoming appointments.</div>
            ) : (
              <div style={{ display: "grid", gap: 12 }}>
                {upcoming.map((a) => {
                  const cancelUsed = (a.client_cancel_count || 0) >= 1;
                  const reschedUsed = (a.client_reschedule_count || 0) >= 1;

                  return (
                    <div
                      key={a.id}
                      style={{ border: "1px solid #eee", borderRadius: 12, padding: 14 }}
                    >
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          gap: 10,
                          flexWrap: "wrap",
                        }}
                      >
                        <div>
                          <div style={{ fontSize: 16, fontWeight: 700 }}>
                            {a.title || "Appointment"}
                          </div>
                          <div style={{ color: "#555" }}>
                            {fmtDate(a.date)} @ {fmtTime(a.time)}
                          </div>
                          {a.location && (
                            <div style={{ color: "#777" }}>
                              <b>Location:</b> {a.location}
                            </div>
                          )}
                        </div>

                        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                          <button
                            onClick={() => openReschedule(a)}
                            disabled={reschedUsed}
                            style={{
                              padding: "10px 14px",
                              borderRadius: 10,
                              border: "1px solid #ddd",
                              background: reschedUsed ? "#f3f3f3" : "#fff",
                              cursor: reschedUsed ? "not-allowed" : "pointer",
                            }}
                            title={reschedUsed ? "Reschedule already used" : "Reschedule"}
                          >
                            Reschedule {reschedUsed ? "(used)" : ""}
                          </button>

                          <button
                            onClick={() => onCancel(a)}
                            disabled={cancelUsed}
                            style={{
                              padding: "10px 14px",
                              borderRadius: 10,
                              border: "1px solid #ffb3b3",
                              background: cancelUsed ? "#f3f3f3" : "#ffe9e9",
                              cursor: cancelUsed ? "not-allowed" : "pointer",
                            }}
                            title={cancelUsed ? "Cancel already used" : "Cancel"}
                          >
                            Cancel {cancelUsed ? "(used)" : ""}
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div
            style={{
              background: "#fff",
              padding: 18,
              borderRadius: 14,
              boxShadow: "0 6px 18px rgba(0,0,0,0.06)",
            }}
          >
            <h2 style={{ marginTop: 0 }}>Appointment History</h2>

            {past.length === 0 ? (
              <div style={{ color: "#666" }}>No past appointments yet.</div>
            ) : (
              <div style={{ display: "grid", gap: 10 }}>
                {past.map((a) => (
                  <div
                    key={a.id}
                    style={{ border: "1px solid #eee", borderRadius: 12, padding: 12 }}
                  >
                    <div style={{ fontWeight: 700 }}>{a.title || "Appointment"}</div>
                    <div style={{ color: "#555" }}>
                      {fmtDate(a.date)} @ {fmtTime(a.time)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {showReschedule && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.35)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 18,
            zIndex: 9999,
          }}
          onClick={() => setShowReschedule(false)}
        >
          <div
            style={{
              width: "min(520px, 100%)",
              background: "#fff",
              borderRadius: 16,
              padding: 18,
              boxShadow: "0 12px 34px rgba(0,0,0,0.18)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ marginTop: 0 }}>Reschedule Appointment</h3>

            <div style={{ display: "grid", gap: 10 }}>
              <label style={{ display: "grid", gap: 6 }}>
                New Date
                <input
                  type="date"
                  value={newDate}
                  onChange={(e) => setNewDate(e.target.value)}
                  style={{ padding: 10, borderRadius: 10, border: "1px solid #ddd" }}
                />
              </label>

              <label style={{ display: "grid", gap: 6 }}>
                New Time
                <input
                  type="time"
                  value={newTime}
                  onChange={(e) => setNewTime(e.target.value)}
                  style={{ padding: 10, borderRadius: 10, border: "1px solid #ddd" }}
                />
              </label>
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 16 }}>
              <button
                onClick={() => setShowReschedule(false)}
                style={{
                  padding: "10px 14px",
                  borderRadius: 10,
                  border: "1px solid #ddd",
                  background: "#fff",
                }}
              >
                Close
              </button>

              <button
                onClick={submitReschedule}
                style={{
                  padding: "10px 14px",
                  borderRadius: 10,
                  border: "1px solid #222",
                  background: "#222",
                  color: "#fff",
                }}
              >
                Confirm Reschedule
              </button>
            </div>

            <div style={{ marginTop: 10, fontSize: 12, color: "#666" }}>
              Reminder: rescheduling is allowed <b>once</b>. If you already used it, you’ll need to contact support.
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ClientPortalPage;
