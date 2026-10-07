import React, { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import '../../LiveVisitors.css';

const api = process.env.REACT_APP_API_URL || 'http://localhost:3001';
const time = value => new Date(value).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
export default function LiveVisitors() {
  const location = useLocation();
  const selected = new URLSearchParams(location.search).get('visitor');
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [signIn, setSignIn] = useState(false);
  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    const load = async () => {
      try {
        const response = await fetch(`${api}/api/visitor-alerts/visitors${selected ? `?visitor=${encodeURIComponent(selected)}` : ''}`, {
          headers: { Authorization: `Bearer ${localStorage.getItem('portalToken') || ''}` }, signal: controller.signal,
        });
        if (response.status === 401 || response.status === 403) {
          if (active) { setSignIn(true); setData(null); setError('Please sign in as admin to see visitors.'); }
          return;
        }
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || 'Could not load visitors.');
        if (active) { setData(result); setError(''); setSignIn(false); }
      } catch (err) { if (active) setError(err.message); }
    };
    load();
    const timer = setInterval(() => { if (document.visibilityState === 'visible') load(); }, 15000);
    const onVisible = () => { if (document.visibilityState === 'visible') load(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => { active = false; controller.abort(); clearInterval(timer); document.removeEventListener('visibilitychange', onVisible); };
  }, [selected]);
  const visitors = data?.visitors || [];
  const activeVisitors = visitors.filter(visitor => visitor.active);
  const recent = visitors.filter(visitor => !visitor.active);
  const cards = list => list.map(visitor => <article key={visitor.id} className={`visitor-card ${selected === visitor.id ? 'visitor-selected' : ''}`}>
    <div className="visitor-card-heading"><h3>{visitor.name || `Anonymous visitor · ${visitor.id.slice(0, 8)}`}</h3><span className={visitor.active ? 'visitor-online' : 'visitor-away'}>{visitor.active ? 'Active now' : 'No longer active'}</span></div>
    {selected === visitor.id && <p className="visitor-alert-label">Visitor from your notification</p>}
    <p>{visitor.name ? 'Signed-in client' : 'Not signed in — name unavailable'}</p>
    <dl><div><dt>Last page</dt><dd>{visitor.page}</dd></div><div><dt>Arrived</dt><dd>{time(visitor.arrived_at)}</dd></div><div><dt>Last seen</dt><dd>{time(visitor.seen_at)}</dd></div></dl>
  </article>);
  return <main className="hub-workspace live-visitors">
    <Link to="/admin">← Admin dashboard</Link>
    <header className="hub-header"><div><span className="hub-kicker">STEM WITH LYN</span><h1>Who’s on the site</h1><p>Signed-in clients appear by name. Other visitors appear as anonymous.</p></div></header>
    {error && <p role="alert" className="visitor-error">{error}{signIn && <> <Link to="/login" state={{ from: `${location.pathname}${location.search}`, reauthenticate: true }}>Sign in</Link></>}</p>}
    {!data && !error && <p role="status">Loading visitors…</p>}
    {data && <>
      <section><h2>{activeVisitors.length} active {activeVisitors.length === 1 ? 'visitor' : 'visitors'}</h2><p>A visible page was seen in the last 2 minutes. Updates every 15 seconds.{error ? ' Showing the last successful update.' : ''}</p>
      {activeVisitors.length ? <div className="visitor-grid">{cards(activeVisitors)}</div> : <p className="visitor-empty">No visitors are active right now.</p>}</section>
      {selected && !visitors.some(visitor => visitor.id === selected) && <p className="visitor-empty">The visitor from this alert is no longer available. Visit details are kept for up to a day.</p>}
      {recent.length > 0 && <section><h2>Recently on the site</h2><p>These visitors may have left or switched away from the site.</p><div className="visitor-grid">{cards(recent)}</div></section>}
      <p className="visitor-updated">Last updated {time(data.updatedAt)}</p>
    </>}
  </main>;
}
