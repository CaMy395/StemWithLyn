import React, { useEffect, useState } from 'react';
import '../../App.css';

const AdminIntakeForms = () => {
    const [intakeForms, setIntakeForms] = useState([]);
    const [craftCocktails, setCraftCocktails] = useState([]);
    const [bartendingCourse, setBartendingCourse] = useState([]);
    const [bartendingClasses, setBartendingClasses] = useState([]);
    const [tutoringApt, setTutoringApt] = useState([]);
    const [intakeCount, setIntakeCount] = useState(0);
    const [craftCocktailsCount, setCraftCocktailsCount] = useState(0);
    const [bartendingCourseCount, setBartendingCourseCount] = useState(0);
    const [bartendingClassesCount, setBartendingClassesCount] = useState(0);
    const [tutoringAptCount, setTutoringAptCount] = useState([0]);

    const [error] = useState('');

    useEffect(() => {
        const fetchForms = async () => {
            const apiUrl = process.env.REACT_APP_API_URL || 'http://localhost:3001';
    
            try {
                const intakeResponse = await fetch(`${apiUrl}/api/intake-forms`);
                if (intakeResponse.ok) {
                    const intakeData = await intakeResponse.json();
                    setIntakeForms(intakeData || []);
                    setIntakeCount(intakeData.length); // Update count
                }
    
                const cocktailsResponse = await fetch(`${apiUrl}/api/craft-cocktails`);
                if (cocktailsResponse.ok) {
                    const cocktailsData = await cocktailsResponse.json();
                    setCraftCocktails(cocktailsData || []);
                    setCraftCocktailsCount(cocktailsData.length); // Update count
                }
    
                const courseResponse = await fetch(`${apiUrl}/api/bartending-course`);
                if (courseResponse.ok) {
                    const courseData = await courseResponse.json();
                    setBartendingCourse(courseData || []);
                    setBartendingCourseCount(courseData.length); // Update count
                }
    
                const classesResponse = await fetch(`${apiUrl}/api/bartending-classes`);
                if (classesResponse.ok) {
                    const classesData = await classesResponse.json();
                    setBartendingClasses(classesData || []);
                    setBartendingClassesCount(classesData.length); // Update count
                }

                const tutoringResponse = await fetch(`${apiUrl}/api/tutoring-intake`);
                if (tutoringResponse.ok) {
                    const tutoringData = await tutoringResponse.json();
                    setTutoringApt(tutoringData || []);
                    setTutoringAptCount(tutoringData.length); // Update count
                }
            } catch (error) {
                console.error('Error fetching forms:', error);
            }
        };
    
        fetchForms();
    }, [setBartendingClassesCount, setBartendingCourseCount, setCraftCocktailsCount, setIntakeCount]);
    
    const handleAddToGigs = async (form) => {
        const apiUrl = process.env.REACT_APP_API_URL || 'http://localhost:3001';
            
        const gigData = {
            client: form.full_name,
            event_type: form.event_type,
            date: form.event_date,
            time: form.event_time,
            duration: form.event_duration,
            location: form.event_location,
            position: "bartender",
            gender: form.preferred_gender,
            pay: 20,
            client_payment: 0, // Example: Ensure numeric value
            payment_method: 'N/A',
            needs_cert: form.bartending_license ? 1 : 0, // Convert boolean to numeric
            confirmed: 0, // Convert false to 0
            staff_needed: form.guest_count > 50 ? 2 : 1, // Example logic
            claimed_by: [],
            backup_needed: 0, // Convert false to 0
            backup_claimed_by: [],
            latitude: null,
            longitude: null,
            attire: form.staff_attire,
            indoor: form.indoors ? 1 : 0, // Convert boolean to numeric
            approval_needed: form.nda_required ? 1 : 0,
            on_site_parking: form.on_site_parking ? 1 : 0,
            local_parking: form.local_parking || 'N/A',
            NDA: form.nda_required ? 1 : 0,
            establishment: form.home_or_venue || 'home',
        };
    
        try {
            const response = await fetch(`${apiUrl}/gigs`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(gigData),
            });
    
            if (response.ok) {
                alert('Gig added successfully, and notifications sent!');
            } else {
                const errorMessage = await response.text();
                alert(`Failed to add gig: ${errorMessage}`);
            }
        } catch (error) {
            console.error('Error adding gig:', error);
            alert('Error adding gig. Please try again.');
        }
    };
    
    
    const handleDelete = async (id, type) => {
        const apiUrl = process.env.REACT_APP_API_URL || 'http://localhost:3001';
        if (window.confirm('Are you sure you want to delete this form?')) {
            try {
                const response = await fetch(`${apiUrl}/api/${type}/${id}`, {
                    method: 'DELETE',
                });
    
                if (response.ok) {
                    alert('Form deleted successfully');
                    if (type === 'intake-forms') {
                        setIntakeForms(intakeForms.filter((form) => form.id !== id));
                        setIntakeCount((prev) => prev - 1); // Update count
                    } else if (type === 'craft-cocktails') {
                        setCraftCocktails(craftCocktails.filter((form) => form.id !== id));
                        setCraftCocktailsCount((prev) => prev - 1); // Update count
                    } else if (type === 'bartending-course') {
                        setBartendingCourse(bartendingCourse.filter((form) => form.id !== id));
                        setBartendingCourseCount((prev) => prev - 1); // Update count
                    } else if (type === 'bartending-classes') {
                        setBartendingClasses(bartendingClasses.filter((form) => form.id !== id));
                        setBartendingClassesCount((prev) => prev - 1); // Update count
                    } else if (type === 'bartending-classes') {
                        setTutoringApt(tutoringApt.filter((form) => form.id !== id));
                        setTutoringAptCount((prev) => prev - 1); // Update count
                    }
                } else {
                    const errorMessage = await response.text();
                    alert(`Failed to delete the form: ${errorMessage}`);
                }
            } catch (error) {
                console.error('Error deleting form:', error);
                alert('Error deleting the form. Please try again.');
            }
        }
    };
    
    return (
        <div className="admin-intake-forms-container">
            <h1>Submitted Intake Forms</h1>
            {error && <p className="error-message">{error}</p>}
    <div>
        <p>Intake Forms: {intakeCount}</p>
        <p>Craft Cocktails Forms: {craftCocktailsCount}</p>
        <p>Bartending Course Forms: {bartendingCourseCount}</p>
        <p>Bartending Classes Forms: {bartendingClassesCount}</p>
        <p>Tutoring Forms: {tutoringAptCount}</p>
    </div>
    <br></br>
            {/* Intake Forms */}
            {intakeForms.length > 0 ? (
                <div className="table-scroll-container">
                    <h2>Intake Forms</h2>
                    <table className="intake-forms-table">
                        <thead>
                            <tr>
                                <th>Full Name</th>
                                <th>Email</th>
                                <th>Phone</th>
                                <th>Date</th>
                                <th>Time</th>
                                <th>Entity Type</th>
                                <th>Business Name</th>
                                <th>First Time Booking</th>
                                <th>Event Type</th>
                                <th>Age Range</th>
                                <th>Event Name</th>
                                <th>Event Address</th>
                                <th>Gender Matters</th>
                                <th>Preferred Gender</th>
                                <th>Open Bar</th>
                                <th>Location Features</th>
                                <th>Staff Attire</th>
                                <th>Event Duration</th>
                                <th>On-Site Parking</th>
                                <th>Local Parking</th>
                                <th>Additional Prep Time</th>
                                <th>NDA Required</th>
                                <th>Food Catering</th>
                                <th>Guest Count</th>
                                <th>Home or Venue</th>
                                <th>Venue Name</th>
                                <th>Bartending License Required</th>
                                <th>Insurance Required</th>
                                <th>Liquor License Required</th>
                                <th>Indoors Event</th>
                                <th>Budget</th>
                                <th>Add-ons</th>
                                <th>Payment Method</th>
                                <th>How Heard</th>
                                <th>Referral</th>
                                <th>Referral Details</th>
                                <th>Created At</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {intakeForms.map((form) => (
                                <tr key={form.id}>
                                    <td>{form.full_name}</td>
                                    <td>{form.email}</td>
                                    <td>{form.phone}</td>
                                    <td>{new Date(form.event_date).toLocaleDateString('en-US')}</td>
                                    <td>{new Date(`1970-01-01T${form.event_time}`).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })}</td>
                                    <td>{form.entity_type}</td>
                                    <td>{form.business_name || 'N/A'}</td>
                                    <td>{form.first_time_booking ? 'Yes' : 'No'}</td>
                                    <td>{form.event_type}</td>
                                    <td>{form.age_range || 'N/A'}</td>
                                    <td>{form.event_name || 'N/A'}</td>
                                    <td>{form.event_location || 'N/A'}</td>
                                    <td>{form.gender_matters ? 'Yes' : 'No'}</td>
                                    <td>{form.preferred_gender || 'N/A'}</td>
                                    <td>{form.open_bar ? 'Yes' : 'No'}</td>
                                    <td>{Array.isArray(form.location_facilities) ? form.location_facilities.join(', ') : 'None'}</td>
                                    <td>{form.staff_attire || 'N/A'}</td>
                                    <td>{form.event_duration || 'N/A'}</td>
                                    <td>{form.on_site_parking ? 'Yes' : 'No'}</td>
                                    <td>{form.local_parking ? 'Yes' : 'No'}</td>
                                    <td>{form.additional_prep ? 'Yes' : 'No'}</td>
                                    <td>{form.nda_required ? 'Yes' : 'No'}</td>
                                    <td>{form.food_catering ? 'Yes' : 'No'}</td>
                                    <td>{form.guest_count || 'N/A'}</td>
                                    <td>{form.home_or_venue || 'N/A'}</td>
                                    <td>{form.venue_name || 'N/A'}</td>
                                    <td>{form.bartending_license ? 'Yes' : 'No'}</td>
                                    <td>{form.insurance_required ? 'Yes' : 'No'}</td>
                                    <td>{form.liquor_license ? 'Yes' : 'No'}</td>
                                    <td>{form.indoors ? 'Yes' : 'No'}</td>
                                    <td>{form.budget || 'N/A'}</td>
                                    <td>{form.addons || 'None'}</td>
                                    <td>{form.payment_method || 'None'}</td>
                                    <td>{form.how_heard || 'N/A'}</td>
                                    <td>{form.referral || 'N/A'}</td>
                                    <td>{form.referral_details || 'N/A'}</td>
                                    <td>{new Date(form.created_at).toLocaleString()}</td>
                                    <td>
                                        <button
                                            onClick={() => handleAddToGigs(form)}
                                            style={{
                                                backgroundColor: '#8B0000',
                                                color: 'white',
                                                padding: '5px 10px',
                                                border: 'none',
                                                cursor: 'pointer',
                                            }}
                                        >
                                            Add to Gigs
                                        </button>
                                        <button onClick={() => handleDelete(form.id, 'intake-forms')} style={{ backgroundColor: '#8B0000', color: 'white', padding: '5px 10px', border: 'none', cursor: 'pointer' }}>Delete</button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            ) : (
                <p>No intake forms submitted yet.</p>
            )}
            <br></br>
            {/* Bartending Course Forms */}
            {bartendingCourse.length > 0 ? (
                <div className="table-scroll-container">
                    <h2>Bartending Course Forms</h2>
                    <table className="intake-forms-table">
                        <thead>
                            <tr>
                                <th>Full Name</th>
                                <th>Email</th>
                                <th>Phone</th>
                                <th>Is Adult</th>
                                <th>Experience</th>
                                <th>Set Schedule</th>
                                <th>Payment Plan</th>
                                <th>Referral</th>
                                <th>Referral Details</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {bartendingCourse.map((form) => (
                                <tr key={form.id}>
                                    <td>{form.full_name}</td>
                                    <td>{form.email}</td>
                                    <td>{form.phone}</td>
                                    <td>{form.is_adult ? 'Yes' : 'No'}</td>
                                    <td>{form.experience ? 'Yes' : 'No'}</td>
                                    <td>{form.set_schedule ? 'Yes' : 'No'}</td>
                                    <td>{form.payment_plan ? 'Yes' : 'No'}</td>
                                    <td>{form.referral || 'N/A'}</td>
                                    <td>{form.referral_details || 'None'}</td>
                                    <td>
                                        <button
                                            onClick={() => handleDelete(form.id, 'bartending-course')}
                                            style={{
                                                backgroundColor: '#8B0000',
                                                color: 'white',
                                                padding: '5px 10px',
                                                border: 'none',
                                                cursor: 'pointer',
                                            }}
                                        >
                                            Delete
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            ) : (
                <p>No Bartending Course forms submitted yet.</p>
            )}
            <br></br>
                        {/* Bartending Classes Forms */}
                        {bartendingClasses.length > 0 ? (
                <div className="table-scroll-container">
                    <h2>Bartending Classes Forms</h2>
                    <table className="intake-forms-table">
                        <thead>
                            <tr>
                                <th>Full Name</th>
                                <th>Email</th>
                                <th>Phone</th>
                                <th>Is Adult</th>
                                <th>Experience</th>
                                <th>Class Count</th>
                                <th>Referral</th>
                                <th>Referral Details</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {bartendingClasses.map((form) => (
                                <tr key={form.id}>
                                    <td>{form.full_name}</td>
                                    <td>{form.email}</td>
                                    <td>{form.phone}</td>
                                    <td>{form.is_adult ? 'Yes' : 'No'}</td>
                                    <td>{form.experience ? 'Yes' : 'No'}</td>
                                    <td>{form.class_count}</td>
                                    <td>{form.referral || 'N/A'}</td>
                                    <td>{form.referral_details || 'None'}</td>
                                    <td>
                                        <button
                                            onClick={() => handleDelete(form.id, 'bartending-classes')}
                                            style={{
                                                backgroundColor: '#8B0000',
                                                color: 'white',
                                                padding: '5px 10px',
                                                border: 'none',
                                                cursor: 'pointer',
                                            }}
                                        >
                                            Delete
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            ) : (
                <p>No bartending classes forms submitted yet.</p>
            )}
            <br></br>
            {/* Craft Cocktails */}
            {craftCocktails.length > 0 ? (
                <div className="table-scroll-container">
                    <h2>Craft Cocktails Forms</h2>
                    <table className="intake-forms-table">
                        <thead>
                            <tr>
                                <th>Full Name</th>
                                <th>Email</th>
                                <th>Phone</th>
                                <th>Date</th>
                                <th>Time</th>
                                <th>Event Type</th>
                                <th>Guest Count</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {craftCocktails.map((form) => (
                                <tr key={form.id}>
                                    <td>{form.full_name}</td>
                                    <td>{form.email}</td>
                                    <td>{form.phone}</td>
                                    <td>{new Date(form.date).toLocaleDateString('en-US')}</td>
                                    <td>{new Date(`1970-01-01T${form.time}`).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })}</td>
                                    <td>{form.event_type}</td>
                                    <td>{form.guest_count}</td>
                                    
                                    <td>
                                        <button onClick={() => handleDelete(form.id, 'craft-cocktails')} style={{ backgroundColor: '#8B0000', color: 'white', padding: '5px 10px', border: 'none', cursor: 'pointer' }}>Delete</button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            ) : (
                <p>No craft cocktails forms submitted yet.</p>
            )}
            <br></br>
            {/* Tutoring Intake Forms */}
                {tutoringApt.length > 0 ? (
                    <div className="table-scroll-container">
                        <h2>Tutoring Intake Forms</h2>
                        <table className="intake-forms-table">
                            <thead>
                                <tr>
                                    <th>Full Name</th>
                                    <th>Email</th>
                                    <th>Phone</th>
                                    <th>Date</th>
                                    <th>Subject</th>
                                    <th>Grade</th>
                                    <th>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {tutoringApt.map((form) => (
                                    <tr key={form.id}>
                                        <td>{form.full_name}</td>
                                        <td>{form.email}</td>
                                        <td>{form.phone}</td>
                                        <td>{new Date(form.date).toLocaleDateString('en-US')}</td>
                                        <td>{form.subject}</td>
                                        <td>{form.grade}</td>
                                        <td>
                                            <button
                                                onClick={() => handleDelete(form.id, 'tutoring-intake')}
                                                style={{
                                                    backgroundColor: '#8B0000',
                                                    color: 'white',
                                                    padding: '5px 10px',
                                                    border: 'none',
                                                    cursor: 'pointer',
                                                }}
                                            >
                                                Delete
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                ) : (
                    <p>No tutoring intake forms submitted yet.</p>
                )}
                <br />

        </div>
    );
};

export default AdminIntakeForms;
