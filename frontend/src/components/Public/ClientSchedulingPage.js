import React, { useState, useEffect, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import axios from "axios";
import Calendar from "react-calendar";
import "react-calendar/dist/Calendar.css";
import appointmentTypes from "../../data/appointmentTypes.json";

const ClientSchedulingPage = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const apiUrl = process.env.REACT_APP_API_URL || "http://localhost:3001";

  const [selectedDate, setSelectedDate] = useState(new Date());
  const [selectedAppointmentType, setSelectedAppointmentType] = useState("");
  const [availableSlots, setAvailableSlots] = useState([]);
  const [clientName, setClientName] = useState("");
  const [clientEmail, setClientEmail] = useState("");
  const [clientPhone, setClientPhone] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    const name = searchParams.get("name");
    const email = searchParams.get("email");
    const phone = searchParams.get("phone");
    const apptType = searchParams.get("appointmentType");

    if (name) setClientName(name);
    if (email) setClientEmail(email);
    if (phone) setClientPhone(phone);
    if (apptType) setSelectedAppointmentType(apptType);
  }, [searchParams]);

  const fetchAvailability = useCallback(async () => {
    if (!selectedDate || !selectedAppointmentType) return;

    const formattedDate = selectedDate.toISOString().split("T")[0];
    const appointmentWeekday = selectedDate.toLocaleDateString("en-US", { weekday: "long" }).trim();

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

  const bookAppointment = async (slot) => {
    if (isSubmitting) return;

    if (!clientName || !clientEmail || !clientPhone || !selectedAppointmentType || !selectedDate) {
      alert("Please fill out all fields before booking.");
      return;
    }

    const selected = appointmentTypes.find((a) => a.title === selectedAppointmentType);
    const basePrice = Number(selected?.price ?? 0);

    const appointmentData = {
      title: selectedAppointmentType,
      client_name: clientName,
      client_email: clientEmail,
      client_phone: clientPhone,
      date: selectedDate.toISOString().split("T")[0],
      time: slot.start_time?.length === 5 ? `${slot.start_time}:00` : slot.start_time,
      end_time: slot.end_time && slot.end_time.length === 5 ? `${slot.end_time}:00` : slot.end_time,
      description: `Client booked a ${selectedAppointmentType} appointment`,
      price: basePrice,
    };

    try {
      setIsSubmitting(true);

      // ✅ Ready Portal style: store pending appt locally; create appt ONLY on success page
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

  return (
    <div className="client-scheduling">
      <h2>Schedule an Appointment</h2>

      <label>Client Name:</label>
      <input
        type="text"
        value={clientName}
        onChange={(e) => setClientName(e.target.value)}
        placeholder="Enter your name"
      />

      <label>Client Email:</label>
      <input
        type="email"
        value={clientEmail}
        onChange={(e) => setClientEmail(e.target.value)}
        placeholder="Enter your email"
      />

      <label>Client Phone Number:</label>
      <input
        type="phone"
        value={clientPhone}
        onChange={(e) => setClientPhone(e.target.value)}
        placeholder="Enter your phone number"
      />

      <label>Select Appointment Type:</label>
      <select value={selectedAppointmentType} onChange={(e) => setSelectedAppointmentType(e.target.value)}>
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
