import React from "react";
import "../../ScholarshipsPage.css";

const ScholarshipsPage = () => {
  return (
    <div className="scholarships-page">
      <div className="scholarships-overlay">

        <div className="scholarships-hero">
          <span className="hero-pill">
            STEM with Lyn • Funding Resources
          </span>

          <h1>Scholarships & Educational Funding</h1>

          <p>
            Explore programs that may help cover tutoring, educational services,
            technology, STEM learning opportunities, and academic support.
          </p>
        </div>

        <div className="scholarship-grid">

          {/* STEP UP */}

          <div className="scholarship-card">
            <div className="scholarship-icon">🎓</div>

            <h2>Step Up For Students</h2>

            <p>
              Florida scholarship program supporting students with educational
              funding opportunities including tutoring, private instruction,
              learning support, and specialized educational needs.
            </p>

            <ul>
              <li>Private tutoring support</li>
              <li>Educational expenses</li>
              <li>Learning accommodations</li>
              <li>Florida scholarship programs</li>
            </ul>

            <a
              href="https://www.stepupforstudents.org"
              target="_blank"
              rel="noopener noreferrer"
              className="scholarship-btn"
            >
              Visit Step Up
            </a>
          </div>

          {/* EPIC */}

          <div className="scholarship-card featured-card">
            <div className="scholarship-icon">⚙️</div>

            <h2>Epic Foundation</h2>

            <p>
              STEM mentorship and scholarship opportunities helping students
              explore technology, engineering, robotics, coding, innovation,
              and future career pathways.
            </p>

            <ul>
              <li>STEM mentorship</li>
              <li>Technology opportunities</li>
              <li>Engineering exposure</li>
              <li>Future career pathways</li>
            </ul>

            <a
              href="https://epicsouthflorida.org/mentorship"
              target="_blank"
              rel="noopener noreferrer"
              className="scholarship-btn"
            >
              Explore Epic Foundation
            </a>
          </div>

        </div>

        <div className="scholarship-bottom">
          <h3>Need Help Getting Started?</h3>

          <p>
            If you are unsure which program may apply to your student,
            STEM with Lyn can help guide families toward educational
            support resources and tutoring pathways.
          </p>
        </div>

      </div>
    </div>
  );
};

export default ScholarshipsPage;