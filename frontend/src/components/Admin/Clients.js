import React, { useEffect, useState } from 'react';

const Clients = () => {
    const [clients, setClients] = useState([]);
    //const [error, setError] = useState('');
    const [showForm, setShowForm] = useState(false); // To toggle form visibility
    const [newClient, setNewClient] = useState({ full_name: '', email: '', phone: '', payment_method: '' }); // New client data

    const fetchClients = async () => {
        try {
            const response = await fetch(`${process.env.REACT_APP_API_URL}/api/clients`);
            if (response.ok) {
                const data = await response.json();
                // Sort the data before setting it to state
                data.sort((a, b) => a.full_name.localeCompare(b.full_name));
                setClients(data);
            } else {
                throw new Error('Failed to fetch clients');
            }
        } catch (error) {
            console.error('Error fetching clients:', error);
            //setError('Could not fetch clients. Please try again later.');
        }
    };
    

    const addNewClient = async () => {
        try {
            const response = await fetch(`${process.env.REACT_APP_API_URL}/api/clients`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(newClient),
            });

            if (response.ok) {
                const addedClient = await response.json();
                setClients([...clients, addedClient]); // Update the clients list
                setShowForm(false); // Hide the form
                setNewClient({ full_name: '', email: '', phone: '', payment_method: '' }); // Reset the form
            } else {
                throw new Error('Failed to add client');
            }
        } catch (error) {
            console.error('Error adding client:', error);
            //setError('Could not add the client. Please try again later.');
        }
    };

    useEffect(() => {
        fetchClients();
    }, []);

    const handleChange = (e) => {
        const { name, value } = e.target;
        setClients((prev) => ({ ...prev, [name]: value }));
    };


    return (
        <div className="userlist-container">
            <h1>Clients</h1>
            <div className="button-container">
        <button onClick={() => setShowForm(!showForm)}>
            {showForm ? 'Cancel' : 'Add New Client'}
        </button>
    </div>
            {showForm && (
                <div className="new-client-form">
                    <h2>Add New Client</h2>
                    <form
                        onSubmit={(e) => {
                            e.preventDefault();
                            addNewClient();
                        }}
                    >
                        <label>
                            Full Name:
                            <input
                                type="text"
                                value={newClient.full_name}
                                onChange={(e) =>
                                    setNewClient({ ...newClient, full_name: e.target.value })
                                }
                                required
                            />
                        </label>
                        <label>
                            Email:
                            <input
                                type="email"
                                value={newClient.email}
                                onChange={(e) =>
                                    setNewClient({ ...newClient, email: e.target.value })
                                }
                            />
                        </label>
                        <label>
                            Phone:
                            <input
                                type="tel"
                                value={newClient.phone}
                                onChange={(e) =>
                                    setNewClient({ ...newClient, phone: e.target.value })
                                }
                            />
                        </label>
                        <label>
                    How will you be paying? *
                    <select
                        name="payment_method"
                        value={newClient.payment_method} // Bind the array from state
                        onChange={(e) =>
                            setNewClient({ ...newClient, payment_method: e.target.value })
                        }
                        required
                    >
                        <option value="">Select</option>
                        <option value="Square">Square - Payment Link</option>
                        <option value="Zelle">Zelle</option>
                        <option value="Cashapp">Cashapp</option>
                    </select>
                </label>
                        <button type="submit">Save</button>
                    </form>
                </div>
            )}
            {clients.length > 0 ? (
                <table className="userlist-table">
                    <thead>
                        <tr>
                            <th>Full Name</th>
                            <th>Email</th>
                            <th>Phone</th>
                            <th>Payment Method</th>
                        </tr>
                    </thead>
                    <tbody>
                        {clients.map((client) => (
                            <tr key={client.id}>
                                <td>{client.full_name}</td>
                                <td>{client.email}</td>
                                <td>{client.phone}</td>
                                <td>{client.payment_method}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            ) : (
                <p>No clients available yet.</p>
            )}
        </div>
    );
};

export default Clients;
