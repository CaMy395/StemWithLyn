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

  const [showReschedule, setShowReschedule] = useState(false);
  const [reschedAppt, setReschedAppt] = useState(null);
  const [newDate, setNewDate] = useState("");
  const [newTime, setNewTime] = useState("");

  const [rescheduleSlots, setRescheduleSlots] = useState([]);
  const [loadingRescheduleSlots, setLoadingRescheduleSlots] = useState(false);

  const now = useMemo(() => new Date(), []);
  const canUsePortal = loggedInUser && loggedInUser.role !== "admin";

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
        const meRes = await fetch(`${apiUrl}/client/me`, {
          headers: authHeaders,
        });

        if (!meRes.ok) {
          const t = await meRes.text();
          throw new Error(t || "Failed to load client profile.");
        }

        const meData = await meRes.json();
        setClient(meData.client);

        const apptRes = await fetch(`${apiUrl}/client/appointments`, {
          headers: authHeaders,
        });

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
    } else {
      setLoading(false);
    }
  }, [apiUrl, authHeaders, loggedInUser]);

  const fmtDate = (d) => {
    try {
      const dd = String(d).slice(0, 10);
      const dt = new Date(`${dd}T00:00:00`);
      return dt.toLocaleDateString("en-US", {
        weekday: "short",
        month: "short",
        day: "numeric",
        year: "numeric",
      });
    } catch {
      return String(d || "");
    }
  };

  const fmtTime = (t) => {
    try {
      const raw = String(t || "").trim();
      if (!raw) return "";

      const [hours = "0", minutes = "0"] = raw.split(":");
      const dt = new Date();
      dt.setHours(Number(hours), Number(minutes), 0, 0);

      return dt.toLocaleTimeString("en-US", {
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
      });
    } catch {
      return String(t || "").slice(0, 5);
    }
  };

  const normalizeTime = (t) => {
    const s = String(t || "").trim();
    if (!s) return "";
    if (s.length === 5) return `${s}:00`;
    return s;
  };

  const refreshAppointments = async () => {
    try {
      const apptRes = await fetch(`${apiUrl}/client/appointments`, {
        headers: authHeaders,
      });

      if (!apptRes.ok) {
        const t = await apptRes.text();
        throw new Error(t || "Failed to refresh appointments.");
      }

      const apptData = await apptRes.json();
      setAppointments(Array.isArray(apptData) ? apptData : []);
    } catch (e) {
      setErr(e.message || "Failed to refresh appointments.");
    }
  };

  const onCancel = async (appt) => {
    if (!appt?.id) return;

    const ok = window.confirm(
      "Cancel this appointment? This action can only be used once."
    );
    if (!ok) return;

    try {
      setErr("");

      const res = await fetch(
        `${apiUrl}/client/appointments/${appt.id}/cancel`,
        {
          method: "POST",
          headers: authHeaders,
          body: JSON.stringify({}),
        }
      );

      if (!res.ok) {
        const t = await res.text();
        throw new Error(t || "Failed to cancel appointment.");
      }

      await refreshAppointments();
    } catch (e) {
      setErr(e?.message || "Failed to cancel.");
    }
  };

  const fetchRescheduleAvailability = async (appt, selectedDate) => {
    if (!appt?.title || !selectedDate) {
      setRescheduleSlots([]);
      return;
    }

    try {
      setLoadingRescheduleSlots(true);
      setNewTime("");
      setRescheduleSlots([]);

      const weekday = new Date(`${selectedDate}T00:00:00`).toLocaleDateString(
        "en-US",
        { weekday: "long" }
      );

      const availabilityRes = await fetch(
        `${apiUrl}/availability?weekday=${encodeURIComponent(
          weekday
        )}&appointmentType=${encodeURIComponent(appt.title)}`
      );

      if (!availabilityRes.ok) {
        const t = await availabilityRes.text();
        throw new Error(t || "Failed to load available times.");
      }

      const availabilityData = await availabilityRes.json();

      const blockedRes = await fetch(
        `${apiUrl}/blocked-times?date=${encodeURIComponent(selectedDate)}`
      );
      const blockedData = blockedRes.ok ? await blockedRes.json() : { blockedTimes: [] };

      const bookedRes = await fetch(
        `${apiUrl}/appointments/by-date?date=${encodeURIComponent(selectedDate)}`
      );
      const bookedData = bookedRes.ok ? await bookedRes.json() : [];

      const blockedTimes = (blockedData?.blockedTimes || []).map((time) => {
        const raw = String(time || "");
        if (raw.includes("-")) {
          const last = raw.split("-").pop();
          return `${String(last).padStart(2, "0")}:00:00`;
        }
        return normalizeTime(raw);
      });

      const bookedTimes = (Array.isArray(bookedData) ? bookedData : [])
        .filter((a) => Number(a.id) !== Number(appt.id))
        .map((a) => normalizeTime(a.time));

      const unavailable = new Set([...blockedTimes, ...bookedTimes]);

      const slots = (Array.isArray(availabilityData) ? availabilityData : [])
        .map((slot) => ({
          ...slot,
          start_time: normalizeTime(slot.start_time),
          end_time: normalizeTime(slot.end_time),
        }))
        .filter((slot) => slot.start_time && !unavailable.has(slot.start_time))
        .sort((a, b) => {
          const ta = String(a.start_time || "");
          const tb = String(b.start_time || "");
          return ta.localeCompare(tb);
        });

      setRescheduleSlots(slots);
    } catch (e) {
      setErr(e?.message || "Failed to load available times.");
      setRescheduleSlots([]);
    } finally {
      setLoadingRescheduleSlots(false);
    }
  };

  const openReschedule = async (appt) => {
    const dateOnly = String(appt?.date || "").slice(0, 10);
    setReschedAppt(appt);
    setNewDate(dateOnly);
    setNewTime("");
    setShowReschedule(true);
    await fetchRescheduleAvailability(appt, dateOnly);
  };

  const closeReschedule = () => {
    setShowReschedule(false);
    setReschedAppt(null);
    setNewDate("");
    setNewTime("");
    setRescheduleSlots([]);
    setLoadingRescheduleSlots(false);
  };

  const submitReschedule = async () => {
    if (!reschedAppt?.id) return;

    if (!newDate || !newTime) {
      setErr("Please choose one of the available time slots.");
      return;
    }

    try {
      setErr("");

      const res = await fetch(
        `${apiUrl}/client/appointments/${reschedAppt.id}/reschedule`,
        {
          method: "POST",
          headers: authHeaders,
          body: JSON.stringify({
            date: newDate,
            time: String(newTime).slice(0, 5),
          }),
        }
      );

      if (!res.ok) {
        const t = await res.text();
        throw new Error(t || "Failed to reschedule.");
      }

      closeReschedule();
      await refreshAppointments();
    } catch (e) {
      setErr(e?.message || "Failed to reschedule.");
    }
  };

  if (loading) {
    return <div style={{ padding: 20 }}>Loading your portal…</div>;
  }

  if (!loggedInUser) {
    return (
      <div style={{ padding: 20 }}>
        Please log in to view your client portal.
      </div>
    );
  }

  if (!canUsePortal) {
    return <div style={{ padding: 20 }}>Admins do not use the client portal.</div>;
  }

  return (
    <div
      style={{
        padding: 20,
        maxWidth: 1050,
        margin: "0 auto",
      }}
    >
      <h1 style={{ marginBottom: 8 }}>Client Portal</h1>

      {err && (
        <div
          style={{
            background: "#ffe9e9",
            border: "1px solid #ffb3b3",
            padding: 12,
            borderRadius: 10,
            marginBottom: 14,
            color: "#7a0000",
            fontWeight: 600,
          }}
        >
          {err}
        </div>
      )}

      {!client ? (
        <div
          style={{
            background: "#fff",
            padding: 16,
            borderRadius: 12,
            color: "#111",
          }}
        >
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

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 12,
              }}
            >
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

            <div
              style={{
                marginTop: 10,
                color: "#666",
                fontSize: 13,
              }}
            >
              Note: You can cancel or reschedule an appointment <b>once</b>. After
              that, you’ll need to contact support.
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
                      style={{
                        border: "1px solid #eee",
                        borderRadius: 12,
                        padding: 14,
                      }}
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
                          <div
                            style={{
                              fontSize: 16,
                              fontWeight: 700,
                              color: "#111",
                            }}
                          >
                            {a.title || "Appointment"}
                          </div>

                          <div style={{ color: "#555" }}>
                            {fmtDate(a.date)} at {fmtTime(a.time)}
                          </div>

                          {a.end_time && (
                            <div style={{ color: "#777", marginTop: 4 }}>
                              <b>Ends:</b> {fmtTime(a.end_time)}
                            </div>
                          )}

                          {a.location && (
                            <div style={{ color: "#777", marginTop: 4 }}>
                              <b>Location:</b> {a.location}
                            </div>
                          )}

                          {a.description && (
                            <div style={{ color: "#666", marginTop: 6 }}>
                              {a.description}
                            </div>
                          )}
                        </div>

                        <div
                          style={{
                            display: "flex",
                            gap: 10,
                            alignItems: "center",
                            flexWrap: "wrap",
                          }}
                        >
                          <button
                            onClick={() => openReschedule(a)}
                            disabled={reschedUsed}
                            style={{
                              padding: "10px 14px",
                              borderRadius: 10,
                              border: "1px solid #ddd",
                              background: reschedUsed ? "#f3f3f3" : "#fff",
                              color: reschedUsed ? "#888" : "#111",
                              cursor: reschedUsed ? "not-allowed" : "pointer",
                              fontWeight: 600,
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
                              color: cancelUsed ? "#888" : "#7a0000",
                              cursor: cancelUsed ? "not-allowed" : "pointer",
                              fontWeight: 600,
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
                    style={{
                      border: "1px solid #eee",
                      borderRadius: 12,
                      padding: 12,
                    }}
                  >
                    <div
                      style={{
                        fontWeight: 700,
                        color: "#111",
                      }}
                    >
                      {a.title || "Appointment"}
                    </div>

                    <div style={{ color: "#555" }}>
                      {fmtDate(a.date)} at {fmtTime(a.time)}
                    </div>

                    {a.end_time && (
                      <div style={{ color: "#777", marginTop: 4 }}>
                        <b>Ended:</b> {fmtTime(a.end_time)}
                      </div>
                    )}

                    {a.description && (
                      <div style={{ color: "#666", marginTop: 6 }}>
                        {a.description}
                      </div>
                    )}
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
          onClick={closeReschedule}
        >
          <div
            style={{
              width: "min(560px, 100%)",
              background: "#fff",
              borderRadius: 16,
              padding: 18,
              boxShadow: "0 12px 34px rgba(0,0,0,0.18)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ marginTop: 0, color: "#111" }}>Reschedule Appointment</h3>

            {reschedAppt && (
              <div
                style={{
                  marginBottom: 14,
                  padding: 12,
                  borderRadius: 10,
                  background: "#f8f8f8",
                  border: "1px solid #eee",
                  color: "#111",
                }}
              >
                <div style={{ fontWeight: 700 }}>
                  {reschedAppt.title || "Appointment"}
                </div>
                <div style={{ color: "#555", marginTop: 4 }}>
                  Current: {fmtDate(reschedAppt.date)} at {fmtTime(reschedAppt.time)}
                </div>
              </div>
            )}

            <label
              style={{
                display: "grid",
                gap: 6,
                color: "#111",
                fontWeight: 600,
                marginBottom: 14,
              }}
            >
              New Date
              <input
                type="date"
                value={newDate}
                onChange={async (e) => {
                  const value = e.target.value;
                  setNewDate(value);
                  await fetchRescheduleAvailability(reschedAppt, value);
                }}
                style={{
                  padding: 10,
                  borderRadius: 10,
                  border: "1px solid #ddd",
                  background: "#fff",
                  color: "#111",
                }}
              />
            </label>

            <div style={{ marginBottom: 8, color: "#111", fontWeight: 600 }}>
              Available Time Slots
            </div>

            {loadingRescheduleSlots ? (
              <div style={{ color: "#666", marginBottom: 14 }}>
                Loading available times…
              </div>
            ) : rescheduleSlots.length === 0 ? (
              <div
                style={{
                  color: "#7a0000",
                  background: "#fff4f4",
                  border: "1px solid #ffd2d2",
                  borderRadius: 10,
                  padding: 12,
                  marginBottom: 14,
                }}
              >
                No available time slots for that date.
              </div>
            ) : (
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))",
                  gap: 10,
                  marginBottom: 14,
                }}
              >
                {rescheduleSlots.map((slot) => {
                  const slotTime = String(slot.start_time).slice(0, 5);
                  const selected = String(newTime).slice(0, 5) === slotTime;

                  return (
                    <button
                      key={`${newDate}-${slot.start_time}-${slot.end_time}`}
                      type="button"
                      onClick={() => setNewTime(slotTime)}
                      style={{
                        padding: "10px 12px",
                        borderRadius: 10,
                        border: selected ? "2px solid #222" : "1px solid #ddd",
                        background: selected ? "#222" : "#fff",
                        color: selected ? "#fff" : "#111",
                        fontWeight: 600,
                        cursor: "pointer",
                      }}
                    >
                      {fmtTime(slot.start_time)}
                    </button>
                  );
                })}
              </div>
            )}

            {newTime && (
              <div
                style={{
                  fontSize: 13,
                  color: "#555",
                  marginBottom: 8,
                }}
              >
                Selected time: <b>{fmtTime(newTime)}</b>
              </div>
            )}

            <div
              style={{
                display: "flex",
                justifyContent: "flex-end",
                gap: 10,
                marginTop: 16,
                flexWrap: "wrap",
              }}
            >
              <button
                onClick={closeReschedule}
                style={{
                  padding: "10px 14px",
                  borderRadius: 10,
                  border: "1px solid #ddd",
                  background: "#fff",
                  color: "#111",
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                Close
              </button>

              <button
                onClick={submitReschedule}
                disabled={!newDate || !newTime}
                style={{
                  padding: "10px 14px",
                  borderRadius: 10,
                  border: "1px solid #222",
                  background: !newDate || !newTime ? "#bbb" : "#222",
                  color: "#fff",
                  fontWeight: 600,
                  cursor: !newDate || !newTime ? "not-allowed" : "pointer",
                }}
              >
                Confirm Reschedule
              </button>
            </div>

            <div
              style={{
                marginTop: 10,
                fontSize: 12,
                color: "#666",
              }}
            >
              Reminder: rescheduling is allowed <b>once</b>. If you already used
              it, you’ll need to contact support.
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ClientPortalPage;