import React from "react";
import { Link } from "react-router-dom";

const WelcomePage = () => {
    return (
        <div className="welcome-page">
            <h1 style={{ color: '#D894D2' }}>Welcome to STEM with Lyn</h1>
            <p>Please choose an option to get started:</p>
    
            <div style={{ display: 'flex', justifyContent: 'center', gap: '50px', marginTop: '50px' }}>
                <Link to="/tutoring-intake" style={{ textDecoration: 'none' }}>
                    <div className="bubble-button">
                        🧠<br />Tutoring
                    </div>
                </Link>
                <Link to="/tech-engineering" style={{ textDecoration: 'none' }}>
                    <div className="bubble-button">
                        ⚙️<br />Tech / Engineering
                    </div>
                </Link>
                <a 
                href="https://epicsouthflorida.org/mentorship" 
                target="_blank" 
                rel="noopener noreferrer"
                style={{ textDecoration: 'none' }}
                >
                <div className="bubble-button">
                    ⚙️<br />Epic Foundation Scholarship
                </div>
                </a>
                <Link to="/login" style={{ textDecoration: 'none' }}>
                    <div className="bubble-button">
                        <br />Login
                    </div>
                </Link>
            </div>
        </div>
    );
    
};

export default WelcomePage;
