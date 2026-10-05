import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import '../../PortalMessages.css';

const apiUrl = process.env.REACT_APP_API_URL || 'http://localhost:3001';
const request = async (path, options = {}) => {
  const response = await fetch(`${apiUrl}/api/messages${path}`, {
    ...options, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('portalToken') || ''}` },
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Could not load messages.');
  return data;
};
const currentUser = () => { try { return JSON.parse(localStorage.getItem('loggedInUser') || '{}') || {}; } catch { return {}; } };

export function MessageLink({ admin = false }) {
  const [unread, setUnread] = useState(0);
  useEffect(() => {
    let active = true;
    const load = () => request('/conversations').then(data => { if (active) setUnread(data.reduce((sum, item) => sum + item.unread, 0)); }).catch(() => {});
    load(); const timer = setInterval(load, 30000);
    return () => { active = false; clearInterval(timer); };
  }, []);
  return <Link to={admin ? '/admin/messages' : '/client-portal/messages'}>{admin ? 'Client messages' : 'Message Lyn'}{unread > 0 && <span className="message-badge" aria-label={`${unread} unread messages`}>{unread}</span>}</Link>;
}

export default function PortalMessages({ admin = false }) {
  const user = currentUser();
  const [conversations, setConversations] = useState([]);
  const [selected, setSelected] = useState(admin ? '' : String(user.id || localStorage.getItem('userId') || ''));
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [contact, setContact] = useState(null);
  const generation = useRef(0);
  const bottom = useRef(null);
  useEffect(() => {
    let active = true;
    request('/contact-info').then(data => { if (active) setContact(data); }).catch(() => {});
    return () => { active = false; };
  }, []);
  const load = useCallback(async () => {
    const version = ++generation.current;
    try {
      const [inbox, history] = await Promise.all([request('/conversations'), selected ? request(`/${selected}`) : Promise.resolve([])]);
      if (version !== generation.current) return;
      setConversations(inbox); setMessages(history); setError('');
      if (history.length && document.visibilityState === 'visible') {
        await request(`/${selected}/read`, { method: 'POST', body: JSON.stringify({ throughId: history[history.length - 1].id }) });
        if (version === generation.current) setConversations(items => items.map(item => String(item.id) === selected ? { ...item, unread: 0 } : item));
      }
    } catch (e) { if (version === generation.current) setError(e.message); }
    finally { if (version === generation.current) setLoading(false); }
  }, [selected]);
  useEffect(() => {
    const requestGeneration = generation;
    setMessages([]); setLoading(true); load();
    const timer = setInterval(load, 20000);
    const visible = () => { if (document.visibilityState === 'visible') load(); };
    document.addEventListener('visibilitychange', visible);
    return () => { ++requestGeneration.current; clearInterval(timer); document.removeEventListener('visibilitychange', visible); };
  }, [load]);
  const lastId = messages[messages.length - 1]?.id;
  useEffect(() => { bottom.current?.scrollIntoView({ block: 'nearest' }); }, [lastId]);
  const send = async e => {
    e.preventDefault(); if (sending || !draft.trim() || !selected) return;
    setSending(true); setError('');
    try {
      await request(`/${selected}`, { method: 'POST', body: JSON.stringify({ body: draft }) });
      setDraft(''); await load();
    } catch (err) { setError(err.message); }
    finally { setSending(false); }
  };
  const name = conversations.find(item => String(item.id) === selected)?.name;
  return <main className="messages-page">
    <Link to={admin ? '/admin' : '/client-portal'}>← Back to {admin ? 'dashboard' : 'my portal'}</Link>
    <header><span className="messages-eyebrow">STEM WITH LYN</span><h1>{admin ? 'Client messages' : 'Message Lyn'}</h1><p>{admin ? 'Keep every client conversation in one place.' : 'Questions about your sessions? Send Lyn a message here and check back for her reply.'}</p></header>
    {!admin && contact?.phone && <p><a href={`tel:${contact.phone}`}>Call Lyn: {contact.phone}</a></p>}
    {error && <div className="messages-error" role="alert">{error} <button onClick={load}>Try again</button></div>}
    <div className={`messages-layout ${admin ? 'with-inbox' : ''}`}>
      {admin && <aside aria-label="Client conversations">{!loading && !conversations.length && <p>No client messages yet.</p>}{conversations.map(item => <button disabled={sending} className={String(item.id) === selected ? 'active' : ''} key={item.id} onClick={() => { setSelected(String(item.id)); setDraft(''); }}><strong>{item.name}{item.unread > 0 && <span className="message-badge">{item.unread}</span>}</strong><span>{item.preview}</span><small>{new Date(item.updated_at).toLocaleDateString()}</small></button>)}</aside>}
      <section className="message-conversation" aria-label="Conversation">
        <h2>{admin ? name || 'Choose a conversation' : 'Your conversation with Lyn'}</h2>
        <div className="message-history" aria-live="polite" aria-busy={loading}>
          {loading ? <p>Loading messages…</p> : !messages.length && selected ? <p className="message-empty">Start the conversation below.</p> : null}
          {messages.map(message => <article key={message.id} className={`message-bubble ${message.from_admin === admin ? 'mine' : ''}`}><strong>{message.from_admin ? 'Lyn' : admin ? name || 'Client' : 'You'}</strong><p>{message.body}</p><small>{new Date(message.created_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</small></article>)}<div ref={bottom}/>
        </div>
        {selected && <form onSubmit={send}><label htmlFor="message-draft">{admin ? 'Reply to client' : 'Your message'}</label><textarea id="message-draft" value={draft} maxLength={4000} disabled={sending} onChange={e => setDraft(e.target.value)} placeholder="Write your message…" rows={4}/><div><small>{draft.length}/4,000</small><button disabled={sending || !draft.trim() || loading}>{sending ? 'Sending…' : 'Send message'}</button></div></form>}
      </section>
    </div>
  </main>;
}
