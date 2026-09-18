import React, { useCallback, useEffect, useState } from 'react';
import './StudyLibraryPage.css';

const api = process.env.REACT_APP_API_URL || 'http://localhost:3001';
const token = () => localStorage.getItem('portalToken');

async function request(path, options = {}) {
  const response = await fetch(`${api}/api/study${path}`, {
    ...options,
    headers: { Authorization: `Bearer ${token()}`, ...(options.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }), ...options.headers },
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error || 'Something went wrong. Please try again.');
  }
  return response.json();
}

export default function StudyLibraryPage({ adminMode = false }) {
  const [materials, setMaterials] = useState([]);
  const [questions, setQuestions] = useState([]);
  const [tab, setTab] = useState('notes');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState(null);
  const [answers, setAnswers] = useState({});
  const [feedback, setFeedback] = useState({});
  const [materialForm, setMaterialForm] = useState({ title: '', description: '', subject: '', grade: '', kind: 'notes', file: null });
  const [questionForm, setQuestionForm] = useState({ subject: '', grade: '', prompt: '', options: ['', '', '', ''], correctIndex: 0, explanation: '' });

  const load = useCallback(async () => {
    try {
      const [files, practice] = await Promise.all([request('/materials'), request('/questions')]);
      setMaterials(files);
      setQuestions(practice);
      setError('');
    } catch (err) { setError(err.message); }
  }, []);
  useEffect(() => { load(); }, [load]);
  useEffect(() => () => { if (preview?.url) URL.revokeObjectURL(preview.url); }, [preview]);

  const upload = async (event) => {
    event.preventDefault();
    if (!materialForm.file) { setError('Choose a file to upload.'); return; }
    setBusy(true); setError(''); setMessage('');
    const body = new FormData();
    for (const key of ['title', 'description', 'subject', 'grade', 'kind']) body.append(key, materialForm[key]);
    body.append('file', materialForm.file);
    try {
      await request('/materials', { method: 'POST', body });
      setMaterialForm({ title: '', description: '', subject: '', grade: '', kind: 'notes', file: null });
      event.target.reset();
      setMessage('Material added to the student library.');
      await load();
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  };

  const addQuestion = async (event) => {
    event.preventDefault(); setBusy(true); setError(''); setMessage('');
    const options = questionForm.options.map(value => value.trim()).filter(Boolean);
    try {
      await request('/questions', { method: 'POST', body: JSON.stringify({ ...questionForm, options, correctIndex: Number(questionForm.correctIndex) }) });
      setQuestionForm({ subject: '', grade: '', prompt: '', options: ['', '', '', ''], correctIndex: 0, explanation: '' });
      setMessage('Practice question added.');
      await load();
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  };

  const openMaterial = async (item) => {
    setError('');
    try {
      const response = await fetch(`${api}/api/study/materials/${item.id}/file`, { headers: { Authorization: `Bearer ${token()}` } });
      if (!response.ok) throw new Error('Could not open this material.');
      const url = URL.createObjectURL(await response.blob());
      if (item.mime_type.includes('wordprocessingml')) {
        const link = document.createElement('a'); link.href = url; link.download = item.file_name; link.click();
        setTimeout(() => URL.revokeObjectURL(url), 60000);
      } else setPreview({ url, title: item.title, mime: item.mime_type });
    } catch (err) { setError(err.message); }
  };

  const remove = async (kind, id) => {
    if (!window.confirm(`Delete this ${kind === 'materials' ? 'material' : 'question'}?`)) return;
    try { await request(`/${kind}/${id}`, { method: 'DELETE' }); await load(); }
    catch (err) { setError(err.message); }
  };

  const check = async (id) => {
    if (answers[id] === undefined) return;
    try { const result = await request(`/questions/${id}/check`, { method: 'POST', body: JSON.stringify({ answer: answers[id] }) }); setFeedback(current => ({ ...current, [id]: result })); }
    catch (err) { setError(err.message); }
  };

  return <main className="study-page">
    <header className="study-hero"><span>STEM WITH LYN</span><h1>Study library</h1><p>{adminMode ? 'Share notes and worked examples, then add a few practice questions.' : 'Review your notes, explore examples, and try a practice question.'}</p></header>
    {error && <p className="study-alert" role="alert">{error}</p>}
    {message && <p className="study-success" role="status">{message}</p>}
    {adminMode && <section className="study-admin-grid">
      <form className="study-panel" onSubmit={upload}><h2>Upload a material</h2><p>PDF, image, or Word document, up to 8 MB.</p>
        <label>Title<input required maxLength="160" value={materialForm.title} onChange={e => setMaterialForm({ ...materialForm, title: e.target.value })} /></label>
        <label>Type<select value={materialForm.kind} onChange={e => setMaterialForm({ ...materialForm, kind: e.target.value })}><option value="notes">Notes</option><option value="examples">Worked example</option></select></label>
        <div className="study-fields"><label>Subject<input maxLength="80" placeholder="e.g. Algebra" value={materialForm.subject} onChange={e => setMaterialForm({ ...materialForm, subject: e.target.value })} /></label><label>Grade or level<input maxLength="40" placeholder="e.g. Grade 8" value={materialForm.grade} onChange={e => setMaterialForm({ ...materialForm, grade: e.target.value })} /></label></div>
        <label>Description<textarea maxLength="1000" value={materialForm.description} onChange={e => setMaterialForm({ ...materialForm, description: e.target.value })} /></label>
        <label>File<input required type="file" accept=".pdf,.png,.jpg,.jpeg,.webp,.docx" onChange={e => setMaterialForm({ ...materialForm, file: e.target.files[0] || null })} /></label>
        <button disabled={busy}>Upload to library</button>
      </form>
      <form className="study-panel" onSubmit={addQuestion}><h2>Add a practice question</h2><p>Students choose an answer and see your explanation.</p>
        <div className="study-fields"><label>Subject<input maxLength="80" value={questionForm.subject} onChange={e => setQuestionForm({ ...questionForm, subject: e.target.value })} /></label><label>Grade or level<input maxLength="40" value={questionForm.grade} onChange={e => setQuestionForm({ ...questionForm, grade: e.target.value })} /></label></div>
        <label>Question<textarea required maxLength="1000" value={questionForm.prompt} onChange={e => setQuestionForm({ ...questionForm, prompt: e.target.value })} /></label>
        {questionForm.options.map((value, index) => <label key={index}>Choice {index + 1}{index < 2 ? ' (required)' : ''}<input required={index < 2} maxLength="300" value={value} onChange={e => { const options = [...questionForm.options]; options[index] = e.target.value; setQuestionForm({ ...questionForm, options }); }} /></label>)}
        <label>Correct choice<select value={questionForm.correctIndex} onChange={e => setQuestionForm({ ...questionForm, correctIndex: Number(e.target.value) })}>{questionForm.options.map((_, index) => <option key={index} value={index}>Choice {index + 1}</option>)}</select></label>
        <label>Explanation<textarea maxLength="1000" value={questionForm.explanation} onChange={e => setQuestionForm({ ...questionForm, explanation: e.target.value })} /></label>
        <button disabled={busy}>Add question</button>
      </form>
    </section>}
    <div className="study-tabs" role="tablist"><button className={tab === 'notes' ? 'active' : ''} onClick={() => setTab('notes')}>Notes ({materials.filter(m => m.kind === 'notes').length})</button><button className={tab === 'examples' ? 'active' : ''} onClick={() => setTab('examples')}>Worked examples ({materials.filter(m => m.kind === 'examples').length})</button><button className={tab === 'practice' ? 'active' : ''} onClick={() => setTab('practice')}>Practice ({questions.length})</button></div>
    {tab !== 'practice' ? <section className="study-list">{materials.filter(m => m.kind === tab).length === 0 && <p className="study-empty">No {tab === 'notes' ? 'notes' : 'worked examples'} have been added yet.</p>}{materials.filter(m => m.kind === tab).map(item => <article className="study-card" key={item.id}><div><span className="study-meta">{[item.subject, item.grade].filter(Boolean).join(' · ') || 'STEM'}</span><h2>{item.title}</h2>{item.description && <p>{item.description}</p>}<small>{item.file_name}</small></div><div className="study-actions"><button onClick={() => openMaterial(item)}>Open material</button>{adminMode && <button className="study-danger" onClick={() => remove('materials', item.id)}>Delete</button>}</div></article>)}</section> : <section className="study-list">{questions.length === 0 && <p className="study-empty">Practice questions will appear here when added.</p>}{questions.map(question => <article className="study-card study-question" key={question.id}><span className="study-meta">{[question.subject, question.grade].filter(Boolean).join(' · ') || 'STEM'}</span><h2>{question.prompt}</h2><div className="study-options">{question.options.map((option, index) => <label key={index}><input type="radio" name={`question-${question.id}`} checked={answers[question.id] === index} onChange={() => { setAnswers({ ...answers, [question.id]: index }); setFeedback(current => ({ ...current, [question.id]: null })); }} />{option}</label>)}</div>{adminMode ? <div><p className="study-answer">Correct: {question.options[question.correct_index]}</p>{question.explanation && <p>{question.explanation}</p>}<button className="study-danger" onClick={() => remove('questions', question.id)}>Delete</button></div> : <div><button disabled={answers[question.id] === undefined} onClick={() => check(question.id)}>Check answer</button>{feedback[question.id] && <p className={feedback[question.id].correct ? 'study-success' : 'study-alert'} role="status">{feedback[question.id].correct ? 'Correct!' : `Try again. The answer is: ${question.options[feedback[question.id].correctIndex]}`}{feedback[question.id].explanation && ` ${feedback[question.id].explanation}`}</p>}</div>}</article>)}</section>}
    {preview && <div className="study-modal" role="dialog" aria-modal="true" aria-label={preview.title}><div className="study-modal-content"><div className="study-modal-header"><h2>{preview.title}</h2><button onClick={() => setPreview(null)} aria-label="Close material">×</button></div>{preview.mime === 'application/pdf' ? <iframe title={preview.title} src={preview.url} /> : <img src={preview.url} alt={preview.title} />}</div></div>}
  </main>;
}
