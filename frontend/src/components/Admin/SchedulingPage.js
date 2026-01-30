import React, { useState, useEffect } from 'react';
import axios from 'axios';
import '../../App.css';
import appointmentTypes from '../../data/appointmentTypes.json';

const SchedulingPage = () => {
    const [appointments, setAppointments] = useState([]);
    const [clients, setClients] = useState([]);
    const [selectedDate, setSelectedDate] = useState(new Date());
    const [blockedTimes, setBlockedTimes] = useState([]);
    const [showBlockModal, setShowBlockModal] = useState(false);
    const [showAppointmentModal, setShowAppointmentModal] = useState(false);
    const [blockDate, setBlockDate] = useState('');
    const [blockStartTime, setBlockStartTime] = useState('');
    const [blockDuration, setBlockDuration] = useState(1);
    const [blockLabel, setBlockLabel] = useState('');
    const [holidays, setHolidays] = useState([]);


    // NEW: plus button options modal (Add Appointment / Block Time)
    const [showPlusOptionsModal, setShowPlusOptionsModal] = useState(false);

    const [newAppointment, setNewAppointment] = useState({
        title: '',
        client: '',
        date: '',
        time: '',
        endTime: '',
        description: '',
        recurrence: '',
        occurrences: 1,
        weekdays: [],
    });

    const [editingAppointment, setEditingAppointment] = useState(null);

    const apiUrl = process.env.REACT_APP_API_URL || 'http://localhost:3001';
    
    const fetchBlockedTimes = async () => {
        try {
            const response = await axios.get(`${apiUrl}/api/schedule/block`);
    
            console.log("📥 RAW Blocked Times Response:", JSON.stringify(response.data, null, 2));
    
            if (response.data.blockedTimes && response.data.blockedTimes.length > 0) {
                const updatedBlockedTimes = response.data.blockedTimes.map(({ timeSlot, label, date }) => ({
                    timeSlot: timeSlot.trim(),
                    label: label ? label.trim() : "Blocked",
                    date: new Date(date).toISOString().split('T')[0] // ✅ Ensure date is in YYYY-MM-DD format
                }));
                
                console.log("✅ Updated Blocked Times in State:", updatedBlockedTimes);
                setBlockedTimes(updatedBlockedTimes);
            }
        } catch (error) {
            console.error("❌ Error fetching blocked times:", error);
        }
    };
    
    useEffect(() => {
        const fetchHolidays = async () => {
          try {
            const response = await fetch('https://date.nager.at/api/v3/PublicHolidays/2025/US');
            const data = await response.json();
            const formatted = data.map(holiday => ({
              date: holiday.date, // format: YYYY-MM-DD
              name: holiday.localName,
            }));
            setHolidays(formatted);
          } catch (error) {
            console.error('❌ Failed to fetch holidays:', error);
          }
        };
      
        fetchHolidays();
      }, []);

    useEffect(() => {
    setSelectedDate(new Date());
    }, []);

  
    useEffect(() => {
        const fetchData = async () => {
            try {
                const [appointmentsRes, clientsRes] = await Promise.all([
                    axios.get(`${apiUrl}/appointments`),
                    axios.get(`${apiUrl}/api/clients`)
                ]);
    
                console.log("👥 Clients fetched:", clientsRes.data);
    
                const processedAppointments = appointmentsRes.data.map((appointment) => ({
                    ...appointment,
                    date: new Date(appointment.date).toISOString().split("T")[0] 
                }));
                setAppointments(processedAppointments);
                setClients(clientsRes.data);
    
                // ✅ Fetch blocked times for the selected date
                await fetchBlockedTimes(); // ✅ No need to add as a dependency
    
            } catch (error) {
                console.error("❌ Error fetching data:", error);
            }
        };
    
        fetchData();
    }, [apiUrl]); // ✅ `fetchBlockedTimes` is called inside, so it's safe
    
    
const formatTime = (time) => {
  if (time == null) return "";

  const s = String(time);

  // If already HH:MM or HH:MM:SS, format nicely
  if (s.includes(":")) {
    const [hh, mm] = s.split(":");
    const d = new Date();
    d.setHours(Number(hh || 0), Number(mm || 0), 0, 0);
    return new Intl.DateTimeFormat("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    }).format(d);
  }

  // If passed "7" or 7 -> treat as 07:00
  const hour = Number(s);
  if (!Number.isFinite(hour)) return s;

  const d = new Date();
  d.setHours(hour, 0, 0, 0);
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(d);
};


    const handleDateClick = (date) => setSelectedDate(date);

    const handleAddOrUpdateAppointment = async (e) => {
        e.preventDefault();
    
        const clientId = parseInt(newAppointment.client, 10);
        const selectedClient = clients.find(c => c.id === clientId) || {};
    
        if (!selectedClient) {
            alert("❌ Error: Selected client not found!");
            return;
        }
    
        const {
            title,
            date,
            time,
            endTime,
            description,
            recurrence = '',
            occurrences = 1,
            weekdays = []
        } = newAppointment;
    const safeTime = time ? String(time) : "";
const safeEndTime = endTime ? String(endTime) : "";

        const baseAppointment = {
  title,
  client_id: clientId,
  client_name: selectedClient.full_name || 'Unknown',
  client_email: selectedClient.email || 'Unknown',
  time: safeTime,
  end_time: safeEndTime,
  description,
  isAdmin: true,
  recurrence,
  occurrences,
  weekdays,
  date,
};

    
        try {
            if (editingAppointment) {
                // PATCH existing appointment
                const patchBody = {
  title,
  description,
  date,
  time: safeTime,
  end_time: safeEndTime,
  client_id: clientId
};

    
                const response = await axios.patch(`${apiUrl}/appointments/${editingAppointment.id}`, patchBody);
                alert(`✅ Appointment updated successfully!`);
    
                // Update local state
                setAppointments(prev =>
                    prev.map(appt => appt.id === editingAppointment.id ? response.data : appt)
                );
            } else {
                // POST new appointment(s)
                const response = await axios.post(`${apiUrl}/appointments`, baseAppointment);
                alert(`✅ ${response.data.appointments.length} appointment(s) added successfully!`);
                setAppointments([...appointments, ...response.data.appointments]);
            }
    
            // Reset form
            setNewAppointment({ 
                title: '', 
                client: '', 
                date: '', 
                time: '', 
                endTime: '', 
                description: '',
                recurrence: '',
                occurrences: 1,
                weekdays: [],
            });
            setEditingAppointment(null);
            setShowAppointmentModal(false);
        } catch (err) {
            console.error("❌ Error saving appointment:", err);
            alert('Error saving appointment.');
        }
    };
    
    const handleDrop = async (e, newDate, newHour) => {
        const appointmentId = e.dataTransfer.getData('appointmentId');
        if (!appointmentId) return;
      
        try {
          const appt = appointments.find((a) => a.id === parseInt(appointmentId, 10));
          if (!appt) return;
      
          const formattedNewTime = `${newHour.toString().padStart(2, '0')}:00`;
      
          await axios.patch(`${apiUrl}/appointments/${appt.id}`, {
            title: appt.title,
            description: appt.description,
            date: newDate,
            time: formattedNewTime,
            end_time: appt.end_time,
            client_id: appt.client_id,
          });
      
          // After update, re-fetch appointments
          const res = await axios.get(`${apiUrl}/appointments`);
          const updatedAppointments = res.data.map((a) => ({
            ...a,
            date: new Date(a.date).toISOString().split('T')[0]
          }));
      
          setAppointments(updatedAppointments);
        } catch (error) {
          console.error("Error during drag and drop update:", error);
          alert('Error moving appointment.');
        }
      };     
    
    const handleBlockTime = async () => {
        if (!blockDate || !blockStartTime || !blockDuration || !blockLabel) {
            alert("⚠️ Please fill in all fields.");
            return;
        }
    
        let [startHour, startMinutes] = blockStartTime.split(":").map(Number);
        const startTime = `${startHour.toString().padStart(2, "0")}:${startMinutes.toString().padStart(2, "0")}`;
        
        // Calculate end time based on duration
        let endHour = startHour;
        let endMinutes = startMinutes + Math.round(blockDuration * 60); 
    
        while (endMinutes >= 60) {
            endMinutes -= 60;
            endHour++;
        }
    
        const endTime = `${endHour.toString().padStart(2, "0")}:${endMinutes.toString().padStart(2, "0")}`;
    
        const blockedTimeEntry = {
            timeSlot: `${blockDate}-${startTime}`, // Store only the start time
            label: `${blockLabel} (${blockDuration} hours)`, // Store duration in label
            date: blockDate,
            duration: blockDuration, // Explicitly store duration
        };
    
        try {
            const response = await axios.post(`${apiUrl}/api/schedule/block`, { blockedTimes: [blockedTimeEntry] });
    
            if (response.data.success) {
                console.log("✅ Blocked time successfully posted:", response.data);
                setBlockedTimes(prev => [...prev.filter(bt => bt.date !== blockDate), blockedTimeEntry]);
            } else {
                console.error("❌ Failed to post blocked time:", response.data);
            }
    
            setShowBlockModal(false);
            setBlockDate('');
            setBlockStartTime('');
            setBlockDuration(1);
            setBlockLabel('');
        } catch (error) {
            console.error("❌ Error posting blocked time:", error);
        }
    };
    
    const handleEditAppointment = (appointment) => {
        setEditingAppointment(appointment);
        setNewAppointment({
            title: appointment.title,
            client: appointment.client_id,
            date:  new Date(appointment.date).toISOString().split('T')[0], // Format to YYYY-MM-DD
            time: appointment.time,
            endTime: appointment.end_time,
            description: appointment.description,
            recurrence: '',
            occurrences: 1,
            weekdays: [],
        });
        setShowAppointmentModal(true);
    };

    const handleDeleteAppointment = (appointmentId) => {
        if (window.confirm('Are you sure you want to delete this appointment?')) {
            axios.delete(`${apiUrl}/appointments/${appointmentId}`, {
                headers: {
                    'Content-Type': 'application/json',
                },
            })
            .then(() => {
                alert('Appointment deleted successfully!');
                setAppointments((prev) =>
                    prev.filter((appt) => appt.id !== appointmentId)
                );
            })
            .catch((err) => alert('Error deleting appointment:', err));
        }
    };

    const handleDeleteBlockedTime = async (blocked) => {
        if (window.confirm(`Are you sure you want to remove the blocked time at ${formatTime(blocked.timeSlot.split('-').pop())}?`)) {
            try {
                await axios.delete(`${apiUrl}/api/schedule/block`, { data: { timeSlot: blocked.timeSlot, date: blocked.date } });
    
                setBlockedTimes(prev => prev.filter(bt => !(bt.timeSlot === blocked.timeSlot && bt.date === blocked.date)));
                console.log(`✅ Blocked time removed: ${blocked.timeSlot} on ${blocked.date}`);
            } catch (error) {
                console.error("❌ Error deleting blocked time:", error);
                alert("Failed to delete blocked time.");
            }
        }
    };
    
    const getTileContent = ({ date }) => {
        const formatDate = (d) => new Date(d).toISOString().split('T')[0];
        const calendarDate = formatDate(date);

        const appointmentsOnDate = appointments.filter((appointment) => formatDate(appointment.date) === calendarDate);

        return (
            <div>
                {appointmentsOnDate.length > 0 && (
                    <span style={{ color: 'purple' }}>{appointmentsOnDate.length} Appointment(s)</span>
                )}
            </div>
        );
    };

    
    const goToPreviousWeek = () => {
        setSelectedDate((prevDate) => {
            const newDate = new Date(prevDate);
            newDate.setDate(newDate.getDate() - 7); // Move back 7 days
            return newDate;
        });
    };
    
    const goToNextWeek = () => {
        setSelectedDate((prevDate) => {
            const newDate = new Date(prevDate);
            newDate.setDate(newDate.getDate() + 7); // Move forward 7 days
            return newDate;
        });
    };
    
    const weekView = () => {
        console.log("Appointments:", appointments); // Log the full appointments array

        const startOfWeek = new Date(selectedDate);
        startOfWeek.setDate(selectedDate.getDate() - selectedDate.getDay()); // Start on Sunday
        startOfWeek.setHours(0, 0, 0, 0); // Ensure time is midnight

        const hours = Array.from({ length: 15 }, (_, i) => i+8); // Generate hours: 8am–10pm
        const weekDates = Array.from({ length: 7 }, (_, i) => {
            const day = new Date(startOfWeek);
            day.setDate(startOfWeek.getDate() + i);
            return day;
        });
    
        const formatHour = (hour) => {
            const period = hour < 12 ? 'AM' : 'PM';
            const formattedHour = hour % 12 === 0 ? 12 : hour % 12;
            return `${formattedHour}:00 ${period}`;
        };
    
        const now = new Date();
        const currentDay = now.toLocaleDateString('en-CA'); // Outputs YYYY-MM-DD in local timezone
        const currentHour = now.getHours(); // Current hour (0–23)
        const currentMinutes = now.getMinutes(); // Current minutes (0–59)
    
        return (
            <div className="week-view">
                <div className="week-navigation">
                    <button onClick={goToPreviousWeek}>&lt; Previous Week</button>
                    <h3>{`Week of ${weekDates[0].toDateString()} - ${weekDates[6].toDateString()}`}</h3>
                    <button onClick={goToNextWeek}>Next Week &gt;</button>
                </div>
                <table>
                    <thead>
                        <tr>
                            <th>Time</th>
                            {weekDates.map((date, i) => (
                                <th 
                                    key={i}
                                    onClick={() => setSelectedDate(date)} // Update selectedDate on click
                                    style={{ cursor: 'pointer', textAlign: 'center' }} // Add pointer cursor for clarity
                                >
                                    <div style={{ textAlign: 'center' }}>
                                        {date.toLocaleDateString('en-US', { weekday: 'short' })}
                                        <br />
                                        {date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                                    </div>
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {hours.map((hour) => (
                            <tr key={hour}>
                                <td>{formatHour(hour)}</td>
                                {weekDates.map((date, dayIndex) => {
                                    const dayString = date.toISOString().split('T')[0];
                                    const holiday = holidays.find(h => h.date === dayString);

                                    // Filter appointments for this hour
                                    const appointmentsAtTime = appointments.filter((appointment) => {
                                        const normalizedDate = new Date(appointment.date).toISOString().split('T')[0];
                                        const [appointmentHour] = appointment.time.split(':').map(Number);
                                        return (
                                            normalizedDate === dayString &&
                                            appointmentHour === hour
                                        );
                                    });
                                    
                                    const blockedEntriesAtTime = blockedTimes.map((b) => {
                                        const [startHour, startMinutes] = b.timeSlot.split('-').pop().split(':').map(Number);
                                    
                                        // Extract duration from label (e.g., "test (1 hours)")
                                        let durationMatch = b.label.match(/\((\d+(\.\d+)?)\s*hours?\)/i);
                                        let duration = durationMatch ? parseFloat(durationMatch[1]) : 1; // Default to 1 hour if missing
                                    
                                        return {
                                            ...b,
                                            startHour,
                                            startMinutes: startMinutes || 0, // Ensure minutes are set
                                            duration, // Use extracted duration
                                        };
                                    }).filter(b => b.date === dayString && b.startHour === hour);
                                    
                                    return (
                                        <td
                                            key={dayIndex}
                                            className="time-slot"
                                            style={{ position: 'relative', verticalAlign: 'top', height: '30px', cursor: 'pointer' }}
                                            onClick={() => {
                                                setNewAppointment({
                                                    title: '',
                                                    client: '',
                                                    date: dayString,
                                                    time: `${hour.toString().padStart(2, '0')}:00`,
                                                    endTime: '',
                                                    description: '',
                                                    recurrence: '',
                                                    occurrences: 1,
                                                    weekdays: [],
                                                });
                                                setEditingAppointment(null);
                                                setShowAppointmentModal(true);
                                            }}
                                            onDragOver={(e) => e.preventDefault()} // <<< ⭐ ALLOW DROP
                                            onDrop={(e) => handleDrop(e, dayString, hour)} // <<< ⭐ HANDLE DROP
                                        >
                                            {/* Render blocked slots exactly like appointments */}
                                            {blockedEntriesAtTime.map((blocked, index) => {
                                                const [startHour, startMinutes] = blocked.timeSlot.split('-').pop().split(':').map(Number);
                                                const blockTop = (startMinutes / 60) * 100; // Align inside the hour
                                                const blockHeight = blocked.duration * 100; // Each hour = 100% of the row height
                                        
                                                return (
                                                    <div
                                                        key={index}
                                                        className="blocked-indicator"
                                                        style={{
                                                            position: 'absolute',
                                                            top: `${blockTop}%`, 
                                                            left: 0,
                                                            right: 0,
                                                            height: `${blockHeight}%`, 
                                                            backgroundColor: '#d3d3d3',
                                                            textAlign: 'center',
                                                            fontWeight: 'bold',
                                                            display: 'flex',
                                                            alignItems: 'center',
                                                            justifyContent: 'center',
                                                        }}
                                                    >
                                                        {blocked.label || "Blocked"}
                                                    </div>
                                                );
                                            })}

                                            {/* Render the red line for the current time */}
                                            {currentDay === dayString && currentHour === hour && (
                                                <div
                                                    style={{
                                                        position: 'absolute',
                                                        top: `${(currentMinutes / 60) * 100}%`,
                                                        left: 0,
                                                        right: 0,
                                                        height: '2px',
                                                        backgroundColor: 'red',
                                                        zIndex: 10,
                                                    }}
                                                />
                                            )}
                                            <div>
                                                
                                                {/* Render appointments */}
                                                {appointmentsAtTime.map((appointment, index) => {
                                                    const startTime = new Date(`${appointment.date}T${appointment.time}`);
                                                    const endTime = new Date(`${appointment.date}T${appointment.end_time}`);
                                                    const durationInMinutes = (endTime - startTime) / (1000 * 60); // Duration in minutes
                                                    const startMinutes = startTime.getMinutes();
                                                    const topPercentage = (startMinutes / 60) * 100; // Calculate top offset

                                                    return (
                                                        <div
                                                            key={appointment.id}
                                                            className={`event appointment ${index > 0 ? 'overlapping' : ''}`}
                                                            draggable
                                                            onDragStart={(e) => {
                                                                e.dataTransfer.setData('appointmentId', appointment.id);
                                                            }}
                                                            style={{
                                                                position: 'absolute',
                                                                top: `${topPercentage}%`,
                                                                height: `${(durationInMinutes / 60) * 100}%`,
                                                                padding: '2px',
                                                                cursor: 'grab', // show hand cursor
                                                            }}
                                                        >

{clients.find((c) => Number(c.id) === Number(appointment.client_id))?.full_name || 'Unknown'} - {appointment.title}
                                                            {appointment.title}
                                                        </div>
                                                    );
                                                })}
                                                {hour ===9 && holiday && (
                                                    <div
                                                    style={{
                                                        backgroundColor: '#ffe6e6',
                                                        color: '#990000',
                                                        fontWeight: 'bold',
                                                        textAlign: 'center',
                                                        padding: '2px',
                                                    }}
                                                    >
                                                    🎉 {holiday.name}
                                                    </div>
                                                )}
                                            </div>  
                                       </td>
                                    );
                                })}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        );
    };

    return (
        <div>
            <h2>Scheduling Page</h2>
            
            {weekView()}

            <h3>Selected Date: {selectedDate.toDateString()}</h3>
                <div className="week-view">
                    {appointments
                        .filter((appointment) => {
                            const formatDate = (d) => new Date(d).toISOString().split('T')[0];
                            return formatDate(appointment.date) === selectedDate.toISOString().split('T')[0];
                        })
                        .map((appointment) => (
                            <div key={appointment.id} className="appointment-card">
                                <strong>Title:</strong> {appointment.title} <br />
                                <strong>Client:</strong>{" "}
                                {clients?.length > 0 && appointment.client_id
                                ? (clients.find(client => Number(client.id) === Number(appointment.client_id))?.full_name || 'N/A')
                                : 'N/A'}<br />
                                <strong>Time:</strong> {formatTime(appointment.time)} - {formatTime(appointment.end_time)} <br />
                                <strong>Description:</strong> {appointment.description} <br />
                                <br></br>
                                <button onClick={() => handleEditAppointment(appointment)}>Edit</button>
                                <button onClick={() => handleDeleteAppointment(appointment.id)}>Delete</button>
                            </div>
                        ))}
                </div>
                {/* Display Blocked Times for Selected Date */}
                <div className="blocked-time-container">
                    {blockedTimes
                        .filter(blocked => {
                            const blockedDate = new Date(blocked.date).toISOString().split('T')[0]; // Ensure comparison is valid
                            const selectedDateFormatted = selectedDate.toISOString().split('T')[0];
                            return blockedDate === selectedDateFormatted;
                        })
                        .map((blocked) => (
                            <div key={blocked.timeSlot} className="appointment-card">
                                <strong>Blocked Time:</strong> {formatTime(blocked.timeSlot.split('-').pop())} <br />
                                <strong>Reason:</strong> {blocked.label} <br />
                                <button onClick={() => handleDeleteBlockedTime(blocked)}>Delete</button>
                            </div>
                        ))}
                </div>

                {/* Floating + button now opens options modal (like Ready Portal) */}
                <button 
                    style={{
                        position: 'fixed',
                        bottom: '20px',
                        right: '20px',
                        backgroundColor: '#8B0000', 
                        color: 'white',
                        borderRadius: '50%',
                        width: '50px',
                        height: '50px',
                        fontSize: '24px',
                        cursor: 'pointer',
                        border: 'none'
                    }}
                    onClick={() => setShowPlusOptionsModal(true)}
                >
                    +
                </button>

                {/* Plus options modal: Add Appointment / Block Time */}
                {showPlusOptionsModal && (
                    <div className="modal">
                        <div className="modal-content">
                            <h3>What would you like to do?</h3>
                            <button
                                onClick={() => {
                                    setShowPlusOptionsModal(false);
                                    setShowAppointmentModal(true);
                                    setEditingAppointment(null);
                                    setNewAppointment({
                                        title: '',
                                        client: '',
                                        date: selectedDate.toISOString().split('T')[0],
                                        time: '',
                                        endTime: '',
                                        description: '',
                                        recurrence: '',
                                        occurrences: 1,
                                        weekdays: [],
                                    });
                                }}
                            >
                                ➕ Add Appointment
                            </button>
                            <button
                                style={{ marginTop: '10px' }}
                                onClick={() => {
                                    setShowPlusOptionsModal(false);
                                    setShowBlockModal(true);
                                    setBlockDate(selectedDate.toISOString().split('T')[0]);
                                }}
                            >
                                🚫 Block Time
                            </button>
                            <button
                                style={{ marginTop: '20px', color: 'gray' }}
                                onClick={() => setShowPlusOptionsModal(false)}
                            >
                                Cancel
                            </button>
                        </div>
                    </div>
                )}

                {showBlockModal && (
                    <div className="modal">
                        <div className="modal-content">
                            <h3>Block Time Slot</h3>
                            <label>Select Date:</label>
                            <input type="date" value={blockDate} onChange={(e) => setBlockDate(e.target.value)} />

                            <label>Start Time:</label>
                            <input type="time" value={blockStartTime} onChange={(e) => setBlockStartTime(e.target.value)} />

                            <label>Duration (Hours):</label>
                            <input type="number" min="1" value={blockDuration} onChange={(e) => setBlockDuration(e.target.value)} />

                            <label>Reason:</label>
                            <input type="text" value={blockLabel} onChange={(e) => setBlockLabel(e.target.value)} />

                            <button onClick={handleBlockTime}>Block Time</button>
                            <button onClick={() => setShowBlockModal(false)}>Cancel</button>
                        </div>
                    </div>
                )}

                {showAppointmentModal && (
                    <div className="modal">
                        <div className="modal-content">
                        {/* Appointment form */}
                        <h3>{editingAppointment ? 'Edit Appointment' : 'Add Appointment'}</h3>
                        <form onSubmit={handleAddOrUpdateAppointment}>
                            <label>
                            Title:
                            <select
                                value={newAppointment.title}
                                onChange={(e) => {
                                const selectedType = appointmentTypes.find((type) => type.title === e.target.value);
                                setNewAppointment({
                                    ...newAppointment,
                                    title: selectedType?.title || '',
                                    category: selectedType?.category || '',
                                });
                                }}
                                required
                            >
                                <option value="" disabled>Select an Appointment Type</option>
                                {appointmentTypes.map((type, index) => (
                                <option key={index} value={type.title}>
                                    {type.title}
                                </option>
                                ))}
                            </select>
                            </label>

                            <label>
                            Client:
                            <select
                                value={newAppointment.client}
                                onChange={(e) => setNewAppointment({ ...newAppointment, client: e.target.value })}
                                required
                            >
                                <option value="" disabled>Select a Client</option>
                                {clients.map((client) => (
                                <option key={client.id} value={client.id}>
                                    {client.full_name}
                                </option>
                                ))}
                            </select>
                            </label>

                            <label>
                            Date:
                            <input
                                type="date"
                                value={newAppointment.date || ''}
                                onChange={(e) => setNewAppointment({ ...newAppointment, date: e.target.value })}
                                required
                            />
                            </label>

                            <label>
                            Time:
                            <input
                                type="time"
                                value={newAppointment.time}
                                onChange={(e) => setNewAppointment({ ...newAppointment, time: e.target.value })}
                                required
                            />
                            </label>

                            <label>
                            End Time:
                            <input
                                type="time"
                                value={newAppointment.endTime}
                                onChange={(e) => setNewAppointment({ ...newAppointment, endTime: e.target.value })}
                            />
                            </label>

                            <label>
                            Repeat:
                            <select
                                value={newAppointment.recurrence || ''}
                                onChange={(e) => setNewAppointment({ ...newAppointment, recurrence: e.target.value })}
                            >
                                <option value="">None</option>
                                <option value="weekly">Weekly</option>
                                <option value="biweekly">Biweekly</option>
                                <option value="monthly">Monthly</option>
                            </select>
                            </label>

                            {newAppointment.recurrence && (
                            <>
                                <label>
                                Occurrences:
                                <input
                                    type="number"
                                    min="1"
                                    value={newAppointment.occurrences || 1}
                                    onChange={(e) => setNewAppointment({ ...newAppointment, occurrences: parseInt(e.target.value) })}
                                />
                                </label>

                                {(newAppointment.recurrence === 'weekly' || newAppointment.recurrence === 'biweekly') && (
                                <div>
                                    <label>Select days:</label>
                                    <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                                    {['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].map((day) => (
                                        <label key={day}>
                                        <input
                                            type="checkbox"
                                            checked={newAppointment.weekdays?.includes(day) || false}
                                            onChange={(e) => {
                                            const checked = e.target.checked;
                                            const updated = new Set(newAppointment.weekdays || []);
                                            checked ? updated.add(day) : updated.delete(day);
                                            setNewAppointment({ ...newAppointment, weekdays: Array.from(updated) });
                                            }}
                                        />
                                        {day.slice(0, 3)}
                                        </label>
                                    ))}
                                    </div>
                                </div>
                                )}
                            </>
                            )}

                            <label>
                            Description:
                            <textarea
                                value={newAppointment.description}
                                onChange={(e) => setNewAppointment({ ...newAppointment, description: e.target.value })}
                            />
                            </label>

                            <button type="submit">{editingAppointment ? 'Update Appointment' : 'Add Appointment'}</button>
                            <button
                            type="button"
                            onClick={() => setShowAppointmentModal(false)}
                            style={{ marginLeft: '10px' }}
                            >
                            Cancel
                            </button>
                        </form>
                        </div>
                    </div>
                    )}

        </div>
    );
};

export default SchedulingPage;
