import React, { useState, useEffect, useCallback } from "react";
import axios from "axios";
import appointmentTypes from "../../data/appointmentTypes.json";

const AdminAvailabilityPage = () => {
    const [weekday, setWeekday] = useState("");
    const [startTime, setStartTime] = useState("");
    const [endTime, setEndTime] = useState("");
    const [appointmentType, setAppointmentType] = useState("");
    const [availability, setAvailability] = useState([]);
    const [selectedWeekday, setSelectedWeekday] = useState("");  // Default to show all
    const [selectedAppointmentType, setSelectedAppointmentType] = useState("");

    const apiUrl = process.env.REACT_APP_API_URL || "http://localhost:3001";


/** ✅ Fetch Availability (Handles "Show All" Case) **/
const fetchAvailability = async () => {
    try {
        console.log("📡 Fetching Admin Availability from API:", apiUrl + "/availability");

        const params = {};
        if (selectedWeekday && selectedWeekday !== "Show All Days") {
            params.weekday = selectedWeekday;
        }
        if (selectedAppointmentType && selectedAppointmentType !== "Show All Types") {
            params.appointmentType = selectedAppointmentType;
        }

        const response = await axios.get(`${apiUrl}/admin-availability`, { params });

        console.log("✅ Availability Data for Admin:", response.data);
        setAvailability(response.data);
    } catch (error) {
        console.error("❌ Error fetching availability for Admin:", error);
    }
};


    /** 🔄 Fetch All Availability When Page Loads **/
    useEffect(() => {
        fetchAvailability();
    }, [selectedWeekday, selectedAppointmentType]); // Re-fetch when filters change
    

    /** ✅ Add Availability **/
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
                appointment_type: appointmentType
            });

            console.log("✅ Availability added successfully!");
            fetchAvailability(); // Refresh list
        } catch (error) {
            console.error("❌ Error adding availability:", error.response?.data || error.message);
        }
    };

    const formatTime = (time) => {
        if (!time) return "Invalid Time";
        const [hours, minutes] = time.split(':');
        const date = new Date();
        date.setHours(hours, minutes);
        return new Intl.DateTimeFormat('en-US', {
            hour: 'numeric',
            minute: 'numeric',
            hour12: true,
        }).format(date);
    };

    return (
        <div className="admin-availability">
            <h2>Set Weekly Availability</h2>
    
            <label>Select: Weekday, start/end time, and Appt type:</label>
            <select value={weekday} onChange={(e) => setWeekday(e.target.value)}>
                <option value="">Select a Day</option>
                {["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"].map((day) => (
                    <option key={day} value={day}>{day}</option>
                ))}
            </select>
            <input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
            <input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
            <select value={appointmentType} onChange={(e) => setAppointmentType(e.target.value)}>
                <option value="">Select Appointment Type</option>
                {appointmentTypes.map((appt) => (
                    <option key={appt.title} value={appt.title}>
                        {appt.title}
                    </option>
                ))}
            </select>
    
            <button onClick={addAvailability}>Add Availability</button>
    
            <h3>Filter Availability</h3>
            <select value={selectedWeekday} onChange={(e) => setSelectedWeekday(e.target.value)}>
                <option value="Show All Days">Show All Days</option>
                {["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"].map((day) => (
                    <option key={day} value={day}>{day}</option>
                ))}
            </select>
            <select value={selectedAppointmentType} onChange={(e) => setSelectedAppointmentType(e.target.value)}>
                <option value="Show All Types">Show All Types</option>
                {appointmentTypes.map((appt) => (
                    <option key={appt.title} value={appt.title}>{appt.title}</option>
                ))}
            </select>
            <button onClick={fetchAvailability}>Search</button>
    
            {/* ✅ Fixed Closing Div Tag for Availability Section */}
            <div className="admin-availability">
                <h3>Current Weekly Availability</h3>
                {availability.length === 0 ? (
                    <p>No availability found.</p>
                ) : (
                    <div>
                        {Object.entries(
    availability.reduce((acc, slot) => {
        if (!acc[slot.appointment_type]) {
            acc[slot.appointment_type] = [];
        }
        acc[slot.appointment_type].push(slot);
        return acc;
    }, {})
).map(([appointmentType, slots]) => (
    <details key={appointmentType} className="availability-section">
        <summary><h4>{appointmentType}</h4></summary> {/* Collapsible title */}
        
        <ul>
            {slots
                .sort((a, b) => {
                    const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
                    return days.indexOf(a.weekday) - days.indexOf(b.weekday) || a.start_time.localeCompare(b.start_time);
                })
                .map((slot, index) => (
                    <li key={index}>
                        <strong>{slot.weekday}</strong> | {formatTime(slot.start_time)} - {formatTime(slot.end_time)}
                    </li>
                ))}
        </ul>
    </details>
))}

                    </div>
                )}
            </div>
        </div> 
    ); // ✅ Fixed Missing Closing Div
};
    
export default AdminAvailabilityPage;
    