import React from "react";
import { Link } from "react-router-dom";
import "../../WelcomePage.css";

const WelcomePage = () => {
    return (
        <div className="welcome-page">
            <div className="welcome-overlay">

                {/* HERO */}
                <div className="welcome-hero">
                    <h1>Welcome to STEM with Lyn</h1>

                    <p>
                        Empowering students through tutoring, technology,
                        engineering, and scholarship opportunities.
                    </p>
                </div>

                {/* MAIN BUTTONS */}
                <div className="welcome-buttons">

                    {/* Tutoring */}
                    <Link
                        to="/tutoring-intake"
                        style={{ textDecoration: "none" }}
                    >
                        <div className="bubble-button">
                            <span>🧠</span>
                            <p>Tutoring</p>
                        </div>
                    </Link>

                    {/* Tech */}
                    <Link
                        to="/tech-engineering"
                        style={{ textDecoration: "none" }}
                    >
                        <div className="bubble-button">
                            <span>⚙️</span>
                            <p>Tech & Engineering</p>
                        </div>
                    </Link>

                    {/* Scholarships */}
                    <Link
                        to="/scholarships"
                        style={{ textDecoration: "none" }}
                    >
                        <div className="bubble-button featured-bubble">
                            <span>🎓</span>
                            <p>Scholarships & Funding</p>
                        </div>
                    </Link>

                </div>

                {/* INFO CARDS */}
                <div className="welcome-info-grid">

                    <div className="welcome-card">
                        <h3>📚 Academic Support</h3>

                        <p>
                            Personalized STEM tutoring designed to help
                            students build confidence, improve grades,
                            and close learning gaps.
                        </p>
                    </div>

                    <div className="welcome-card">
                        <h3>💻 Tech Opportunities</h3>

                        <p>
                            Explore coding, robotics, engineering,
                            technology, and future STEM career pathways.
                        </p>
                    </div>

                    <div className="welcome-card">
                        <h3>🎓 Scholarship Help</h3>

                        <p>
                            Learn about Step Up For Students and
                            Epic Foundation scholarship opportunities
                            available for eligible students.
                        </p>
                    </div>

                </div>

            </div>
        </div>
    );
};

export default WelcomePage;