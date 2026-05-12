import React, { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import "../../App.css";

const Login = ({ onLogin }) => {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    let stored = null;
    try {
      stored = JSON.parse(localStorage.getItem("loggedInUser"));
    } catch {
      stored = null;
    }

    const role =
      stored?.role ||
      localStorage.getItem("role") ||
      localStorage.getItem("userRole");

    if (role) {
      onLogin(role);
      if (role === "admin") navigate("/admin");
      else navigate("/client-portal");
    }
  }, [navigate, onLogin]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    const apiUrl = process.env.REACT_APP_API_URL || "http://localhost:3001";

    try {
      const response = await fetch(`${apiUrl}/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });

      if (!response.ok) {
        const txt = await response.text();
        throw new Error(txt || "Login failed.");
      }

      const data = await response.json();

      localStorage.setItem("username", data.username);
      localStorage.setItem("role", data.role);
      localStorage.setItem("userRole", data.role);
      localStorage.setItem("loggedInUser", JSON.stringify(data));

      onLogin(data.role);

      if (data.role === "admin") navigate("/admin");
      else navigate("/client-portal");
    } catch (err) {
      setError(err.message || "Something went wrong. Please try again later.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page stem-login-page">
      <div className="login-container stem-login-card">
        <div className="login-brand">
          <img
            src="/stem-logo.png"
            alt="STEM with Lyn"
            className="login-logo"
          />

          <span className="login-pill">Student Portal</span>

          <h2>Welcome Back</h2>

          <p>
            Log in to book tutoring, view appointments, and manage your STEM
            support.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="stem-login-form">
          {error && <div className="login-error">{error}</div>}

          <label>
            Username
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Enter your username"
              required
            />
          </label>

          <label>
            Password
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter your password"
              required
            />
          </label>

          <button type="submit" disabled={loading} className="login-submit-btn">
            {loading ? "Logging in..." : "Login"}
          </button>
        </form>

        <div className="login-links">
          <p>
            Don&apos;t have an account? <Link to="/register">Register here</Link>
          </p>

          <p>
            <Link to="/forgot-password">Forgot Password?</Link>
          </p>
        </div>
      </div>
    </div>
  );
};

export default Login;