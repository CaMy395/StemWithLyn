import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import TermsModal from './TermsModal';
import '../../App.css';

const Register = () => {
    const navigate = useNavigate(); // Hook to redirect users
    const [formData, setFormData] = useState({
        name: '',
        username: '',
        email: '',
        phone: '',
        position: '',
        preferred_payment_method: '',
        payment_details: '',
        password: '',
        role: 'user',
    });

    const [agreeToTerms, setAgreeToTerms] = useState(false);
    const [w9Uploaded, setW9Uploaded] = useState(false); // Track W-9 status
    const [showModal, setShowModal] = useState(false);

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

    useEffect(() => {
        const updateW9Status = () => {
            const isW9Uploaded = localStorage.getItem('w9Uploaded') === 'true';
            setW9Uploaded(isW9Uploaded);
        };

        window.addEventListener('w9StatusUpdated', updateW9Status);

        return () => {
            window.removeEventListener('w9StatusUpdated', updateW9Status);
        };
    }, []);

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
                        Position:
                        <select
                            name="position"
                            value={formData.position}
                            onChange={handleChange}
                            required
                        >
                            <option value="" disabled>Select a position</option>
                            <option value="Bartender">Bartender</option>
                            <option value="Server">Server</option>
                            <option value="Barback">Barback</option>
                        </select>
                    </label>
                    <label>
                        Preferred Payment Method:
                        <select
                            name="preferred_payment_method"
                            value={formData.preferred_payment_method}
                            onChange={handleChange}
                            required
                        >
                            <option value="" disabled>Select a payment method</option>
                            <option value="CashApp">CashApp</option>
                            <option value="Zelle">Zelle</option>
                        </select>
                    </label>
                    <label>
                        Payment Details:
                        <input
                            type="text"
                            name="payment_details"
                            value={formData.payment_details}
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
                            <option value="admin">Admin</option>
                        </select>
                    </label>              
                    <div className="agreement">
                        <input
                            type="checkbox"
                            checked={agreeToTerms}
                            onChange={(e) => setAgreeToTerms(e.target.checked)}
                            disabled={!w9Uploaded} // Disable checkbox until W-9 is uploaded
                        />
                        <span>
                            I agree to the{' '}
                            <Link
                                to="#"
                                className="custom-link"
                                onClick={(e) => {
                                    e.preventDefault(); // Prevent page reload
                                    setShowModal(true); // Show modal
                                }}
                            >
                                Terms and Conditions
                            </Link>
                        </span>
                    </div>
                    <button
                        type="submit"
                        disabled={!agreeToTerms}
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

            {showModal && (
                <TermsModal
                    onClose={() => setShowModal(false)}
                    onW9Upload={(uploaded) => {
                        setW9Uploaded(uploaded);
                        if (uploaded) {
                            localStorage.setItem('w9Uploaded', 'true');
                            window.dispatchEvent(new Event('w9StatusUpdated'));
                        }
                    }}
                />
            )}
        </div>
    );
};

export default Register;
