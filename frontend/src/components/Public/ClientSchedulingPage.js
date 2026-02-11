import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useNavigate, useSearchParams, useLocation } from "react-router-dom";
import axios from "axios";
import Calendar from "react-calendar";
import "react-calendar/dist/Calendar.css";
import appointmentTypes from "../../data/appointmentTypes.json";

const ClientSchedulingPage = ({ portalMode = false }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();

  const apiUrl = process.env.REACT_APP_API_URL || "http://localhost:3001";

  // ✅ Detect portal mode even if prop was forgotten
  const isPortalRoute = location.pathname.startsWith("/client-portal");
  const isPortal = portalMode || isPortalRoute;

  // -----------------------
  // Logged-in user snapshot
  // -----------------------
  const loggedInUser = useMemo(() => {
    try {
      return JSON.parse(localStorage.getItem("loggedInUser") || "null");
    } catch {
      return null;
    }
  }, []);

  const usernameLS = localStorage.getItem("username") || "";
  const userIdLS = localStorage.getItem("userId") || "";

  // ✅ Headers required by your backend requireClientUser()
  const clientAuthHeaders = useMemo(() => {
    const id = loggedInUser?.id || userIdLS;
    const uname = loggedInUser?.username || usernameLS;

    const headers = {};
    if (id) headers["x-user-id"] = String(id);
    if (uname) headers["x-username"] = String(uname);

    return headers;
  }, [loggedInUser, userIdLS, usernameLS]);

  // -----------------------
  // State
  // -----------------------
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [selectedAppointmentType, setSelectedAppointmentType] = useState("");
  const [availableSlots, setAvailableSlots] = useState([]);

  const [clientId, setClientId] = useState(null);
  const [clientName, setClientName] = useState("");
  const [clientEmail, setClientEmail] = useState("");
  const [clientPhone, setClientPhone] = useState("");

  const [profileLoading, setProfileLoading] = useState(false);
  const [profileErr, setProfileErr] = useState("");

  const [isSubmitting, setIsSubmitting] = useState(false);

  // =========================================
  // ✅ PORTAL MODE: auto-fill from /client/me
  // =========================================
  useEffect(() => {
    if (!isPortal) return;

    const loadPortalProfile = async () => {
      setProfileLoading(true);
      setProfileErr("");

      try {
        // If we don’t have either header, you’re not “authenticated” for /client/me
        if (!clientAuthHeaders["x-user-id"] && !clientAuthHeaders["x-username"]) {
          throw new Error("Portal auth headers missing. Please log in again.");
        }

        const res = await axios.get(`${apiUrl}/client/me`, {
          headers: clientAuthHeaders,
        });

        const client = res?.data?.client || null;
        const user = res?.data?.user || null;

        if (!client && !user) {
          throw new Error("No portal profile data returned from /client/me.");
        }

        const name =
          client?.full_name ||
          user?.name ||
          user?.username ||
          loggedInUser?.username ||
          "";

        const email =
          client?.email ||
          user?.email ||
          loggedInUser?.email ||
          "";

        const phone =
          client?.phone ||
          user?.phone ||
          loggedInUser?.phone ||
          "";

        setClientId(client?.id || null);
        setClientName(name || "");
        setClientEmail(email || "");
        setClientPhone(phone || "");
      } catch (err) {
        console.error("❌ /client/me failed:", err);
        setProfileErr(
          err?.response?.data?.error ||
            err?.message ||
            "Failed to load portal profile."
        );
      } finally {
        setProfileLoading(false);
      }
    };

    loadPortalProfile();
  }, [isPortal, apiUrl, clientAuthHeaders, loggedInUser]);

  // =========================================
  // ✅ PUBLIC MODE: allow URL prefills
  // =========================================
  useEffect(() => {
    if (isPortal) return;

    const name = searchParams.get("name");
    const email = searchParams.get("email");
    const phone = searchParams.get("phone");
    const apptType = searchParams.get("appointmentType");

    if (name) setClientName(name);
    if (email) setClientEmail(email);
    if (phone) setClientPhone(phone);
    if (apptType) setSelectedAppointmentType(apptType);
  }, [searchParams, isPortal]);

  // =========================================
  // Availability
  // =========================================
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
        (time) => `${formattedDate}-${String(time).split(":")[0]}`
      );

      const bookedTimes = (bookedTimesRes.data || []).map(
        (appt) => `${formattedDate}-${String(appt.time || "").split(":")[0]}`
      );

      const unavailableTimes = [...new Set([...blockedTimes, ...bookedTimes])];

      const formattedAvailableSlots = (response.data || []).map((slot) => ({
        ...slot,
        start_time: slot.start_time?.length === 5 ? `${slot.start_time}:00` : slot.start_time,
        end_time: slot.end_time?.length === 5 ? `${slot.end_time}:00` : slot.end_time,
      }));

      const filteredSlots = formattedAvailableSlots.filter((slot) => {
        const slotHour = String(slot.start_time || "").split(":")[0];
        return !unavailableTimes.some((x) => x.includes(`${formattedDate}-${slotHour}`));
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

  // =========================================
  // Book appointment
  // =========================================
  const bookAppointment = async (slot) => {
    if (isSubmitting) return;

    if (!clientName || !clientEmail) {
      alert("Missing name or email. Please refresh or contact support.");
      return;
    }

    // If you want phone required, keep this; otherwise remove it.
    if (!clientPhone) {
      alert("Please enter your phone number before booking.");
      return;
    }

    const selected = appointmentTypes.find((a) => a.title === selectedAppointmentType);
    const basePrice = Number(selected?.price ?? 0);

    const appointmentData = {
      title: selectedAppointmentType,
      client_id: isPortal ? clientId : undefined,
      client_name: clientName,
      client_email: clientEmail,
      client_phone: clientPhone,
      date: selectedDate.toISOString().split("T")[0],
      time: slot.start_time?.length === 5 ? `${slot.start_time}:00` : slot.start_time,
      end_time: slot.end_time?.length === 5 ? `${slot.end_time}:00` : slot.end_time,
      description: isPortal
        ? `Client booked a ${selectedAppointmentType} appointment (portal)`
        : `Client booked a ${selectedAppointmentType} appointment`,
      price: basePrice,
    };

    try {
      setIsSubmitting(true);

      localStorage.setItem("pendingAppointment", JSON.stringify(appointmentData));

      if (basePrice <= 0) {
        navigate("/payment-success");
        return;
      }

      const res = await axios.post(`${apiUrl}/api/create-payment-link`, {
        email: clientEmail,
        amount: basePrice,
        itemName: selectedAppointmentType,
        appointmentData,
      });

      window.location.href = res.data.url;
    } catch (err) {
      console.error("❌ Booking failed:", err);
      alert("Booking failed. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  // =========================================
  // Render
  // =========================================
  if (isPortal && profileLoading) {
    return (
      <div className="client-scheduling">
        <h2>Schedule an Appointment</h2>
        <p>Loading your portal profile…</p>
      </div>
    );
  }

  return (
    <div className="client-scheduling">
      <h2>Schedule an Appointment</h2>

      {/* ✅ Show real errors instead of silently blanking */}
      {isPortal && profileErr && (
        <p style={{ color: "red" }}>
          {profileErr}
        </p>
      )}

      <label>Client Name:</label>
      <input
        type="text"
        value={clientName}
        onChange={(e) => setClientName(e.target.value)}
        placeholder="Enter your name"
        disabled={isPortal && Boolean(clientName)} // ✅ only lock when we actually have a value
      />

      <label>Client Email:</label>
      <input
        type="email"
        value={clientEmail}
        onChange={(e) => setClientEmail(e.target.value)}
        placeholder="Enter your email"
        disabled={isPortal && Boolean(clientEmail)} // ✅ only lock when we actually have a value
      />

      <label>Client Phone Number:</label>
      <input
        type="phone"
        value={clientPhone}
        onChange={(e) => setClientPhone(e.target.value)}
        placeholder="Enter your phone number"
      />

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

      <label>Select Date:</label>
      <Calendar onChange={setSelectedDate} value={selectedDate} onClickDay={() => fetchAvailability()} />

      <h3>Available Slots</h3>
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

export default ClientSchedulingPage;
