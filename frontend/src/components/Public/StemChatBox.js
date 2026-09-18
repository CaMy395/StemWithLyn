import React, { useEffect, useRef, useState } from 'react';
import './StemChatBox.css';

const welcome = { role: 'assistant', content: 'Hi! I’m STEM Assistant. Ask about tutoring, technology help, packages, scheduling, or scholarships.' };
const apiUrl = process.env.REACT_APP_API_URL || 'http://localhost:3001';

const linkedText = (content) => String(content).split(/(https?:\/\/[^\s]+)/g).map((part, index) => {
  if (!part.startsWith('http')) return part;
  const url = part.replace(/[.,!?;:)]+$/, '');
  return <React.Fragment key={`${url}-${index}`}><a href={url} target="_blank" rel="noopener noreferrer">{url}</a>{part.slice(url.length)}</React.Fragment>;
});

const StemChatBox = () => {
  const [open, setOpen] = useState(false);
  const [question, setQuestion] = useState('');
  const [messages, setMessages] = useState([welcome]);
  const [loading, setLoading] = useState(false);
  const endRef = useRef(null);

  useEffect(() => { if (open) endRef.current?.scrollIntoView({ block: 'end' }); }, [messages, loading, open]);

  const send = async (text = question) => {
    const prompt = text.trim();
    if (!prompt || loading) return;
    const history = messages.filter((item) => ['user', 'assistant'].includes(item.role)).slice(-6);
    setMessages((current) => [...current, { role: 'user', content: prompt }]);
    setQuestion('');
    setLoading(true);
    try {
      const response = await fetch(`${apiUrl}/api/stem-assistant`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: prompt, history }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Chat is unavailable.');
      setMessages((current) => [...current, { role: 'assistant', content: data.answer || 'Please try asking another way.' }]);
    } catch {
      setMessages((current) => [...current, { role: 'assistant', content: 'Sorry, chat is unavailable right now. Please use the tutoring or technology intake form to contact STEM with Lyn.' }]);
    } finally { setLoading(false); }
  };

  return <div className="stem-chat">
    <button type="button" className="stem-chat-toggle" onClick={() => setOpen((value) => !value)} aria-expanded={open} aria-controls="stem-chat-panel">
      <span>{open ? 'STEM Assistant' : 'Chat with STEM Assistant'}</span><span aria-hidden="true">{open ? '×' : '✦'}</span>
    </button>
    {open && <section id="stem-chat-panel" className="stem-chat-panel" aria-label="STEM Assistant chat">
      <div className="stem-chat-messages" role="log" aria-live="polite">
        {messages.map((item, index) => <div className={`stem-chat-message ${item.role}`} key={index}><div>{linkedText(item.content)}</div></div>)}
        {loading && <p className="stem-chat-loading">Thinking…</p>}
        <div ref={endRef} />
      </div>
      {messages.length === 1 && <div className="stem-chat-suggestions">
        {['What tutoring packages are available?', 'How do I book?', 'Tell me about tech help'].map((text) => <button type="button" onClick={() => send(text)} key={text}>{text}</button>)}
      </div>}
      <form onSubmit={(event) => { event.preventDefault(); send(); }}>
        <textarea value={question} onChange={(event) => setQuestion(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); send(); } }} placeholder="Ask a question…" aria-label="Message STEM Assistant" rows={2} maxLength={2000} disabled={loading} />
        <button type="submit" disabled={loading || !question.trim()}>{loading ? 'Thinking…' : 'Send'}</button>
      </form>
      <p className="stem-chat-note">This chat cannot view your account or take payments. Please don’t share private information.</p>
    </section>}
  </div>;
};

export default StemChatBox;
