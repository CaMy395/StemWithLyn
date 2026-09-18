import React, { useCallback, useEffect, useState } from 'react';
import '../../App.css';

const apiUrl = process.env.REACT_APP_API_URL || 'http://localhost:3001';
const formatDate = (value) => value ? new Date(value).toLocaleDateString('en-US') : '—';
const show = (value) => value == null || value === '' ? '—' : value;

const AdminIntakeForms = () => {
  const [tutoringForms, setTutoringForms] = useState([]);
  const [techForms, setTechForms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchForms = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [tutoringResponse, techResponse] = await Promise.all([
        fetch(`${apiUrl}/api/tutoring-intake`),
        fetch(`${apiUrl}/api/tech-intake`),
      ]);
      if (!tutoringResponse.ok || !techResponse.ok) throw new Error('Could not load STEM intake forms.');
      const [tutoring, tech] = await Promise.all([tutoringResponse.json(), techResponse.json()]);
      setTutoringForms(Array.isArray(tutoring) ? tutoring : []);
      setTechForms(Array.isArray(tech) ? tech : []);
    } catch (err) {
      setError(err.message || 'Could not load STEM intake forms.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchForms(); }, [fetchForms]);

  const deleteForm = async (type, id) => {
    if (!window.confirm('Delete this intake form?')) return;
    setError('');
    try {
      const response = await fetch(`${apiUrl}/api/${type}/${id}`, { method: 'DELETE' });
      if (!response.ok) throw new Error('Could not delete the form.');
      if (type === 'tutoring-intake') setTutoringForms((forms) => forms.filter((form) => form.id !== id));
      else setTechForms((forms) => forms.filter((form) => form.id !== id));
    } catch (err) {
      setError(err.message || 'Could not delete the form.');
    }
  };

  return (
    <main className="admin-intake-forms-container forms-workspace">
      <header className="forms-header">
        <div><span>ADMIN WORKSPACE</span><h1>STEM intake forms</h1><p>Review tutoring and technology requests.</p></div>
      </header>

      {error && <p className="error-message" role="alert">{error}</p>}
      <div className="forms-stats">
        <p><strong>{tutoringForms.length + techForms.length}</strong><span>Total STEM forms</span></p>
        <p><strong>{tutoringForms.length}</strong><span>Tutoring</span></p>
        <p><strong>{techForms.length}</strong><span>Technology</span></p>
      </div>

      {loading ? <p>Loading intake forms…</p> : <>
        <section className="table-scroll-container">
          <h2>Tutoring intake</h2>
          {tutoringForms.length === 0 ? <p>No tutoring intake forms yet.</p> :
            <table className="intake-forms-table">
              <thead><tr><th>Submitted</th><th>Student</th><th>Email</th><th>Phone</th><th>Grade</th><th>Subject</th><th>Support needed</th><th>Notes</th><th>Actions</th></tr></thead>
              <tbody>{tutoringForms.map((form) => <tr key={form.id}>
                <td>{formatDate(form.created_at)}</td>
                <td>{show(form.full_name)}</td>
                <td>{show(form.email)}</td>
                <td>{show(form.phone)}</td>
                <td>{show(form.grade)}</td>
                <td>{show(form.subject)}</td>
                <td>{show(form.why_help)}</td>
                <td>{show(form.additional_details)}</td>
                <td><button type="button" onClick={() => deleteForm('tutoring-intake', form.id)}>Delete</button></td>
              </tr>)}</tbody>
            </table>}
        </section>

        <section className="table-scroll-container">
          <h2>Technology intake</h2>
          {techForms.length === 0 ? <p>No technology intake forms yet.</p> :
            <table className="intake-forms-table">
              <thead><tr><th>Submitted</th><th>Name</th><th>Email</th><th>Phone</th><th>Help needed</th><th>Platform</th><th>Experience</th><th>Deadline</th><th>Payment preference</th><th>Notes</th><th>Actions</th></tr></thead>
              <tbody>{techForms.map((form) => <tr key={form.id}>
                <td>{formatDate(form.created_at)}</td>
                <td>{show(form.full_name)}</td>
                <td>{show(form.email)}</td>
                <td>{show(form.phone)}</td>
                <td>{show(form.help_type)}</td>
                <td>{show(form.platform)}</td>
                <td>{show(form.experience_level)}</td>
                <td>{formatDate(form.deadline)}</td>
                <td>{show(form.payment_method)}</td>
                <td>{show(form.additional_details)}</td>
                <td><button type="button" onClick={() => deleteForm('tech-intake', form.id)}>Delete</button></td>
              </tr>)}</tbody>
            </table>}
        </section>
      </>}
    </main>
  );
};

export default AdminIntakeForms;
