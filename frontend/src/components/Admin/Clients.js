import React, { useEffect, useState } from "react";

const Clients = () => {
  const apiUrl = process.env.REACT_APP_API_URL || "http://localhost:3001";

  const [clients, setClients] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [newClient, setNewClient] = useState({
    full_name: "",
    email: "",
    phone: "",
    category: "StemwithLyn",
  });
  const [editClient, setEditClient] = useState(null);

  const [busyId, setBusyId] = useState(null);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  const fetchClients = async () => {
    try {
      setErr("");
      const response = await fetch(`${apiUrl}/api/clients`);
      if (response.ok) {
        const data = await response.json();
        data.sort((a, b) => (a.full_name || "").localeCompare(b.full_name || ""));
        setClients(data);
      } else {
        const t = await response.text();
        throw new Error(t || "Failed to fetch clients");
      }
    } catch (error) {
      console.error("Error fetching clients:", error);
      setErr(error?.message || "Failed to fetch clients");
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
    setMsg("");
    setErr("");

    const clientData = {
      full_name: newClient.full_name,
      email: newClient.email,
      phone: newClient.phone,
      category: newClient.category || "StemwithLyn",
    };

    const isEditing = !!editClient;
    const url = isEditing
      ? `${apiUrl}/api/clients/${editClient.id}`
      : `${apiUrl}/api/clients`;

    const method = isEditing ? "PATCH" : "POST";

    try {
      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(clientData),
      });

      if (!response.ok) {
        const t = await response.text();
        throw new Error(t || `Failed to ${isEditing ? "update" : "add"} client`);
      }

      setMsg(`✅ Client ${isEditing ? "updated" : "added"} successfully!`);
      await fetchClients();
      setShowForm(false);
      setNewClient({ full_name: "", email: "", phone: "", category: "StemwithLyn" });
      setEditClient(null);
    } catch (error) {
      console.error(`❌ Error ${isEditing ? "updating" : "adding"} client:`, error);
      setErr(error?.message || "Something went wrong.");
    }
  };

  const handleEdit = (client) => {
    setMsg("");
    setErr("");
    setNewClient({
      full_name: client.full_name || "",
      email: client.email || "",
      phone: client.phone || "",
      category: client.category || "StemwithLyn",
    });
    setEditClient(client);
    setShowForm(true);
  };

  const handleDelete = async (id) => {
    setMsg("");
    setErr("");
    if (!window.confirm("Are you sure you want to delete this client?")) return;

    try {
      const response = await fetch(`${apiUrl}/api/clients/${id}`, { method: "DELETE" });
      if (!response.ok) {
        const t = await response.text();
        throw new Error(t || "Failed to delete client");
      }

      setClients((prev) => prev.filter((c) => c.id !== id));
      setMsg("✅ Client deleted.");
    } catch (error) {
      console.error("Error deleting client:", error);
      setErr(error?.message || "Failed to delete client");
    }
  };

  // ✅ NEW: Create/Login link for portal access
  const createLoginForClient = async (clientRow) => {
    setMsg("");
    setErr("");

    if (!clientRow?.id) return;

    if (!clientRow.email) {
      setErr("Client must have an email to create a portal login.");
      return;
    }

    const ok = window.confirm(
      `Create a portal login for:\n\n${clientRow.full_name}\n${clientRow.email}\n\nThis will email them a temporary login. Continue?`
    );
    if (!ok) return;

    setBusyId(clientRow.id);

    try {
      const response = await fetch(`${apiUrl}/admin/clients/${clientRow.id}/create-login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });

      if (!response.ok) {
        const t = await response.text();
        throw new Error(t || "Failed to create login.");
      }

      const data = await response.json(); // { success, user }
      setMsg(`✅ Portal login created for ${clientRow.full_name}. Username: ${data?.user?.username || "sent by email"}`);
      await fetchClients();
    } catch (error) {
      console.error("❌ create login error:", error);
      setErr(error?.message || "Failed to create login.");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="userlist-container">
      <h1>Clients</h1>

      {msg && (
        <div style={{ background: "#eaffea", border: "1px solid #9be39b", padding: 10, borderRadius: 8, marginBottom: 10 }}>
          {msg}
        </div>
      )}
      {err && (
        <div style={{ background: "#ffe9e9", border: "1px solid #ffb3b3", padding: 10, borderRadius: 8, marginBottom: 10 }}>
          {err}
        </div>
      )}

      <button
        onClick={() => {
          setMsg("");
          setErr("");
          setNewClient({ full_name: "", email: "", phone: "", category: "StemwithLyn" });
          setShowForm(!showForm);
          setEditClient(null);
        }}
      >
        {showForm ? "Cancel" : "Add New Client"}
      </button>

      {showForm && (
        <div className="new-client-form">
          <h2>{editClient ? "Edit Client" : "Add New Client"}</h2>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              addOrUpdateClient();
            }}
          >
            <label>
              Full Name:
              <input type="text" name="full_name" value={newClient.full_name} onChange={handleChange} required />
            </label>

            <label>
              Email:
              <input type="email" name="email" value={newClient.email} onChange={handleChange} />
            </label>

            <label>
              Phone:
              <input type="tel" name="phone" value={newClient.phone} onChange={handleChange} />
            </label>

            <label>Category:</label>
            <select name="category" value={newClient.category} onChange={handleChange} required>
              <option value="StemwithLyn">StemwithLyn</option>
              <option value="United Mentors">United Mentors</option>
              <option value="Above & Beyond Learning">Above & Beyond Learning</option>
              <option value="Club Z">Club Z</option>
            </select>

            <button type="submit">{editClient ? "Update" : "Save"}</button>
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
              <th>Category</th>
              <th>Portal</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {clients.map((client) => {
              const linked = !!client.user_id; // backend must return user_id on /api/clients

              return (
                <tr key={client.id}>
                  <td>{client.full_name}</td>
                  <td>{client.email || "—"}</td>
                  <td>{client.phone || "—"}</td>
                  <td>{client.category || "—"}</td>

                  <td>
                    {linked ? (
                      <span style={{ fontWeight: 700 }}>Linked ✅</span>
                    ) : (
                      <button
                        onClick={() => createLoginForClient(client)}
                        disabled={busyId === client.id}
                        style={{
                          opacity: busyId === client.id ? 0.6 : 1,
                          cursor: busyId === client.id ? "not-allowed" : "pointer",
                        }}
                      >
                        {busyId === client.id ? "Creating..." : "Create Login"}
                      </button>
                    )}
                  </td>

                  <td>
                    <button onClick={() => handleEdit(client)}>Edit</button>
                    <button onClick={() => handleDelete(client.id)}>Delete</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      ) : (
        <p>No clients available yet.</p>
      )}
    </div>
  );
};

export default Clients;
