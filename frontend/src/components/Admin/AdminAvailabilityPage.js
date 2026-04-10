import React, { useState, useEffect } from "react";
import axios from "axios";
import appointmentTypes from "../../data/appointmentTypes.json";

const AdminAvailabilityPage = () => {
  const [weekday, setWeekday] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [appointmentType, setAppointmentType] = useState("");

  const [availability, setAvailability] = useState([]);
  const [selectedWeekday, setSelectedWeekday] = useState("Show All Days");
  const [selectedAppointmentType, setSelectedAppointmentType] = useState("Show All Types");

  const [editingId, setEditingId] = useState(null);
  const [loading, setLoading] = useState(false);

  const apiUrl = process.env.REACT_APP_API_URL || "http://localhost:3001";

  const weekdays = [
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
    "Sunday",
  ];

  const fetchAvailability = async () => {
    try {
      setLoading(true);

      const params = {};
      if (selectedWeekday && selectedWeekday !== "Show All Days") {
        params.weekday = selectedWeekday;
      }
      if (selectedAppointmentType && selectedAppointmentType !== "Show All Types") {
        params.appointmentType = selectedAppointmentType;
      }

      const response = await axios.get(`${apiUrl}/admin-availability`, { params });
      setAvailability(response.data || []);
    } catch (error) {
      console.error("❌ Error fetching availability for Admin:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAvailability();
  }, [selectedWeekday, selectedAppointmentType]);

  const resetForm = () => {
    setWeekday("");
    setStartTime("");
    setEndTime("");
    setAppointmentType("");
    setEditingId(null);
  };

  const addAvailability = async () => {
    if (!weekday || !startTime || !endTime || !appointmentType) {
      alert("Please fill out all fields.");
      return;
    }

    try {
      await axios.post(`${apiUrl}/admin-availability`, {
        weekday,
        start_time: startTime,
        end_time: endTime,
        appointment_type: appointmentType,
      });

      resetForm();
      fetchAvailability();
    } catch (error) {
      console.error("❌ Error adding availability:", error.response?.data || error.message);
      alert(error.response?.data?.error || "Failed to add availability.");
    }
  };

  const updateAvailability = async () => {
    if (!editingId) return;

    if (!weekday || !startTime || !endTime || !appointmentType) {
      alert("Please fill out all fields.");
      return;
    }

    try {
      await axios.patch(`${apiUrl}/admin-availability/${editingId}`, {
        weekday,
        start_time: startTime,
        end_time: endTime,
        appointment_type: appointmentType,
      });

      resetForm();
      fetchAvailability();
    } catch (error) {
      console.error("❌ Error updating availability:", error.response?.data || error.message);
      alert(error.response?.data?.error || "Failed to update availability.");
    }
  };

  const deleteAvailability = async (id) => {
    const confirmed = window.confirm("Delete this availability slot?");
    if (!confirmed) return;

    try {
      await axios.delete(`${apiUrl}/admin-availability/${id}`);
      if (editingId === id) {
        resetForm();
      }
      fetchAvailability();
    } catch (error) {
      console.error("❌ Error deleting availability:", error.response?.data || error.message);
      alert(error.response?.data?.error || "Failed to delete availability.");
    }
  };

  const startEdit = (slot) => {
    setEditingId(slot.id);
    setWeekday(slot.weekday || "");
    setStartTime((slot.start_time || "").slice(0, 5));
    setEndTime((slot.end_time || "").slice(0, 5));
    setAppointmentType(slot.appointment_type || "");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const formatTime = (time) => {
    if (!time) return "Invalid Time";

    const cleaned = String(time).slice(0, 5);
    const [hours, minutes] = cleaned.split(":");

    const date = new Date();
    date.setHours(Number(hours), Number(minutes), 0, 0);

    return new Intl.DateTimeFormat("en-US", {
      hour: "numeric",
      minute: "numeric",
      hour12: true,
    }).format(date);
  };

  const groupedAvailability = availability.reduce((acc, slot) => {
    const key = slot.appointment_type || "Other";
    if (!acc[key]) acc[key] = [];
    acc[key].push(slot);
    return acc;
  }, {});

  return (
    <div className="admin-availability" style={{ padding: "20px" }}>
      <h2>{editingId ? "Edit Weekly Availability" : "Set Weekly Availability"}</h2>

      <label>Select weekday, start/end time, and appointment type:</label>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
          gap: "10px",
          marginTop: "12px",
          marginBottom: "12px",
        }}
      >
        <select value={weekday} onChange={(e) => setWeekday(e.target.value)}>
          <option value="">Select a Day</option>
          {weekdays.map((day) => (
            <option key={day} value={day}>
              {day}
            </option>
          ))}
        </select>

        <input
          type="time"
          value={startTime}
          onChange={(e) => setStartTime(e.target.value)}
        />

        <input
          type="time"
          value={endTime}
          onChange={(e) => setEndTime(e.target.value)}
        />

        <select
          value={appointmentType}
          onChange={(e) => setAppointmentType(e.target.value)}
        >
          <option value="">Select Appointment Type</option>
          {appointmentTypes.map((appt) => (
            <option key={appt.title} value={appt.title}>
              {appt.title}
            </option>
          ))}
        </select>
      </div>

      <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", marginBottom: "24px" }}>
        {editingId ? (
          <>
            <button onClick={updateAvailability}>Save Changes</button>
            <button onClick={resetForm}>Cancel Edit</button>
          </>
        ) : (
          <button onClick={addAvailability}>Add Availability</button>
        )}
      </div>

      <h3>Filter Availability</h3>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: "10px",
          marginBottom: "20px",
        }}
      >
        <select
          value={selectedWeekday}
          onChange={(e) => setSelectedWeekday(e.target.value)}
        >
          <option value="Show All Days">Show All Days</option>
          {weekdays.map((day) => (
            <option key={day} value={day}>
              {day}
            </option>
          ))}
        </select>

        <select
          value={selectedAppointmentType}
          onChange={(e) => setSelectedAppointmentType(e.target.value)}
        >
          <option value="Show All Types">Show All Types</option>
          {appointmentTypes.map((appt) => (
            <option key={appt.title} value={appt.title}>
              {appt.title}
            </option>
          ))}
        </select>

        <button onClick={fetchAvailability}>Search</button>
      </div>

      <div className="admin-availability-list">
        <h3>Current Weekly Availability</h3>

        {loading ? (
          <p>Loading...</p>
        ) : availability.length === 0 ? (
          <p>No availability found.</p>
        ) : (
          <div>
            {Object.entries(groupedAvailability).map(([apptType, slots]) => (
              <details key={apptType} className="availability-section" open>
                <summary style={{ cursor: "pointer", marginBottom: "10px" }}>
                  <h4 style={{ display: "inline-block", margin: 0 }}>{apptType}</h4>
                </summary>

                <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                  {slots
                    .sort((a, b) => {
                      return (
                        weekdays.indexOf(a.weekday) - weekdays.indexOf(b.weekday) ||
                        a.start_time.localeCompare(b.start_time)
                      );
                    })
                    .map((slot) => (
                      <li
                        key={slot.id}
                        style={{
                          border: "1px solid #ddd",
                          borderRadius: "10px",
                          padding: "12px",
                          marginBottom: "10px",
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          gap: "12px",
                          flexWrap: "wrap",
                        }}
                      >
                        <div>
                          <strong>{slot.weekday}</strong> | {formatTime(slot.start_time)} -{" "}
                          {formatTime(slot.end_time)}
                        </div>

                        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                          <button onClick={() => startEdit(slot)}>Edit</button>
                          <button onClick={() => deleteAvailability(slot.id)}>Delete</button>
                        </div>
                      </li>
                    ))}
                </ul>
              </details>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default AdminAvailabilityPage;