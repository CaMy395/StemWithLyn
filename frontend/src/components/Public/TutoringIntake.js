import React, { useState } from "react";
import "../../TutoringIntake.css";
import { useNavigate } from "react-router-dom";

const TutoringIntakeForm = () => {
  const navigate = useNavigate();

  const [formData, setFormData] = useState({
    fullName: "",
    email: "",
    phone: "",
    haveBooked: "",
    whyHelp: "",
    learnDisable: "",
    whatDisable: "",
    age: "",
    grade: "",
    subject: "",
    mathSubject: "",
    scienceSubject: "",
    currentGrade: "",
    additionalDetails: "",
  });

  const handleChange = (e) => {
    const { name, value } = e.target;

    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));

    if (name === "haveBooked" && value === "yes") {
      navigate("/client-scheduling");
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    const apiBase =
      process.env.NODE_ENV === "production"
        ? ""
        : process.env.REACT_APP_API_URL || "http://localhost:3001";

    try {
      const response = await fetch(`${apiBase}/api/tutoring-intake`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });

      if (!response.ok) {
        const txt = await response.text();
        console.error("Tutoring intake failed:", response.status, txt);
        throw new Error(txt || "Failed to submit the form");
      }

      alert("Form submitted successfully!");

      const urlParams = new URLSearchParams();
      if (formData.fullName) urlParams.append("name", formData.fullName);
      if (formData.email) urlParams.append("email", formData.email);
      if (formData.phone) urlParams.append("phone", formData.phone);

      navigate(`/client-scheduling?${urlParams.toString()}`);
    } catch (error) {
      console.error("Error submitting form:", error);
      alert("An error occurred while submitting the form. Please try again.");
    }
  };

  return (
    <div className="tutoring-intake-page">
      <div className="tutoring-intake-overlay">
        <div className="intake-form-container">
          <div className="intake-header">
            <span className="intake-pill">STEM with Lyn</span>
            <h1>Tutoring Intake Form</h1>
            <p>
              Tell me a little about the student so I can match the support to
              their needs.
            </p>
            <p className="intake-subtext">
              After submitting, you’ll be directed to the scheduling page.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="intake-form">
            <label>
              Have you booked before? *
              <select
                name="haveBooked"
                value={formData.haveBooked}
                onChange={handleChange}
                required
              >
                <option value="">Select</option>
                <option value="yes">Yes</option>
                <option value="no">No</option>
              </select>
            </label>

            {formData.haveBooked === "no" && (
              <>
                <div className="form-row">
                  <label>
                    Full Name *
                    <input
                      type="text"
                      name="fullName"
                      value={formData.fullName}
                      onChange={handleChange}
                      required
                    />
                  </label>

                  <label>
                    Email of Student *
                    <input
                      type="email"
                      name="email"
                      value={formData.email}
                      onChange={handleChange}
                      required
                    />
                  </label>
                </div>

                <label>
                  Phone *
                  <input
                    type="tel"
                    name="phone"
                    value={formData.phone}
                    onChange={handleChange}
                    required
                  />
                </label>

                <label>
                  Why do you need help? *
                  <textarea
                    name="whyHelp"
                    value={formData.whyHelp}
                    onChange={handleChange}
                    placeholder="Ex: homework help, test prep, grades dropping, foundations, etc."
                    rows="4"
                    required
                  />
                </label>

                <div className="form-row">
                  <label>
                    Does the student have a learning disability? *
                    <select
                      name="learnDisable"
                      value={formData.learnDisable}
                      onChange={handleChange}
                      required
                    >
                      <option value="">Select</option>
                      <option value="yes">Yes</option>
                      <option value="no">No</option>
                    </select>
                  </label>

                  <label>
                    Student Age *
                    <input
                      type="number"
                      name="age"
                      value={formData.age}
                      onChange={handleChange}
                      required
                    />
                  </label>
                </div>

                {formData.learnDisable === "yes" && (
                  <label>
                    If so, what is their disability? *
                    <input
                      type="text"
                      name="whatDisable"
                      value={formData.whatDisable}
                      onChange={handleChange}
                      required
                    />
                  </label>
                )}

                <div className="form-row">
                  <label>
                    What grade is the student? *
                    <input
                      type="text"
                      name="grade"
                      value={formData.grade}
                      onChange={handleChange}
                      required
                    />
                  </label>

                  <label>
                    Subject help needed? *
                    <select
                      name="subject"
                      value={formData.subject}
                      onChange={handleChange}
                      required
                    >
                      <option value="">Select</option>
                      <option value="Math">Math</option>
                      <option value="Science">Science</option>
                      <option value="Reading">Reading</option>
                      <option value="Writing">Writing</option>
                      <option value="Other">Other</option>
                    </select>
                  </label>
                </div>

                {formData.subject === "Math" && (
                  <label>
                    If Math, what subject? *
                    <select
                      name="mathSubject"
                      value={formData.mathSubject}
                      onChange={handleChange}
                      required
                    >
                      <option value="">Select</option>
                      <option value="Elementary Math">Elementary Math</option>
                      <option value="Math 7">Math 7</option>
                      <option value="Pre-Algebra">Pre-Algebra</option>
                      <option value="Algebra 1">Algebra 1</option>
                      <option value="Algebra 2">Algebra 2</option>
                      <option value="Geometry">Geometry</option>
                      <option value="Trig/Pre-Calc">Trig/Pre-Calc</option>
                      <option value="Calculus">Calculus</option>
                    </select>
                  </label>
                )}

                {formData.subject === "Science" && (
                  <label>
                    If Science, what subject? *
                    <select
                      name="scienceSubject"
                      value={formData.scienceSubject}
                      onChange={handleChange}
                      required
                    >
                      <option value="">Select</option>
                      <option value="Physical">Physical</option>
                      <option value="Physics">Physics</option>
                      <option value="Chemistry">Chemistry</option>
                    </select>
                  </label>
                )}

                <label>
                  Current grade in this subject? *
                  <input
                    type="text"
                    name="currentGrade"
                    value={formData.currentGrade}
                    onChange={handleChange}
                    required
                  />
                </label>

                <label>
                  Additional Details
                  <textarea
                    name="additionalDetails"
                    value={formData.additionalDetails}
                    onChange={handleChange}
                    placeholder="Student name, preferred schedule, goals, concerns, etc."
                    rows="4"
                  />
                </label>
              </>
            )}

            <button type="submit" className="intake-submit-btn">
              Continue to Scheduling
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};

export default TutoringIntakeForm;