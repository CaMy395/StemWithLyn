import React, { useState } from 'react';
import '../../App.css';
import { useNavigate } from 'react-router-dom';

const TechIntakeForm = () => {
    const navigate = useNavigate();
    const [formData, setFormData] = useState({
        fullName: '',
        email: '',
        phone: '',
        haveBooked: '',
        helpType: '',
        platform: '',
        experienceLevel: '',
        deadline: '',
        paymentMethod: '',
        additionalDetails: '',
    });

    const handleChange = (e) => {
        const { name, value } = e.target;
        setFormData((prev) => ({ ...prev, [name]: value }));

        if (name === "haveBooked" && value === "yes") {
            navigate("/client-scheduling");
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        const apiUrl = process.env.REACT_APP_API_URL || 'http://localhost:3001';
        try {
            const response = await fetch(`${apiUrl}/api/tech-intake`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(formData),
            });

            if (response.ok) {
                alert('Form submitted successfully!');
                setFormData({
                    fullName: '',
                    email: '',
                    phone: '',
                    haveBooked: '',
                    helpType: '',
                    platform: '',
                    experienceLevel: '',
                    deadline: '',
                    paymentMethod: '',
                    additionalDetails: '',
                });

                const urlParams = new URLSearchParams();
                if (formData.fullName) urlParams.append("name", formData.fullName);
                if (formData.email) urlParams.append("email", formData.email);
                if (formData.phone) urlParams.append("phone", formData.phone);
                if (formData.paymentMethod) urlParams.append("paymentMethod", formData.paymentMethod);
                
                urlParams.append("appointmentType", "Developer Consultation (30 min)");
                navigate(`/client-scheduling?${urlParams.toString()}`);

            } else {
                throw new Error('Failed to submit the form');
            }
        } catch (error) {
            console.error('Error submitting form:', error);
            alert('An error occurred while submitting the form. Please try again.');
        }
    };

    return (
        <div className="tutoring-intake-form">
            <div className="intake-form-container">
                <h1>Tech / Engineering Intake Form</h1>
                <p>Please tell us what you're working on or need help with!</p>

                <form onSubmit={handleSubmit}>
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

                    {formData.haveBooked === 'no' && (
                        <>
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
                                Email *
                                <input
                                    type="email"
                                    name="email"
                                    value={formData.email}
                                    onChange={handleChange}
                                    required
                                />
                            </label>

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
                                What do you need help with? *
                                <input
                                    type="text"
                                    name="helpType"
                                    placeholder="e.g., building a website, learning Python"
                                    value={formData.helpType}
                                    onChange={handleChange}
                                    required
                                />
                            </label>

                            <label>
                                Preferred language or platform *
                                <input
                                    type="text"
                                    name="platform"
                                    placeholder="e.g., JavaScript, Python, WordPress"
                                    value={formData.platform}
                                    onChange={handleChange}
                                    required
                                />
                            </label>

                            <label>
                                Your experience level *
                                <select
                                    name="experienceLevel"
                                    value={formData.experienceLevel}
                                    onChange={handleChange}
                                    required
                                >
                                    <option value="">Select</option>
                                    <option value="Beginner">Beginner</option>
                                    <option value="Intermediate">Intermediate</option>
                                    <option value="Advanced">Advanced</option>
                                </select>
                            </label>

                            <label>
                                Project Deadline (if any)
                                <input
                                    type="date"
                                    name="deadline"
                                    value={formData.deadline}
                                    onChange={handleChange}
                                />
                            </label>

                            <label>
                                How will you be paying? *
                                <select
                                    name="paymentMethod"
                                    value={formData.paymentMethod}
                                    onChange={handleChange}
                                    required
                                >
                                    <option value="">Select</option>
                                    <option value="Square">Square - Payment Link</option>
                                    <option value="Zelle">Zelle</option>
                                    <option value="Cashapp">Cashapp</option>
                                </select>
                            </label>

                            <label>
                                Additional Details
                                <textarea
                                    name="additionalDetails"
                                    value={formData.additionalDetails}
                                    onChange={handleChange}
                                    placeholder="Include links to your project, goals, or anything we should know"
                                    rows="4"
                                ></textarea>
                            </label>
                        </>
                    )}

                    <button type="submit">Submit</button>
                </form>
            </div>
        </div>
    );
};

export default TechIntakeForm;
