import { useState } from "react";
import axios from "axios";

const MentorSessionLog = () => {
  const [formData, setFormData] = useState({
    email: "",
    mentorName: "",
    studentName: "",
    date: "",
    time: "",
    duration: "",
    skill: [],
    behavior: "",
    communication: "",
    details: "",
    incident: "",
    progress: "",
    type: "",
    otherDetails: "",
    sessionDetails: "",
    additionalNotes: "",
  });

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    if (type === "checkbox") {
      setFormData((prevData) => ({
        ...prevData,
        [name]: checked
          ? [...prevData[name], value]
          : prevData[name].filter((item) => item !== value),
      }));
    } else {
      setFormData({ ...formData, [name]: value });
    }
  };

  const apiUrl = process.env.REACT_APP_API_URL || 'http://localhost:3001';

  const handleSubmit = async (e) => {
    e.preventDefault();

    try {
        const response = await axios.post(`${apiUrl}/mentors-log`, formData, {
            headers: { "Content-Type": "application/json" }
        });

        alert("Session log submitted and email sent!");

        // ✅ Reset the form after successful submission
        setFormData({
            email: "",
            mentorName: "",
            studentName: "",
            date: "",
            time: "",
            duration: "",
            skill: [],
            behavior: "",
            communication: "",
            details: "",
            incident: "",
            progress: "",
            type: "",
            otherDetails: "",
            sessionDetails: "",
            additionalNotes: "",
        });
    } catch (error) {
        console.error("Error submitting session log:", error.response?.data || error.message);
        alert(`Error: ${error.response?.data?.error || "An error occurred while submitting the session log."}`);
    }
};

  

  return (
    <form onSubmit={handleSubmit}>
      <h2>United Mentors Session Log</h2>
      <label>Email: <input type="email" name="email" onChange={handleChange} required /></label>
      <label>Mentor Name: <input type="text" name="mentorName" onChange={handleChange} required /></label>
      <label>Student Name: <input type="text" name="studentName" onChange={handleChange} required /></label>
      <label>Date: <input type="date" name="date" onChange={handleChange} required /></label>
      <label>Time: <input type="time" name="time" onChange={handleChange} required /></label>
      <label>Duration: <input type="text" name="duration" onChange={handleChange} required /></label>

      <fieldset>
        <legend>Skill:</legend>
        {["Comprehension", "Computation", "Written Expression", "Decoding", "Math Concepts"].map((skill) => (
          <label key={skill}>
            <input type="checkbox" name="skill" value={skill} onChange={handleChange} />
            {skill}
          </label>
        ))}
      </fieldset>

      <label>Behavior:
        <select name="behavior" onChange={handleChange} required>
          <option value="">Select</option>
          <option value="Very Compliant">Very Compliant</option>
          <option value="Compliant">Compliant</option>
          <option value="Non-Compliant">Non-Compliant</option>
          <option value="Unruly">Unruly</option>
        </select>
      </label>

      <label>Communication:
        <select name="communication" onChange={handleChange} required>
          <option value="">Select</option>
          <option value="Parent">Parent</option>
          <option value="Teacher">Teacher</option>
          <option value="Both">Both</option>
        </select>
      </label>

      <label>Incident:
        <select name="incident" onChange={handleChange} required>
          <option value="">Select</option>
          <option value="No Incident">No Incident</option>
          <option value="Minor">Minor</option>
          <option value="Major">Major</option>
        </select>
      </label>

      <label>Progress:
        <select name="progress" onChange={handleChange} required>
          <option value="">Select</option>
          <option value="Achieved">Achieved</option>
          <option value="Still Progressing">Still Progressing</option>
          <option value="No Progress">No Progress</option>
        </select>
      </label>

      <label>Type:
        <select name="type" onChange={handleChange} required>
          <option value="">Select</option>
          <option value="Quiz Prep">Quiz Prep</option>
          <option value="Test Prep">Test Prep</option>
          <option value="Homework">Homework</option>
          <option value="Other">Other</option>
        </select>
      </label>

      {formData.type === "Other" && (
        <label>Other Details: <input type="text" name="otherDetails" onChange={handleChange} /></label>
      )}

      <label>Session Details:
        <textarea name="sessionDetails" onChange={handleChange} required></textarea>
      </label>

      <label>Additional Notes:
        <textarea name="additionalNotes" onChange={handleChange}></textarea>
      </label>

      <button type="submit">Submit</button>
    </form>
  );
};

export default MentorSessionLog;
