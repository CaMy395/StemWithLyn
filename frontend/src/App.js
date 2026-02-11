import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, useLocation, Routes, Route, Link, Navigate } from 'react-router-dom';
//Public Pages
import TutoringIntake from './components/Public/TutoringIntake';
import TechIntake from './components/Public/TechIntake';
import Register from './components/Public/Register';
import Login from './components/Public/Login';
import ForgotPassword from './components/Public/ForgotPassword';
import ResetPassword from './components/Public/ResetPassword';
import ClientPortalPage from './components/User/ClientPortalPage';
import ClientSchedulingPage from './components/Public/ClientSchedulingPage';
import Profits from './components/Admin/Profits';
import WelcomePage from './components/Public/WelcomePage';

//Client Pages

//Admin Pages
import MyTasks from './components/Admin/MyTasks';
import AdminIntakeForms from './components/Admin/AdminIntakeForms';
import Clients from './components/Admin/Clients';
import SchedulingPage from './components/Admin/SchedulingPage';
import AdminAvailabilityPage from './components/Admin/AdminAvailabilityPage';
import AdminDashboard from './components/Admin/AdminDashboard';
import MentorSessionLog from './components/Admin/MentorSessionLog';
import PaymentSuccess from './components/Public/PaymentSuccess';

import WebSocketProvider from './WebSocketProvider';
import './App.css';

const App = () => {
    const [userRole, setUserRole] = useState(() => {
  return (
    localStorage.getItem("userRole") ||
    localStorage.getItem("role") ||
    (JSON.parse(localStorage.getItem("loggedInUser") || "null")?.role ?? null)
  );
});



    const [totalFormsCount, setTotalFormsCount] = useState(0);

    const handleLogin = (role) => {
  setUserRole(role);
  localStorage.setItem("userRole", role);
  localStorage.setItem("role", role);
};


    const handleLogout = () => {
  localStorage.removeItem("loggedInUser");
  localStorage.removeItem("username");
  localStorage.removeItem("role");
  localStorage.removeItem("userRole");
  localStorage.removeItem("userId");
  localStorage.removeItem("token");

  setUserRole(null); // ✅ important
  window.location.href = "/login";
};



    useEffect(() => {
        const fetchTotalFormsCount = async () => {
            const apiUrl = process.env.REACT_APP_API_URL || 'http://localhost:3001';
            try {
                const responses = await Promise.all([
                    fetch(`${apiUrl}/api/tutoring-intake`),
                ]);

                const [tutoringData] = await Promise.all(
                    responses.map((res) => (res.ok ? res.json() : []))
                );

                const totalCount =
                    (tutoringData?.length || 0);

                setTotalFormsCount(totalCount);
            } catch (error) {
                console.error('Error fetching total forms count:', error);
            }
        };

        fetchTotalFormsCount();
    }, []);

    return (
        <Router>
            <WebSocketProvider>
                <Routes>   
                    {/* Main App Routes */}
                    <Route
                        path="/*"
                        element={
                            <div className="app-page">
                                <AppContent
                                    userRole={userRole}
                                    handleLogout={handleLogout}
                                    onLogin={handleLogin}
                                    totalFormsCount={totalFormsCount}
                                />
                            </div>
                        }
                    />
                </Routes>
            </WebSocketProvider>
        </Router>
    );
    
}

const AppContent = ({ userRole, handleLogout, onLogin, totalFormsCount }) => {
    const username = localStorage.getItem("username");
    const loggedInUser = JSON.parse(localStorage.getItem("loggedInUser")) || null;
    const location = useLocation();

    const [openDropdown, setOpenDropdown] = useState(null);

    const toggleDropdown = (dropdown) => {
        setOpenDropdown(openDropdown === dropdown ? null : dropdown);
    };

    return (
        <div className={"app-container"}>
            {/* Navigation menu */}
            {userRole && (
                <nav className="app-nav">
                    <div className="nav-left">
                        <span className="welcome-message">Hi, {username || "User"}</span>
                    </div>
                    <div className="nav-center">
                        <ul className="menu">
                            
                            {userRole === "admin" ? (
                                <>
                                <li><Link to="/admin">Home</Link></li>

                                    {/* Tasks & Forms */}
                                    <li className="dropdown">
                                        <span onClick={() => toggleDropdown("tasks")}>Tasks & Forms ▾</span>
                                        {openDropdown === "tasks" && (
                                            <ul className="dropdown-menu">
                                                <Link to="/admin/mytasks">My Tasks</Link> -
                                                <Link to="/admin/profits">My Profits</Link> -
                                                <Link to="/admin/intake-forms"> Intake Forms {totalFormsCount > 0 && (<span className="notification-badge">{totalFormsCount}</span>)}</Link>
                                            </ul>
                                        )}
                                    </li>
                                
                                    {/* Clients */}
                                    <Link to="/admin/clients">Clients</Link>

                                </>
                            ) : (
                                <ul className="menu">
                                 <li><Link to="/client-portal">Home</Link></li>
                                 <li><Link to="/client-portal/schedule">Book An Appointment</Link></li>

                                </ul>
                            )}
                        </ul>
                    </div>

                    <div className="nav-right">
                        <button className="logout-button" onClick={handleLogout}>
                            Logout
                        </button>
                    </div>
                </nav>
            )}

            {/* Routes */}
            <Routes>    
                <Route path="/" element={<WelcomePage />} />
                <Route path="/register" element={<Register />} />
                <Route path="/login" element={<Login onLogin={onLogin} />} />
                <Route path="/forgot-password" element={<ForgotPassword />} />
                <Route path="/reset-password" element={<ResetPassword />} />
                <Route path="/tutoring-intake" element={<TutoringIntake />} />
                <Route path="/tech-engineering" element={<TechIntake />} />
                <Route path="/client-scheduling" element={<ClientSchedulingPage />} />
                <Route path="/client-scheduling-success" element={<PaymentSuccess />} />
                <Route path="/payment-success" element={<PaymentSuccess />} />
                <Route path="/admin" element={userRole === 'admin' ? <AdminDashboard /> : <Navigate to="/login" />} />
<Route
  path="/client-portal"
  element={userRole && userRole !== "admin" ? <ClientPortalPage /> : <Navigate to="/login" />}
/>
<Route
  path="/client-portal/schedule"
  element={
    userRole && userRole !== "admin"
      ? <ClientSchedulingPage portalMode />
      : <Navigate to="/login" />
  }
/>


                <Route path="/admin/scheduling-page" element={<SchedulingPage />} />
                <Route path="/admin/availability-page" element={<AdminAvailabilityPage />} />
                <Route path="/admin/clients" element={userRole === 'admin' ? <Clients /> : <Navigate to="/login" />} />
                <Route path="/admin/profits" element={userRole === 'admin' ? <Profits /> : <Navigate to="/login" />} />
                <Route path="/admin/intake-forms" element={userRole === 'admin' ? <AdminIntakeForms />: <Navigate to="/login" />} />
                <Route path="/admin/mytasks" element={userRole === 'admin' ? <MyTasks /> : <Navigate to="/login" />} />
                <Route path="/admin/mentors-log" element={userRole === 'admin' ? <MentorSessionLog /> : <Navigate to="/login" />} />

            </Routes>
        </div>
    );
};



export default App;

