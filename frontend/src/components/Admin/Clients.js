import React, { useEffect, useState } from 'react';

const Clients = () => {
    const [clients, setClients] = useState([]);
    const [showForm, setShowForm] = useState(false);
    const [newClient, setNewClient] = useState({ full_name: '', email: '', phone: '', payment_method: '', category: 'StemwithLyn'});
    const [editClient, setEditClient] = useState(null);

    const fetchClients = async () => {
        try {
            const response = await fetch(`${process.env.REACT_APP_API_URL}/api/clients`);
            if (response.ok) {
                const data = await response.json();
                data.sort((a, b) => a.full_name.localeCompare(b.full_name));
                setClients(data);
            } else {
                throw new Error('Failed to fetch clients');
            }
        } catch (error) {
            console.error('Error fetching clients:', error);
        }
    };

    useEffect(() => {
        fetchClients();
    }, []);

    const handleChange = (e) => {
        const { name, value } = e.target;
        setNewClient((prev) => ({ ...prev, [name]: value }));
    };

    const addOrUpdateClient = async () => {
        if (!editClient) return;
    
        const updatedClient = {
            full_name: newClient.full_name,
            email: newClient.email,
            phone: newClient.phone,
            payment_method: newClient.payment_method,
            category: newClient.category || "StemwithLyn", // Default category if missing
        };
    
        const url = `${process.env.REACT_APP_API_URL || "http://localhost:3001"}/api/clients/${editClient.id}`;
    
        console.log("Sending PATCH request to:", url);
        console.log("Client Data Being Sent:", updatedClient);
        console.log("API URL being used:", `${process.env.REACT_APP_API_URL || "http://localhost:3001"}/api/clients/${editClient.id}`);

        try {
            const response = await fetch(url, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(updatedClient),
            });
    
            if (!response.ok) {
                const errorMessage = await response.text();
                throw new Error(`Failed to update client: ${errorMessage}`);
            }
    
            console.log("✅ Client updated successfully!");
            fetchClients(); // Refresh client list
            setShowForm(false);
            setNewClient({ full_name: "", email: "", phone: "", payment_method: "", category: "StemwithLyn" });
            setEditClient(null);
        } catch (error) {
            console.error("❌ Error updating client:", error);
        }
    };
    
    

    const handleEdit = (client) => {
        setNewClient(client);
        setEditClient(client);
        setShowForm(true);
    };

    const handleDelete = async (id) => {
        if (!window.confirm("Are you sure you want to delete this client?")) return;

        try {
            const response = await fetch(`${process.env.REACT_APP_API_URL}/api/clients/${id}`, {
                method: 'DELETE',
            });

            if (response.ok) {
                setClients(clients.filter((client) => client.id !== id));
            } else {
                throw new Error('Failed to delete client');
            }
        } catch (error) {
            console.error('Error deleting client:', error);
        }
    };

    return (
        <div className="userlist-container">
            <h1>Clients</h1>
            <button onClick={() => {
                setNewClient({ full_name: '', email: '', phone: '', payment_method: '' });
                setShowForm(!showForm);
                setEditClient(null);
            }}>
                {showForm ? 'Cancel' : 'Add New Client'}
            </button>

            {showForm && (
                <div className="new-client-form">
                    <h2>{editClient ? 'Edit Client' : 'Add New Client'}</h2>
                    <form onSubmit={(e) => { e.preventDefault(); addOrUpdateClient(); }}>
                        <label>Full Name:
                            <input type="text" name="full_name" value={newClient.full_name} onChange={handleChange} required />
                        </label>
                        <label>Email:
                            <input type="email" name="email" value={newClient.email} onChange={handleChange} />
                        </label>
                        <label>Phone:
                            <input type="tel" name="phone" value={newClient.phone} onChange={handleChange} />
                        </label>
                        <label>Payment Method:
                            <select name="payment_method" value={newClient.payment_method} onChange={handleChange} required>
                                <option value="">Select</option>
                                <option value="Square">Square - Payment Link</option>
                                <option value="Zelle">Zelle</option>
                                <option value="Cashapp">Cashapp</option>
                            </select>
                        </label>
                        <label>Category:</label>
                            <select name="category" value={newClient.category} onChange={handleChange} required>
                                <option value="StemwithLyn">StemwithLyn</option>
                                <option value="United Mentors">United Mentors</option>
                                <option value="Above & Beyond Learning">Above & Beyond Learning</option>
                                <option value="Club Z">Club Z</option>
                            </select>
                        <button type="submit">{editClient ? 'Update' : 'Save'}</button>
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
                            <th>Category</th>
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {clients.map((client) => (
                            <tr key={client.id}>
                                <td>{client.full_name}</td>
                                <td>{client.email}</td>
                                <td>{client.phone}</td>
                                <td>{client.payment_method}</td>
                                <td>{client.category}</td>
                                <td>
                                    <button onClick={() => handleEdit(client)}>Edit</button>
                                    <button onClick={() => handleDelete(client.id)}>Delete</button>
                                </td>
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
