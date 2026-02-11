import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import Calendar from "react-calendar";
import "react-calendar/dist/Calendar.css";
import appointmentTypes from "../../data/appointmentTypes.json";

const PortalSchedulingPage = () => {
  const navigate = useNavigate();
  const apiUrl = process.env.REACT_APP_API_URL || "http://localhost:3001";

  // =========================
  // Auth / Client Profile
  // =========================
  const loggedInUser = useMemo(() => {
    try {
      return JSON.parse(localStorage.getItem("loggedInUser"));
    } catch {
      return null;
    }
  }, []);

  const authHeaders = useMemo(() => {
    const id = loggedInUser?.id;
    const username = loggedInUser?.username;
    if (!id || !username) return null;

    return {
      "x-user-id": String(id),
      "x-username": String(username),
    };
  }, [loggedInUser]);

  const [profileLoading, setProfileLoading] = useState(true);
  const [profileErr, setProfileErr] = useState("");

  const [clientId, setClientId] = useState(null);
  const [clientName, setClientName] = useState("");
  const [clientEmail, setClientEmail] = useState("");
  const [clientPhone, setClientPhone] = useState("");

  // Optional: allow phone editing only if missing
  const [allowPhoneEdit, setAllowPhoneEdit] = useState(false);
  const [savingPhone, setSavingPhone] = useState(false);

  // =========================
  // Scheduling
  // =========================
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [selectedAppointmentType, setSelectedAppointmentType] = useState("");
  const [availableSlots, setAvailableSlots] = useState([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // =========================
  // Load portal client profile
  // =========================
  useEffect(() => {
    // Not logged in → send to login
    if (!authHeaders) {
      setProfileLoading(false);
      navigate("/login");
      return;
    }

    const load = async () => {
      setProfileLoading(true);
      setProfileErr("");

      try {
        const res = await axios.get(`${apiUrl}/client/me`, {
          headers: authHeaders,
        });

        const client = res?.data?.client;
        const user = res?.data?.user;

        if (!client || !user) {
          throw new Error("Client portal profile not found.");
        }

        setClientId(client.id);
        setClientName(client.full_name || user.name || user.username || "");
        setClientEmail(client.email || user.email || "");
        setClientPhone(client.phone || user.phone || "");

        // If phone missing, allow editing (optional)
        setAllowPhoneEdit(!Boolean(client.phone || user.phone));
      } catch (err) {
        console.error("❌ /client/me failed:", err);
        setProfileErr(
          err?.response?.data?.error ||
            err?.message ||
            "Failed to load your profile. Please log in again."
        );
      } finally {
        setProfileLoading(false);
      }
    };

    load();
  }, [apiUrl, authHeaders, navigate]);

  // =========================
  // (Optional) Save phone to client record
  // =========================
  const savePhoneToProfile = async () => {
    if (!clientId) return;
    const phone = String(clientPhone || "").trim();

    if (!phone) {
      alert("Please enter a phone number.");
      return;
    }

    setSavingPhone(true);
    try {
      // PATCH /api/clients/:id already exists in your backend
      // This updates the clients table row (which is what portal uses)
      await axios.patch(
        `${apiUrl}/api/clients/${clientId}`,
        { phone },
        { headers: authHeaders }
      );

      setAllowPhoneEdit(false);
    } catch (err) {
      console.error("❌ save phone failed:", err);
      alert(
        err?.response?.data?.error ||
          err?.message ||
          "Failed to save phone. Please try again."
      );
    } finally {
      setSavingPhone(false);
    }
  };

  // =========================
  // Availability
  // =========================
  const fetchAvailability = useCallback(async () => {
    if (!selectedDate || !selectedAppointmentType) return;

    const formattedDate = selectedDate.toISOString().split("T")[0];
    const appointmentWeekday = selectedDate
      .toLocaleDateString("en-US", { weekday: "long" })
      .trim();

    try {
      const response = await axios.get(`${apiUrl}/availability`, {
        params: { weekday: appointmentWeekday, appointmentType: selectedAppointmentType },
      });

      const blockedTimesRes = await axios.get(`${apiUrl}/blocked-times`, {
        params: { date: formattedDate },
      });

      const bookedTimesRes = await axios.get(`${apiUrl}/appointments/by-date`, {
        params: { date: formattedDate },
      });

      const blockedTimes = (blockedTimesRes.data.blockedTimes || []).map(
        (time) => `${formattedDate}-${time.split(":")[0]}`
      );

      const bookedTimes = (bookedTimesRes.data || []).map(
        (appointment) => `${formattedDate}-${String(appointment.time || "").split(":")[0]}`
      );

      const unavailableTimes = [...new Set([...blockedTimes, ...bookedTimes])];

      const formattedAvailableSlots = (response.data || []).map((slot) => ({
        ...slot,
        start_time: slot.start_time?.length === 5 ? `${slot.start_time}:00` : slot.start_time,
        end_time: slot.end_time?.length === 5 ? `${slot.end_time}:00` : slot.end_time,
      }));

      const filteredSlots = formattedAvailableSlots.filter((slot) => {
        const slotHour = String(slot.start_time || "").split(":")[0];
        return !unavailableTimes.some((blocked) => blocked.includes(`${formattedDate}-${slotHour}`));
      });

      setAvailableSlots(filteredSlots.length > 0 ? filteredSlots : []);
    } catch (error) {
      console.error("❌ Error fetching availability:", error);
      setAvailableSlots([]);
    }
  }, [apiUrl, selectedDate, selectedAppointmentType]);

  useEffect(() => {
    if (selectedDate && selectedAppointmentType) {
      setAvailableSlots([]);
      fetchAvailability();
    }
  }, [selectedDate, selectedAppointmentType, fetchAvailability]);

  const formatTime = (time) => {
    const [hours, minutes] = String(time || "").split(":");
    const date = new Date();
    date.setHours(Number(hours || 0), Number(minutes || 0));
    return new Intl.DateTimeFormat("en-US", {
      hour: "numeric",
      minute: "numeric",
      hour12: true,
    }).format(date);
  };

  // =========================
  // Book appointment
  // =========================
  const bookAppointment = async (slot) => {
    if (isSubmitting) return;

    if (!clientName || !clientEmail || !selectedAppointmentType || !selectedDate) {
      alert("Missing profile info. Please refresh or log in again.");
      return;
    }

    // If phone is required for your business rules, enforce it here:
    // If you *don't* care, remove this check.
    if (!clientPhone) {
      alert("Please add a phone number to your profile before booking.");
      setAllowPhoneEdit(true);
      return;
    }

    const selected = appointmentTypes.find((a) => a.title === selectedAppointmentType);
    const basePrice = Number(selected?.price ?? 0);

    const appointmentData = {
      title: selectedAppointmentType,

      // Portal: use their saved info (no form fields)
      client_id: clientId || undefined, // optional, backend can still upsert by email
      client_name: clientName,
      client_email: clientEmail,
      client_phone: clientPhone,

      date: selectedDate.toISOString().split("T")[0],
      time: slot.start_time?.length === 5 ? `${slot.start_time}:00` : slot.start_time,
      end_time: slot.end_time && slot.end_time.length === 5 ? `${slot.end_time}:00` : slot.end_time,

      description: `Client booked a ${selectedAppointmentType} appointment (portal)`,

      price: basePrice,
    };

    try {
      setIsSubmitting(true);

      // Store pending appointment for success page to finalize
      localStorage.setItem("pendingAppointment", JSON.stringify(appointmentData));

      // Free: go straight to success page
      if (basePrice <= 0) {
        navigate("/payment-success");
        return;
      }

      // Paid: get Square link and redirect
      const res = await axios.post(`${apiUrl}/api/create-payment-link`, {
        email: clientEmail,
        amount: basePrice,
        itemName: selectedAppointmentType,
        appointmentData,
      });

      if (!res?.data?.url) {
        throw new Error("Missing payment link URL from server.");
      }

      window.location.href = res.data.url;
    } catch (err) {
      console.error("❌ Booking failed:", err);
      alert(err?.message || "Booking failed. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  // =========================
  // Render
  // =========================
  if (profileLoading) {
    return (
      <div className="client-scheduling">
        <h2>Schedule an Appointment</h2>
        <p>Loading your profile…</p>
      </div>
    );
  }

  if (profileErr) {
    return (
      <div className="client-scheduling">
        <h2>Schedule an Appointment</h2>
        <p style={{ color: "red" }}>{profileErr}</p>
        <button onClick={() => navigate("/login")}>Go to Login</button>
      </div>
    );
  }

  return (
    <div className="client-scheduling">
      <h2>Schedule an Appointment</h2>

      {/* ✅ Read-only client info (portal) */}
      <div style={{ background: "#f6f6f6", padding: 12, borderRadius: 10, marginBottom: 12 }}>
        <div><strong>Name:</strong> {clientName || "—"}</div>
        <div><strong>Email:</strong> {clientEmail || "—"}</div>

        <div style={{ marginTop: 8 }}>
          <strong>Phone:</strong>{" "}
          {allowPhoneEdit ? (
            <>
              <input
                type="tel"
                value={clientPhone}
                onChange={(e) => setClientPhone(e.target.value)}
                placeholder="Enter phone number"
                style={{ marginLeft: 8 }}
              />
              <button
                onClick={savePhoneToProfile}
                disabled={savingPhone}
                style={{ marginLeft: 8 }}
              >
                {savingPhone ? "Saving…" : "Save"}
              </button>
            </>
          ) : (
            <>
              {clientPhone || "—"}
              {!clientPhone && (
                <button style={{ marginLeft: 8 }} onClick={() => setAllowPhoneEdit(true)}>
                  Add Phone
                </button>
              )}
            </>
          )}
        </div>
      </div>

      <label>Select Appointment Type:</label>
      <select
        value={selectedAppointmentType}
        onChange={(e) => setSelectedAppointmentType(e.target.value)}
      >
        <option value="">Select Appointment Type</option>
        {appointmentTypes.map((appt) => (
          <option key={appt.title} value={appt.title}>
            {appt.title}
          </option>
        ))}
      </select>

      <label style={{ marginTop: 12 }}>Select Date:</label>
      <Calendar
        onChange={setSelectedDate}
        value={selectedDate}
        onClickDay={() => fetchAvailability()}
      />

      <h3 style={{ marginTop: 14 }}>Available Slots</h3>

      <ul>
        {availableSlots.length === 0 ? (
          <p>❌ No available slots for this date.</p>
        ) : (
          availableSlots.map((slot) => {
            const key = `${selectedDate.toISOString().split("T")[0]}-${slot.start_time}-${slot.end_time}`;
            return (
              <li key={key} className="available-slot">
                {formatTime(slot.start_time)} - {formatTime(slot.end_time)}
                <button onClick={() => bookAppointment(slot)} disabled={isSubmitting}>
                  {isSubmitting ? "Booking…" : "Book"}
                </button>
              </li>
            );
          })
        )}
      </ul>
    </div>
  );
};

export default PortalSchedulingPage;
