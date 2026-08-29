import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { FaCalendarAlt, FaClock, FaPlus, FaUser } from "react-icons/fa";
import "../../ClientPortalPage.css";

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

  const nextAppointment = upcoming[0] || null;

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
      const blockedData = blockedRes.ok
        ? await blockedRes.json()
        : { blockedTimes: [] };

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
    return (
      <div className="portal-page">
        <div className="portal-shell">
          <h1>Loading your portal…</h1>
        </div>
      </div>
    );
  }

  if (!loggedInUser) {
    return (
      <div className="portal-page">
        <div className="portal-shell">
          <h1>Please log in to view your client portal.</h1>
        </div>
      </div>
    );
  }

  if (!canUsePortal) {
    return (
      <div className="portal-page">
        <div className="portal-shell">
          <h1>Admins do not use the client portal.</h1>
        </div>
      </div>
    );
  }

  return (
    <div className="portal-page">
      <div className="portal-shell">
        <section className="portal-hero">
          <div>
            <span className="portal-pill">STEM with Lyn Portal</span>
            <h1>Welcome back{client?.full_name ? `, ${client.full_name}` : ""}</h1>
            <p>
              Keep track of tutoring sessions and manage your learning schedule.
            </p>
            <Link className="portal-book-cta" to="/client-portal/schedule"><FaPlus /> Book an appointment</Link>
          </div>

          <div className="portal-next-session">
            <span>NEXT SESSION</span>
            {nextAppointment ? <><strong>{fmtDate(nextAppointment.date)}</strong><p><FaClock /> {fmtTime(nextAppointment.time)}</p><small>{nextAppointment.title}</small></> : <><strong>No session booked</strong><p>Your calendar is clear.</p></>}
          </div>
        </section>

        <section className="portal-stats"><article><FaCalendarAlt /><div><strong>{upcoming.length}</strong><span>Upcoming</span></div></article><article><FaClock /><div><strong>{past.length}</strong><span>Completed</span></div></article><article><FaUser /><div><strong>{client?.category || "STEM"}</strong><span>Program</span></div></article></section>

        {err && <div className="portal-error">{err}</div>}

        {!client ? (
          <div className="portal-card">
            <h2>Profile Not Linked</h2>
            <p>Your client profile isn’t linked yet. Please contact support.</p>
          </div>
        ) : (
          <>
            <section className="portal-card profile-card">
              <div className="section-header">
                <h2>Profile</h2>
                <span>Student / Client Details</span>
              </div>

              <div className="profile-grid">
                <div>
                  <small>Name</small>
                  <strong>{client.full_name || "—"}</strong>
                </div>

                <div>
                  <small>Email</small>
                  <strong>{client.email || "—"}</strong>
                </div>

                <div>
                  <small>Phone</small>
                  <strong>{client.phone || "—"}</strong>
                </div>

                <div>
                  <small>Category</small>
                  <strong>{client.category || "—"}</strong>
                </div>
              </div>

              <p className="portal-note">
                You can cancel or reschedule an appointment <b>once</b>. After
                that, please contact STEM with Lyn directly.
              </p>
            </section>

            <section className="portal-card">
              <div className="section-header">
                <h2>Upcoming Appointments</h2>
                <span>{upcoming.length} scheduled</span>
              </div>

              {upcoming.length === 0 ? (
                <div className="empty-state">
                  <h3>No upcoming appointments.</h3>
                  <p>Book a session from the scheduling page when you are ready.</p>
                </div>
              ) : (
                <div className="appointment-list">
                  {upcoming.map((a) => {
                    const cancelUsed = (a.client_cancel_count || 0) >= 1;
                    const reschedUsed = (a.client_reschedule_count || 0) >= 1;

                    return (
                      <div key={a.id} className="appointment-card-portal">
                        <div className="appt-main">
                          <span className="appt-badge">Upcoming</span>
                          <h3>{a.title || "Appointment"}</h3>

                          <p>
                            {fmtDate(a.date)} at {fmtTime(a.time)}
                          </p>

                          {a.end_time && (
                            <p>
                              <b>Ends:</b> {fmtTime(a.end_time)}
                            </p>
                          )}

                          {a.location && (
                            <p>
                              <b>Location:</b> {a.location}
                            </p>
                          )}

                          {a.description && <p>{a.description}</p>}
                        </div>

                        <div className="appt-actions">
                          <button
                            onClick={() => openReschedule(a)}
                            disabled={reschedUsed}
                            className="portal-btn secondary"
                            title={
                              reschedUsed
                                ? "Reschedule already used"
                                : "Reschedule"
                            }
                          >
                            Reschedule {reschedUsed ? "(used)" : ""}
                          </button>

                          <button
                            onClick={() => onCancel(a)}
                            disabled={cancelUsed}
                            className="portal-btn danger"
                            title={cancelUsed ? "Cancel already used" : "Cancel"}
                          >
                            Cancel {cancelUsed ? "(used)" : ""}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>

            <section className="portal-card">
              <div className="section-header">
                <h2>Appointment History</h2>
                <span>{past.length} past</span>
              </div>

              {past.length === 0 ? (
                <div className="empty-state">
                  <h3>No past appointments yet.</h3>
                  <p>Your completed tutoring sessions will show here.</p>
                </div>
              ) : (
                <div className="appointment-list">
                  {past.map((a) => (
                    <div key={a.id} className="appointment-card-portal past">
                      <div className="appt-main">
                        <span className="appt-badge muted">Completed</span>
                        <h3>{a.title || "Appointment"}</h3>

                        <p>
                          {fmtDate(a.date)} at {fmtTime(a.time)}
                        </p>

                        {a.end_time && (
                          <p>
                            <b>Ended:</b> {fmtTime(a.end_time)}
                          </p>
                        )}

                        {a.description && <p>{a.description}</p>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </>
        )}

        {showReschedule && (
          <div className="portal-modal-backdrop" onClick={closeReschedule}>
            <div
              className="portal-modal"
              onClick={(e) => e.stopPropagation()}
            >
              <h3>Reschedule Appointment</h3>

              {reschedAppt && (
                <div className="modal-current-appt">
                  <strong>{reschedAppt.title || "Appointment"}</strong>
                  <p>
                    Current: {fmtDate(reschedAppt.date)} at{" "}
                    {fmtTime(reschedAppt.time)}
                  </p>
                </div>
              )}

              <label className="portal-modal-label">
                New Date
                <input
                  type="date"
                  value={newDate}
                  onChange={async (e) => {
                    const value = e.target.value;
                    setNewDate(value);
                    await fetchRescheduleAvailability(reschedAppt, value);
                  }}
                />
              </label>

              <div className="modal-slot-title">Available Time Slots</div>

              {loadingRescheduleSlots ? (
                <div className="modal-message">Loading available times…</div>
              ) : rescheduleSlots.length === 0 ? (
                <div className="modal-warning">
                  No available time slots for that date.
                </div>
              ) : (
                <div className="modal-slot-grid">
                  {rescheduleSlots.map((slot) => {
                    const slotTime = String(slot.start_time).slice(0, 5);
                    const selected = String(newTime).slice(0, 5) === slotTime;

                    return (
                      <button
                        key={`${newDate}-${slot.start_time}-${slot.end_time}`}
                        type="button"
                        onClick={() => setNewTime(slotTime)}
                        className={selected ? "slot-choice selected" : "slot-choice"}
                      >
                        {fmtTime(slot.start_time)}
                      </button>
                    );
                  })}
                </div>
              )}

              {newTime && (
                <p className="selected-time">
                  Selected time: <b>{fmtTime(newTime)}</b>
                </p>
              )}

              <div className="modal-actions">
                <button onClick={closeReschedule} className="portal-btn secondary">
                  Close
                </button>

                <button
                  onClick={submitReschedule}
                  disabled={!newDate || !newTime}
                  className="portal-btn primary"
                >
                  Confirm Reschedule
                </button>
              </div>

              <p className="modal-note">
                Reminder: rescheduling is allowed <b>once</b>. If you already
                used it, you’ll need to contact support.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ClientPortalPage;
