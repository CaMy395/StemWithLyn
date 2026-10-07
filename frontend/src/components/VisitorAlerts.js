import React, { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';

const api = process.env.REACT_APP_API_URL || 'http://localhost:3001';
const supported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
async function request(path, options = {}) {
  const response = await fetch(`${api}/api/visitor-alerts${path}`, {
    ...options, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('portalToken') || ''}` },
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Could not update visitor alerts.');
  return data;
}
const registration = async () => {
  await navigator.serviceWorker.register('/visitor-push-sw.js');
  return navigator.serviceWorker.ready;
};

export function VisitorTracking({ userRole }) {
  const { pathname } = useLocation();
  useEffect(() => {
    if ('serviceWorker' in navigator) navigator.serviceWorker.getRegistration('/').then(reg => reg?.update()).catch(() => {});
  }, []);
  useEffect(() => {
    const visit = () => {
      if (document.visibilityState !== 'visible') return;
      try {
        let id = localStorage.getItem('visitorSessionId');
        if (!id) { id = window.crypto.randomUUID(); localStorage.setItem('visitorSessionId', id); }
        const token = localStorage.getItem('portalToken');
        fetch(`${api}/api/visitor-alerts/visit`, {
          method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
          body: JSON.stringify({ id, page: pathname }),
        }).catch(() => {});
      } catch { /* Visitor alerts never interrupt browsing. */ }
    };
    visit();
    if (userRole === 'admin') return;
    const timer = setInterval(visit, 30000);
    document.addEventListener('visibilitychange', visit);
    return () => { clearInterval(timer); document.removeEventListener('visibilitychange', visit); };
  }, [userRole, pathname]);
  return null;
}

export default function VisitorAlerts() {
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(true);
  const [message, setMessage] = useState('');
  useEffect(() => {
    let active = true;
    (async () => {
      if (supported()) {
        const reg = await navigator.serviceWorker.getRegistration('/');
        if (reg) await reg.update();
        const subscription = await reg?.pushManager.getSubscription();
        if (subscription && Notification.permission === 'granted') {
          await request('/subscription', { method: 'POST', body: JSON.stringify(subscription) });
          if (active) setEnabled(true);
        }
      }
    })().catch(error => { if (active) setMessage(error.message); }).finally(() => { if (active) setBusy(false); });
    return () => { active = false; };
  }, []);
  async function change() {
    setBusy(true); setMessage('');
    try {
      if (!supported()) throw new Error('Open this site in a browser that supports push notifications. On iPhone, add it to your Home Screen first.');
      // Request permission directly from the tap, before network or worker waits.
      if (!enabled && await Notification.requestPermission() !== 'granted') throw new Error('Allow notifications in your browser settings to receive visitor alerts.');
      const reg = await registration();
      let subscription = await reg.pushManager.getSubscription();
      if (enabled) {
        if (subscription) {
          await request('/subscription', { method: 'DELETE', body: JSON.stringify({ endpoint: subscription.endpoint }) });
          await subscription.unsubscribe();
        }
        setEnabled(false); setMessage('Visitor alerts are off on this device.');
      } else {
        const { publicKey } = await request('/key');
        const padded = publicKey.replace(/-/g, '+').replace(/_/g, '/');
        const key = Uint8Array.from(atob(padded), character => character.charCodeAt(0));
        subscription = subscription || await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
        await request('/subscription', { method: 'POST', body: JSON.stringify(subscription) });
        setEnabled(true); setMessage('Visitor alerts are on for this device. Send a test to check delivery.');
      }
    } catch (error) { setMessage(error.message); }
    finally { setBusy(false); }
  }
  async function test() {
    setBusy(true); setMessage('');
    try {
      const subscription = await (await registration()).pushManager.getSubscription();
      if (!subscription) throw new Error('Enable visitor alerts again on this device.');
      await request('/test', { method: 'POST', body: JSON.stringify({ endpoint: subscription.endpoint }) });
      setMessage('Test alert sent. Check your notifications.');
    } catch (error) { setMessage(error.message); }
    finally { setBusy(false); }
  }
  return <section className="hub-intro visitor-alert-controls" aria-label="Visitor alerts">
    <h2>Visitor alerts</h2><p>Get a push notification when someone arrives on your site. Your own admin visits are excluded.</p>
    <p><Link to="/admin/visitors">See who is on the site →</Link></p>
    <p>Enable on each device where you want alerts. On iPhone or iPad, add this site to your Home Screen and open it from there first.</p>
    <button onClick={change} disabled={busy}>{busy ? 'Please wait…' : enabled ? 'Disable visitor alerts' : 'Enable visitor alerts'}</button>{' '}
    {enabled && <button onClick={test} disabled={busy}>Send test alert</button>}
    {message && <p role="status">{message}</p>}
  </section>;
}
