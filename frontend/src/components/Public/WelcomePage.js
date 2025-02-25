import React from "react";
import { Link } from "react-router-dom";

const WelcomePage = () => {
    return (
        <div className="welcome-page">
            <h1>Welcome to Our Scheduling App</h1>
            <p>Please choose an option to get started:</p>

            <div className="button-group">
                <Link to="/tutoring-intake">
                    <button>Go to Tutoring Intake</button>
                </Link>
            </div>
        </div>
    );
};

export default WelcomePage;
