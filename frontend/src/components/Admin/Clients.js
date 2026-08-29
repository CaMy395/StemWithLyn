import React, { useCallback, useEffect, useMemo, useState } from "react";
import { FaCheckCircle, FaEdit, FaEnvelope, FaPhone, FaPlus, FaSearch, FaTimes, FaTrash, FaUser, FaUserLock, FaUsers } from "react-icons/fa";

const emptyClient = { full_name: "", email: "", phone: "", category: "StemwithLyn" };
const categories = ["StemwithLyn", "United Mentors", "BWLA", "Above & Beyond Learning", "Club Z"];
const initials = (name = "") => name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase() || "?";

const Clients = () => {
  const apiUrl = process.env.REACT_APP_API_URL || "http://localhost:3001";
  const [clients, setClients] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [clientForm, setClientForm] = useState(emptyClient);
  const [editClient, setEditClient] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState({ type: "", text: "" });
  const [query, setQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("All");

  const fetchClients = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(`${apiUrl}/api/clients`);
      if (!response.ok) throw new Error((await response.text()) || "Failed to fetch clients.");
      const data = await response.json();
      setClients((Array.isArray(data) ? data : []).sort((a, b) => (a.full_name || "").localeCompare(b.full_name || "")));
    } catch (error) {
      setMessage({ type: "error", text: error.message || "Failed to fetch clients." });
    } finally { setLoading(false); }
  }, [apiUrl]);

  useEffect(() => { fetchClients(); }, [fetchClients]);

  const filteredClients = useMemo(() => {
    const term = query.trim().toLowerCase();
    return clients.filter((client) => {
      const matchesCategory = categoryFilter === "All" || client.category === categoryFilter;
      const haystack = `${client.full_name || ""} ${client.email || ""} ${client.phone || ""} ${client.category || ""}`.toLowerCase();
      return matchesCategory && (!term || haystack.includes(term));
    });
  }, [categoryFilter, clients, query]);

  const linkedCount = clients.filter((client) => Boolean(client.user_id)).length;
  const openForm = (client = null) => {
    setEditClient(client);
    setClientForm(client ? { full_name: client.full_name || "", email: client.email || "", phone: client.phone || "", category: client.category || "StemwithLyn" } : emptyClient);
    setMessage({ type: "", text: "" });
    setShowForm(true);
  };

  const saveClient = async (event) => {
    event.preventDefault();
    if (!clientForm.full_name.trim()) return setMessage({ type: "error", text: "A full name is required." });
    setSaving(true); setMessage({ type: "", text: "" });
    try {
      const response = await fetch(editClient ? `${apiUrl}/api/clients/${editClient.id}` : `${apiUrl}/api/clients`, { method: editClient ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...clientForm, full_name: clientForm.full_name.trim(), email: clientForm.email.trim(), phone: clientForm.phone.trim() }) });
      if (!response.ok) throw new Error((await response.text()) || "The client could not be saved.");
      await fetchClients();
      setShowForm(false); setEditClient(null); setClientForm(emptyClient);
      setMessage({ type: "success", text: `Client ${editClient ? "updated" : "added"} successfully.` });
    } catch (error) { setMessage({ type: "error", text: error.message || "The client could not be saved." }); }
    finally { setSaving(false); }
  };

  const deleteClient = async (client) => {
    if (!window.confirm(`Delete ${client.full_name}? This cannot be undone.`)) return;
    setBusyId(client.id);
    try {
      const response = await fetch(`${apiUrl}/api/clients/${client.id}`, { method: "DELETE" });
      if (!response.ok) throw new Error((await response.text()) || "Failed to delete client.");
      setClients((current) => current.filter((item) => item.id !== client.id));
      setMessage({ type: "success", text: `${client.full_name} was deleted.` });
    } catch (error) { setMessage({ type: "error", text: error.message || "Failed to delete client." }); }
    finally { setBusyId(null); }
  };

  const createLogin = async (client) => {
    if (!client.email) return setMessage({ type: "error", text: "Add an email address before creating a portal login." });
    if (!window.confirm(`Create and email a portal login to ${client.full_name} at ${client.email}?`)) return;
    setBusyId(client.id);
    try {
      const response = await fetch(`${apiUrl}/admin/clients/${client.id}/create-login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
      if (!response.ok) throw new Error((await response.text()) || "Failed to create login.");
      const data = await response.json(); await fetchClients();
      setMessage({ type: "success", text: `Portal login created for ${client.full_name}${data?.user?.username ? ` (${data.user.username})` : ""}.` });
    } catch (error) { setMessage({ type: "error", text: error.message || "Failed to create login." }); }
    finally { setBusyId(null); }
  };

  return <main className="clients-workspace">
    <header className="clients-header"><div><span className="clients-kicker">ADMIN WORKSPACE</span><h1>Clients</h1><p>Manage contact details, organizations, and portal access.</p></div><button className="clients-primary" onClick={() => openForm()}><FaPlus /> Add client</button></header>

    <section className="client-stats">
      <article><span className="stat-icon purple"><FaUsers /></span><div><strong>{clients.length}</strong><span>Total clients</span></div></article>
      <article><span className="stat-icon green"><FaUserLock /></span><div><strong>{linkedCount}</strong><span>Portal accounts</span></div></article>
      <article><span className="stat-icon gold"><FaUser /></span><div><strong>{new Set(clients.map((client) => client.category).filter(Boolean)).size}</strong><span>Organizations</span></div></article>
    </section>

    {message.text && <div className={`clients-notice ${message.type}`}><span>{message.type === "success" ? <FaCheckCircle /> : <FaTimes />}{message.text}</span><button onClick={() => setMessage({ type: "", text: "" })}><FaTimes /></button></div>}

    <section className="clients-panel">
      <div className="clients-tools"><label className="clients-search"><FaSearch /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search name, email, phone, or organization…" /></label><select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)}><option value="All">All organizations</option>{categories.map((category) => <option key={category}>{category}</option>)}</select></div>
      <div className="clients-results-label"><strong>{filteredClients.length}</strong> {filteredClients.length === 1 ? "client" : "clients"}{query || categoryFilter !== "All" ? " found" : ""}</div>

      {loading ? <div className="clients-empty"><span className="clients-spinner" /><strong>Loading clients…</strong></div> : filteredClients.length === 0 ? <div className="clients-empty"><FaUsers /><strong>No clients found</strong><span>{clients.length ? "Try changing your search or filter." : "Add your first client to get started."}</span></div> : <div className="clients-table-wrap"><table className="clients-table"><thead><tr><th>Client</th><th>Contact</th><th>Organization</th><th>Portal access</th><th><span className="sr-only">Actions</span></th></tr></thead><tbody>{filteredClients.map((client) => <tr key={client.id}><td><div className="client-identity"><span className="client-avatar">{initials(client.full_name)}</span><div><strong>{client.full_name || "Unnamed client"}</strong><small>Client #{client.id}</small></div></div></td><td><div className="client-contact">{client.email ? <a href={`mailto:${client.email}`}><FaEnvelope /> {client.email}</a> : <span className="missing">No email</span>}{client.phone ? <a href={`tel:${client.phone}`}><FaPhone /> {client.phone}</a> : <span className="missing">No phone</span>}</div></td><td><span className="category-pill">{client.category || "Unassigned"}</span></td><td>{client.user_id ? <span className="portal-status linked"><FaCheckCircle /> Linked</span> : <button className="portal-action" disabled={busyId === client.id} onClick={() => createLogin(client)}><FaUserLock /> {busyId === client.id ? "Creating…" : "Create login"}</button>}</td><td><div className="client-actions"><button onClick={() => openForm(client)} aria-label={`Edit ${client.full_name}`}><FaEdit /></button><button className="danger" disabled={busyId === client.id} onClick={() => deleteClient(client)} aria-label={`Delete ${client.full_name}`}><FaTrash /></button></div></td></tr>)}</tbody></table></div>}
    </section>

    {showForm && <div className="client-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setShowForm(false); }}><section className="client-modal" role="dialog" aria-modal="true" aria-labelledby="client-form-title"><div className="client-modal-header"><div><span>{editClient ? "UPDATE RECORD" : "NEW RECORD"}</span><h2 id="client-form-title">{editClient ? "Edit client" : "Add a client"}</h2></div><button onClick={() => setShowForm(false)} aria-label="Close"><FaTimes /></button></div><form onSubmit={saveClient}><div className="client-form-grid"><label className="wide"><span>Full name *</span><input value={clientForm.full_name} onChange={(event) => setClientForm({ ...clientForm, full_name: event.target.value })} placeholder="First and last name" required autoFocus /></label><label><span>Email address</span><input type="email" value={clientForm.email} onChange={(event) => setClientForm({ ...clientForm, email: event.target.value })} placeholder="client@example.com" /></label><label><span>Phone number</span><input type="tel" value={clientForm.phone} onChange={(event) => setClientForm({ ...clientForm, phone: event.target.value })} placeholder="(555) 123-4567" /></label><label className="wide"><span>Organization</span><select value={clientForm.category} onChange={(event) => setClientForm({ ...clientForm, category: event.target.value })}>{categories.map((category) => <option key={category}>{category}</option>)}</select></label></div><div className="client-modal-actions"><button type="button" className="secondary" onClick={() => setShowForm(false)}>Cancel</button><button type="submit" disabled={saving}>{saving ? "Saving…" : editClient ? "Save changes" : "Add client"}</button></div></form></section></div>}
  </main>;
};

export default Clients;
