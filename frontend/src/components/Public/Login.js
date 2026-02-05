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

    const role = stored?.role || localStorage.getItem("role") || localStorage.getItem("userRole");

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

      const data = await response.json(); // {id, role, username, name, email, phone}

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
    <div className="login-page">
      <div className="login-container">
        <form onSubmit={handleSubmit}>
          <h2>Login</h2>

          {error && <p style={{ color: "red" }}>{error}</p>}

          <label>
            Username:
            <input value={username} onChange={(e) => setUsername(e.target.value)} required />
          </label>

          <label>
            Password:
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </label>

          <br />

          <button type="submit" disabled={loading}>
            {loading ? "Logging in..." : "Login"}
          </button>
        </form>

        <p className="link-to-other">
          Don&apos;t have an account? <Link to="/register">Register here</Link>
        </p>

        <p className="forgot-password">
          <Link to="/forgot-password">Forgot Password?</Link>
        </p>
      </div>
    </div>
  );
};

export default Login;
