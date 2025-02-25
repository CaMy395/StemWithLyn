import React from 'react';
import { useNavigate } from 'react-router-dom';

const AdminDashboard = () => {
    const navigate = useNavigate();

    return (
        <div className="admin-dashboard">
            <header className="dashboard-header">
                <h1>Admin Dashboard</h1>
            </header>
            <main className="dashboard-main">
                <section className="dashboard-overview">
                    <h2>Overview</h2>
                    <p>Welcome to the admin dashboard. Use the tools below to manage the portal.</p>
                </section>
                <section className="dashboard-actions">
                    <h2>Actions</h2>
                    <div className="actions-container">
                        <button
                            className="action-button"
                            onClick={() => navigate('/admin/users')}
                        >
                            Manage Users
                        </button>
                        <button
                            className="action-button"
                            onClick={() => navigate('/admin/scheduling-page')}
                        >
                            Manage Schedule
                        </button>
                        <button
                            className="action-button"
                            onClick={() => navigate('/admin/reports')}
                        >
                            Generate Reports
                        </button>
                        <button
                            className="action-button"
                            onClick={() => navigate('/admin/intake-forms')}
                        >
                            Intake Forms
                        </button>
                        <button
                            className="action-button"
                            onClick={() => navigate('/admin/clients')}
                        >
                            Client List
                        </button>
                    </div>
                </section>
            </main>
        </div>
    );
};

export default AdminDashboard;
