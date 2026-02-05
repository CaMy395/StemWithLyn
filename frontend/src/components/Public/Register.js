import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import '../../App.css';

const Register = () => {
    const navigate = useNavigate(); // Hook to redirect users
    const [formData, setFormData] = useState({
        name: '',
        username: '',
        email: '',
        phone: '',
        password: '',
        role: 'student',
    });


    const handleChange = (e) => {
        const { name, value } = e.target;
        setFormData((prevData) => ({
            ...prevData,
            [name]: value,
        }));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();

        const apiUrl = process.env.REACT_APP_API_URL ;

        try {
            const response = await fetch(`${apiUrl}/register`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(formData),
            });
            console.log('Form data being submitted:', formData);

            const data = await response.json();

            if (response.ok) {
                console.log('Registration successful:', data);
                // Redirect to login page after successful registration
                navigate('/login'); // Redirects to the login page
            } else {
                console.error('Registration failed:', data.message);
            }
        } catch (error) {
            console.error('Error during registration:', error);
        }
    };


    return (
        <div className="register-page">
            <div className="register-container">
                <form onSubmit={handleSubmit}>
                    <h2>Register</h2>
                    <label>
                        Full Name:
                        <input
                            type="text"
                            name="name"
                            value={formData.name}
                            onChange={handleChange}
                            required
                        />
                    </label>
                    <label>
                        Username:
                        <input
                            type="text"
                            name="username"
                            value={formData.username}
                            onChange={handleChange}
                            required
                        />
                    </label>
                    <label>
                        Email:
                        <input
                            type="email"
                            name="email"
                            value={formData.email}
                            onChange={handleChange}
                            required
                        />
                    </label>
                    <label>
                        Phone:
                        <input
                            type="text"
                            name="phone"
                            value={formData.phone}
                            onChange={handleChange}
                            required
                        />
                    </label>
                    <label>
                        Password:
                        <input
                            type="password"
                            name="password"
                            value={formData.password}
                            onChange={handleChange}
                            required
                        />
                    </label>
                    <label>
                        Role:
                        <select name="role" value={formData.role} onChange={handleChange}>
                            <option value="user">User</option>
                            <option value="student">Student</option>
                        </select>
                    </label>              
                    <button
                        type="submit"
                        style={{
                            backgroundColor: '#8B0000',
                            color: 'white',
                            border: 'none',
                            padding: '10px 20px',
                            borderRadius: '5px',
                            cursor: 'pointer',
                        }}
                    >
                        Register
                    </button>
                </form>
                <p className="link-to-other">
                    Already have an account? <Link to="/login">Login here</Link>
                </p>
            </div>
        </div>
    );
};

export default Register;
