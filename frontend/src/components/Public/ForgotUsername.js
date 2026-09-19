import React, { useState } from 'react';
import { Link } from 'react-router-dom';

const ForgotUsername = () => {
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async (event) => {
    event.preventDefault();
    setLoading(true); setError(''); setMessage('');
    const apiUrl = process.env.REACT_APP_API_URL || 'http://localhost:3001';
    try {
      const response = await fetch(`${apiUrl}/forgot-username`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Could not send the username reminder.');
      setMessage(data.message);
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  };

  return <div className="forgot-password-page"><div className="forgot-password-container">
    <h2>Forgot Username</h2>
    <p>Enter the email address connected to your student portal.</p>
    {error && <p className="login-error" role="alert">{error}</p>}
    {message && <p className="study-success" role="status">{message}</p>}
    <form onSubmit={submit}><label>Email:<input type="email" value={email} onChange={event => setEmail(event.target.value)} required autoComplete="email" /></label>
      <button type="submit" disabled={loading}>{loading ? 'Sending…' : 'Send Username'}</button></form>
    <p className="link-to-login"><Link to="/login">Back to login</Link></p>
  </div></div>;
};

export default ForgotUsername;
