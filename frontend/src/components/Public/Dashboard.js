import React, { useState } from 'react';
import '../../App.css'; // Ensure your CSS file includes the .tutoring-intake-form styles
import { useNavigate } from 'react-router-dom';

const TutoringIntakeForm = () => {
    const navigate = useNavigate(); // Initialize navigate
    const [formData, setFormData] = useState({
        fullName: '',
        email: '',
        phone: '',
        haveBooked: '',
        whyHelp: '',
        learnDisable: '',
        whatDisable: '',
        age: '',
        grade: '',
        subject: '',
        mathSubject: '',
        scienceSubject: '',
        currentGrade: '',
        paymentMethod: '',
    });

    const handleChange = (e) => {
        const { name, value } = e.target;
        setFormData((prev) => ({ ...prev, [name]: value }));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        const apiUrl = process.env.REACT_APP_API_URL || 'http://localhost:3001';
        try {
            const response = await fetch(`${apiUrl}/api/tutoring-intake`, {
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
                    whyHelp: '',
                    learnDisable: '',
                    whatDisable: '',
                    age: '',
                    grade: '',
                    subject: '',
                    mathSubject: '',
                    scienceSubject: '',
                    currentGrade: '',
                    paymentMethod: '',
                });
            } else {
                throw new Error('Failed to submit the form');
            }
            navigate('/rb/client-scheduling'); // Replace with the correct route
        } catch (error) {
            console.error('Error submitting form:', error);
            alert('An error occurred while submitting the form. Please try again.');
        }
    };

    return (
        <div className="tutoring-intake-form">
            <div className="intake-form-container">
                <h1>Tutoring Intake Form</h1>
                <p>Please tell us a little about you or your child so I can help !</p>
                <p> Once this form is completed we will get back to you for scheduling details.</p>
                <form onSubmit={handleSubmit}>
                    {/* Full Name */}
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

                    {/* Have You Booked Before */}
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

                    {/* Questions for 'No' */}
                    {formData.haveBooked === 'no' && (
                        <>
                            {/* Email */}
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

                            {/* Phone */}
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

                            {/* Learning Disability */}
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

                            {formData.learnDisable === 'yes' && (
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

                            {/* Age */}
                            <label>
                                How old is the person in need of help? *
                                <input
                                    type="number"
                                    name="age"
                                    value={formData.age}
                                    onChange={handleChange}
                                    required
                                />
                            </label>

                            {/* Grade */}
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

                            {/* Subject Help */}
                            <label>
                                What subject help is needed? *
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
                                </select>
                            </label>

                            {formData.subject === 'Math' && (
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

                            {formData.subject === 'Science' && (
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
                        </>
                    )}

                    {/* Current Grade */}
                    <label>
                                What grade do you have in this subject? *
                                <input
                                    type="text"
                                    name="currentGrade"
                                    value={formData.currentGrade}
                                    onChange={handleChange}
                                    required
                                />
                    </label>


                    {/* Which Service Would You Like to Book */}
                    <label>
                        Which service would you like to book? *
                        <select
                            name="whyHelp"
                            value={formData.whyHelp}
                            onChange={handleChange}
                            required
                        >
                            <option value="">Select</option>
                            <option value="Virtual Tutoring (1 hour)">Virtual Tutoring (1 hour @ $52.00)</option>
                            <option value="Virtual Tutoring Package (6 sessions)">Virtual Tutoring Package (6 sessions @ $280.00)</option>
                            <option value="Virtual Tutoring Package (10 sessions)">Virtual Tutoring Package (10 sessions @ $465.00)</option>
                            <option value="In-Person Tutoring (1 hour)">In-Person Tutoring (1 hour @ $67.00)</option>
                            <option value="In-Person Tutoring (6 sessions)">In-Person Tutoring (6 sessions @ $370.00)</option>
                            <option value="In-Person Tutoring (10 sessions)">In-Person Tutoring (10 sessions @ $620.00)</option>
                            <option value="Third Party Organization - (UM)">United Mentors Organization</option>
                        </select>
                    </label>

                    {/* Payment Method */}
                    <label>
                        How will you be paying? *
                        <select
                            name="paymentMethod"
                            value={formData.paymentMethod} // Bind the array from state
                            onChange={handleChange}
                            required
                        >
                            <option value="">Select</option>
                            <option value="Square">Square - Payment Link</option>
                            <option value="Zelle">Zelle</option>
                            <option value="Cashapp">Cashapp</option>
                        </select>
                    </label>

                    {/* Additional Details */}
                    <label>
                        Additional Details
                        <textarea
                            name="additionalDetails"
                            value={formData.additionalDetails}
                            onChange={handleChange}
                            placeholder="Provide extra details like the student's name, preferred schedule, etc."
                            rows="4"
                            cols="50"
                        ></textarea>
                    </label>

                    {/* Submit Button */}
                    <button type="submit">Submit</button>
                </form>
            </div>
        </div>
    );
};

export default TutoringIntakeForm;
