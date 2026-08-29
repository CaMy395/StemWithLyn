import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import axios from "axios";
import Calendar from "react-calendar";
import "react-calendar/dist/Calendar.css";
import "../../ClientSchedulingPage.css";
import appointmentTypes from "../../data/appointmentTypes.json";

const toDateKey = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
const normalizeTime = (time) => { const value = String(time || "").trim(); return value && value.length === 5 ? `${value}:00` : value; };
const timeKey = (time) => normalizeTime(time).slice(0, 5);
const formatTime = (time) => { const [hours, minutes] = timeKey(time).split(":"); const date = new Date(); date.setHours(Number(hours || 0), Number(minutes || 0), 0, 0); return date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true }); };
const formatDate = (date) => date.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
const getServiceMeta = (service) => ({ duration: service.title.match(/\((30 min|1 hour)/i)?.[1] || "Session", price: Number(service.price) > 0 ? `$${Number(service.price).toFixed(0)}` : "Included" });

const ClientSchedulingPage = ({ portalMode = false }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const apiUrl = process.env.REACT_APP_API_URL || "http://localhost:3001";
  const isPortal = portalMode || location.pathname.startsWith("/client-portal");
  const loggedInUser = useMemo(() => { try { return JSON.parse(localStorage.getItem("loggedInUser") || "null"); } catch { return null; } }, []);
  const clientAuthHeaders = useMemo(() => { const id = loggedInUser?.id || localStorage.getItem("userId"); const username = loggedInUser?.username || localStorage.getItem("username"); return { ...(id ? { "x-user-id": String(id) } : {}), ...(username ? { "x-username": String(username) } : {}) }; }, [loggedInUser]);
  const today = useMemo(() => { const date = new Date(); date.setHours(0, 0, 0, 0); return date; }, []);

  const [selectedDate, setSelectedDate] = useState(today);
  const [selectedAppointmentType, setSelectedAppointmentType] = useState("");
  const [selectedSlot, setSelectedSlot] = useState(null);
  const [availableSlots, setAvailableSlots] = useState([]);
  const [clientId, setClientId] = useState(null);
  const [clientName, setClientName] = useState("");
  const [clientEmail, setClientEmail] = useState("");
  const [clientPhone, setClientPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [profileLoading, setProfileLoading] = useState(isPortal);
  const [profileErr, setProfileErr] = useState("");
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [slotsErr, setSlotsErr] = useState("");
  const [formErr, setFormErr] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const selectedService = useMemo(() => appointmentTypes.find((item) => item.title === selectedAppointmentType), [selectedAppointmentType]);
  const serviceMeta = selectedService ? getServiceMeta(selectedService) : null;
  const categories = useMemo(() => [...new Set(appointmentTypes.map((item) => item.category))], []);

  useEffect(() => {
    if (!isPortal) return;
    const loadProfile = async () => {
      setProfileLoading(true); setProfileErr("");
      try {
        if (!clientAuthHeaders["x-user-id"] && !clientAuthHeaders["x-username"]) throw new Error("Your session has expired. Please log in again.");
        const { data } = await axios.get(`${apiUrl}/client/me`, { headers: clientAuthHeaders });
        const client = data?.client; const user = data?.user;
        if (!client && !user) throw new Error("We could not load your profile.");
        setClientId(client?.id || null);
        setClientName(client?.full_name || user?.name || user?.username || loggedInUser?.username || "");
        setClientEmail(client?.email || user?.email || loggedInUser?.email || "");
        setClientPhone(client?.phone || user?.phone || loggedInUser?.phone || "");
      } catch (error) { setProfileErr(error?.response?.data?.error || error.message || "We could not load your profile."); }
      finally { setProfileLoading(false); }
    };
    loadProfile();
  }, [apiUrl, clientAuthHeaders, isPortal, loggedInUser]);

  useEffect(() => {
    if (isPortal) return;
    setClientName(searchParams.get("name") || ""); setClientEmail(searchParams.get("email") || ""); setClientPhone(searchParams.get("phone") || "");
    const requestedType = searchParams.get("appointmentType") || "";
    if (appointmentTypes.some((item) => item.title === requestedType)) setSelectedAppointmentType(requestedType);
  }, [isPortal, searchParams]);

  const fetchAvailability = useCallback(async () => {
    if (!selectedAppointmentType || !selectedDate) { setAvailableSlots([]); return; }
    setSlotsLoading(true); setSlotsErr(""); setSelectedSlot(null);
    const date = toDateKey(selectedDate); const weekday = selectedDate.toLocaleDateString("en-US", { weekday: "long" });
    try {
      const [availabilityRes, blockedRes, bookedRes] = await Promise.all([
        axios.get(`${apiUrl}/availability`, { params: { weekday, appointmentType: selectedAppointmentType } }),
        axios.get(`${apiUrl}/blocked-times`, { params: { date } }),
        axios.get(`${apiUrl}/appointments/by-date`, { params: { date } }),
      ]);
      const unavailable = new Set([...(blockedRes.data?.blockedTimes || []).map(timeKey), ...(Array.isArray(bookedRes.data) ? bookedRes.data : []).map((appt) => timeKey(appt.time))]);
      setAvailableSlots((Array.isArray(availabilityRes.data) ? availabilityRes.data : []).map((slot) => ({ ...slot, start_time: normalizeTime(slot.start_time), end_time: normalizeTime(slot.end_time) })).filter((slot) => !unavailable.has(timeKey(slot.start_time))));
    } catch (error) { console.error("Error fetching availability:", error); setAvailableSlots([]); setSlotsErr("We couldn't load available times. Please try again."); }
    finally { setSlotsLoading(false); }
  }, [apiUrl, selectedAppointmentType, selectedDate]);
  useEffect(() => { fetchAvailability(); }, [fetchAvailability]);

  const handleSubmit = async (event) => {
    event.preventDefault(); if (isSubmitting) return;
    if (!selectedService) return setFormErr("Choose a service to continue.");
    if (!selectedSlot) return setFormErr("Choose an available time to continue.");
    if (!clientName.trim() || !clientEmail.trim() || !clientPhone.trim()) return setFormErr("Please complete your name, email, and phone number.");
    if (!/^\S+@\S+\.\S+$/.test(clientEmail)) return setFormErr("Enter a valid email address.");
    const appointmentData = { title: selectedAppointmentType, client_id: isPortal ? clientId : undefined, client_name: clientName.trim(), client_email: clientEmail.trim(), client_phone: clientPhone.trim(), date: toDateKey(selectedDate), time: normalizeTime(selectedSlot.start_time), end_time: normalizeTime(selectedSlot.end_time), description: notes.trim() || `Client booked a ${selectedAppointmentType} appointment${isPortal ? " (portal)" : ""}`, price: Number(selectedService.price || 0) };
    try {
      setIsSubmitting(true); setFormErr(""); localStorage.setItem("pendingAppointment", JSON.stringify(appointmentData));
      if (appointmentData.price <= 0) { navigate("/payment-success"); return; }
      const { data } = await axios.post(`${apiUrl}/api/create-payment-link`, { email: appointmentData.client_email, amount: appointmentData.price, itemName: selectedAppointmentType, appointmentData });
      if (!data?.url) throw new Error("No checkout link was returned."); window.location.assign(data.url);
    } catch (error) { console.error("Booking failed:", error); setFormErr(error?.response?.data?.error || error.message || "Booking failed. Please try again."); setIsSubmitting(false); }
  };

  return <main className="scheduler-page">
    <section className="scheduler-hero"><div className="scheduler-eyebrow">STEM WITH LYN</div><h1>Let’s find the right time to learn.</h1><p>Choose your session, pick an available time, and confirm your details. It only takes a minute.</p><div className="scheduler-trust-row"><span>✓ Live availability</span><span>✓ Secure checkout</span><span>✓ Instant confirmation</span></div></section>
    <form className="scheduler-shell" onSubmit={handleSubmit} noValidate>
      <div className="scheduler-main">
        <section className="booking-section"><div className="section-heading"><span className="step-number">1</span><div><h2>Choose a service</h2><p>Select the session that best fits your goals.</p></div></div>
          {categories.map((category) => <div className="service-category" key={category}><h3>{category}</h3><div className="service-grid">{appointmentTypes.filter((item) => item.category === category).map((item) => { const meta = getServiceMeta(item); const selected = item.title === selectedAppointmentType; return <button className={`service-card${selected ? " selected" : ""}`} type="button" key={item.title} onClick={() => { setSelectedAppointmentType(item.title); setSelectedSlot(null); setFormErr(""); }} aria-pressed={selected}><span className="service-check">{selected ? "✓" : ""}</span><strong>{item.title}</strong><span className="service-meta"><span>{meta.duration}</span><span>{meta.price}</span></span></button>; })}</div></div>)}
        </section>
        <section className="booking-section"><div className="section-heading"><span className="step-number">2</span><div><h2>Pick a date & time</h2><p>Times shown are in your local time zone.</p></div></div>
          <div className="date-time-grid"><Calendar value={selectedDate} onChange={setSelectedDate} minDate={today} next2Label={null} prev2Label={null} calendarType="gregory" /><div className="time-panel"><div className="time-panel-heading"><strong>{formatDate(selectedDate)}</strong><span>{Intl.DateTimeFormat().resolvedOptions().timeZone.replaceAll("_", " ")}</span></div>
            {!selectedService ? <div className="slot-message"><span>↑</span><p>Choose a service first to see available times.</p></div> : slotsLoading ? <div className="slot-message"><span className="loading-ring" /><p>Checking availability…</p></div> : slotsErr ? <div className="slot-message error"><p>{slotsErr}</p><button type="button" onClick={fetchAvailability}>Try again</button></div> : availableSlots.length === 0 ? <div className="slot-message"><span>Calendar</span><p>No openings on this date. Try another day.</p></div> : <div className="slot-grid">{availableSlots.map((slot) => { const selected = timeKey(selectedSlot?.start_time) === timeKey(slot.start_time); return <button type="button" className={`slot-button${selected ? " selected" : ""}`} key={`${slot.start_time}-${slot.end_time}`} onClick={() => { setSelectedSlot(slot); setFormErr(""); }} aria-pressed={selected}>{formatTime(slot.start_time)}</button>; })}</div>}
          </div></div>
        </section>
        <section className="booking-section"><div className="section-heading"><span className="step-number">3</span><div><h2>Your details</h2><p>We’ll use these to send your confirmation.</p></div></div>{profileLoading && <div className="inline-notice">Loading your portal profile…</div>}{profileErr && <div className="inline-notice error">{profileErr}</div>}
          <div className="details-grid"><label className="field"><span>Full name *</span><input value={clientName} onChange={(e) => setClientName(e.target.value)} placeholder="Your full name" autoComplete="name" /></label><label className="field"><span>Email address *</span><input type="email" value={clientEmail} onChange={(e) => setClientEmail(e.target.value)} placeholder="you@example.com" autoComplete="email" /></label><label className="field"><span>Phone number *</span><input type="tel" value={clientPhone} onChange={(e) => setClientPhone(e.target.value)} placeholder="(555) 123-4567" autoComplete="tel" /></label><label className="field field-wide"><span>Anything we should know? <small>Optional</small></span><textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Topics, goals, accessibility needs, or questions…" rows="4" /></label></div>
        </section>
      </div>
      <aside className="booking-summary"><div className="summary-label">BOOKING SUMMARY</div><h2>Your session</h2><div className="summary-row"><span>Service</span><strong>{selectedService?.title || "Not selected"}</strong></div><div className="summary-row"><span>Date</span><strong>{formatDate(selectedDate)}</strong></div><div className="summary-row"><span>Time</span><strong>{selectedSlot ? `${formatTime(selectedSlot.start_time)} – ${formatTime(selectedSlot.end_time)}` : "Not selected"}</strong></div><div className="summary-row total"><span>Total</span><strong>{serviceMeta?.price || "—"}</strong></div>{formErr && <div className="inline-notice error" role="alert">{formErr}</div>}<button className="confirm-button" type="submit" disabled={isSubmitting || profileLoading}>{isSubmitting ? "Securing your time…" : selectedService?.price > 0 ? "Continue to secure payment" : "Confirm appointment"}</button><p className="summary-footnote">By confirming, you agree to receive appointment updates by email or text.</p>{isPortal && <button className="back-link" type="button" onClick={() => navigate("/client-portal")}>← Back to client portal</button>}</aside>
    </form>
  </main>;
};
export default ClientSchedulingPage;
