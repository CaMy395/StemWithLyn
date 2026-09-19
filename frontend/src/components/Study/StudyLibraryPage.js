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
  const [folders, setFolders] = useState([]);
  const [unfiledCount, setUnfiledCount] = useState(0);
  const [selectedFolder, setSelectedFolder] = useState('');
  const [folderName, setFolderName] = useState('');
  const [questions, setQuestions] = useState([]);
  const [tab, setTab] = useState('notes');
  const [selectedNoteId, setSelectedNoteId] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState(null);
  const [answers, setAnswers] = useState({});
  const [feedback, setFeedback] = useState({});
  const [materialForm, setMaterialForm] = useState({ folderId: '', title: '', description: '', subject: '', grade: '', kind: 'notes', file: null });
  const [questionForm, setQuestionForm] = useState({ materialId: '', subject: '', grade: '', prompt: '', options: ['', '', '', ''], correctIndex: 0, explanation: '' });
  const folderById = new Map(folders.map(folder => [String(folder.id), folder]));
  const currentFolder = folderById.get(selectedFolder);
  const childFolders = folders.filter(folder => selectedFolder
    ? String(folder.parent_id || '') === selectedFolder
    : !folder.parent_id);
  const folderPath = currentFolder ? (() => {
    const path = [];
    let folder = currentFolder;
    while (folder) {
      path.unshift(folder);
      folder = folderById.get(String(folder.parent_id));
    }
    return path;
  })() : [];
  const folderLabel = (folder) => {
    const names = [folder.name];
    let parent = folderById.get(String(folder.parent_id));
    while (parent) {
      names.unshift(parent.name);
      parent = folderById.get(String(parent.parent_id));
    }
    return names.join(' / ');
  };
  const notes = materials.filter(item => item.kind === 'notes');
  const folderMaterials = materials.filter(item => selectedFolder === 'unfiled' ? !item.folder_id : String(item.folder_id) === selectedFolder);
  const folderNotes = folderMaterials.filter(item => item.kind === 'notes');
  const unlinkedQuestions = questions.filter(question => !question.material_id);
  const folderQuestions = questions.filter(question =>
    folderNotes.some(note => String(note.id) === String(question.material_id)) ||
    (selectedFolder === 'unfiled' && !question.material_id)
  );
  const visibleQuestions = selectedNoteId ? questions.filter(question => String(question.material_id) === selectedNoteId) : folderQuestions;

  const load = useCallback(async () => {
    try {
      const [files, practice, folderData] = await Promise.all([request('/materials'), request('/questions'), request('/folders')]);
      setMaterials(files);
      setQuestions(practice);
      setFolders(folderData.folders || []);
      setUnfiledCount(folderData.unfiledCount || 0);
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
    for (const key of ['folderId', 'title', 'description', 'subject', 'grade', 'kind']) body.append(key, materialForm[key]);
    body.append('file', materialForm.file);
    try {
      const saved = await request('/materials', { method: 'POST', body });
      if (saved.kind === 'notes') setQuestionForm(current => ({ ...current, materialId: String(saved.id) }));
      setMaterialForm(current => ({ folderId: current.folderId, title: '', description: '', subject: '', grade: '', kind: 'notes', file: null }));
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
      setQuestionForm({ materialId: questionForm.materialId, subject: '', grade: '', prompt: '', options: ['', '', '', ''], correctIndex: 0, explanation: '' });
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

  const linkQuestion = async (id, materialId) => {
    if (!materialId) return;
    try {
      await request(`/questions/${id}/note`, { method: 'PATCH', body: JSON.stringify({ materialId: Number(materialId) }) });
      setMessage('Question linked to note.');
      await load();
    } catch (err) { setError(err.message); }
  };

  const createFolder = async (event) => {
    event.preventDefault();
    try {
      const parentId = selectedFolder && selectedFolder !== 'unfiled' ? Number(selectedFolder) : null;
      const folder = await request('/folders', { method: 'POST', body: JSON.stringify({ name: folderName, parentId }) });
      setFolderName(''); setSelectedFolder(String(folder.id));
      setMaterialForm(current => ({ ...current, folderId: String(folder.id) }));
      setMessage('Folder created.'); await load();
    } catch (err) { setError(err.message); }
  };

  const deleteFolder = async (id) => {
    if (!window.confirm('Delete this empty folder?')) return;
    const folder = folders.find(item => String(item.id) === String(id));
    try { await request(`/folders/${id}`, { method: 'DELETE' }); setSelectedFolder(folder?.parent_id ? String(folder.parent_id) : ''); await load(); }
    catch (err) { setError(err.message); }
  };

  const openFolder = (id) => {
    setSelectedFolder(String(id)); setSelectedNoteId(''); setTab('notes');
    setMaterialForm(current => ({ ...current, folderId: String(id) }));
  };

  const moveMaterial = async (id, folderId) => {
    if (!folderId) return;
    try { await request(`/materials/${id}/folder`, { method: 'PATCH', body: JSON.stringify({ folderId: Number(folderId) }) }); await load(); }
    catch (err) { setError(err.message); }
  };

  return <main className="study-page">
    <header className="study-hero"><span>STEM WITH LYN</span><h1>Study library</h1><p>{adminMode ? 'Share notes and worked examples, then add a few practice questions.' : 'Review your notes, explore examples, and try a practice question.'}</p></header>
    {error && <p className="study-alert" role="alert">{error}</p>}
    {message && <p className="study-success" role="status">{message}</p>}
    {adminMode && selectedFolder !== 'unfiled' && <form className="study-folder-create" onSubmit={createFolder}><label>{selectedFolder ? `New subfolder inside ${currentFolder?.name || 'folder'}` : 'New folder'}<input required maxLength="80" value={folderName} onChange={event => setFolderName(event.target.value)} placeholder={selectedFolder ? 'e.g. Algebra' : 'e.g. 8th Grade'} /></label><button>Create folder</button></form>}
    {adminMode && <section className="study-admin-grid">
      <form className="study-panel" onSubmit={upload}><h2>Upload a material</h2><p>PDF, image, or Word document, up to 8 MB.</p>
        <label>Folder<select required value={materialForm.folderId} onChange={e => setMaterialForm({ ...materialForm, folderId: e.target.value })}><option value="">Choose a folder</option>{folders.map(folder => <option key={folder.id} value={folder.id}>{folderLabel(folder)}</option>)}</select></label>
        <label>Title<input required maxLength="160" value={materialForm.title} onChange={e => setMaterialForm({ ...materialForm, title: e.target.value })} /></label>
        <label>Type<select value={materialForm.kind} onChange={e => setMaterialForm({ ...materialForm, kind: e.target.value })}><option value="notes">Notes</option><option value="examples">Worked example</option></select></label>
        <div className="study-fields"><label>Subject<input maxLength="80" placeholder="e.g. Algebra" value={materialForm.subject} onChange={e => setMaterialForm({ ...materialForm, subject: e.target.value })} /></label><label>Grade or level<input maxLength="40" placeholder="e.g. Grade 8" value={materialForm.grade} onChange={e => setMaterialForm({ ...materialForm, grade: e.target.value })} /></label></div>
        <label>Description<textarea maxLength="1000" value={materialForm.description} onChange={e => setMaterialForm({ ...materialForm, description: e.target.value })} /></label>
        <label>File<input required type="file" accept=".pdf,.png,.jpg,.jpeg,.webp,.docx" onChange={e => setMaterialForm({ ...materialForm, file: e.target.files[0] || null })} /></label>
        <button disabled={busy}>Upload to library</button>
      </form>
      <form className="study-panel" onSubmit={addQuestion}><h2>Add a practice question</h2><p>Students choose an answer and see your explanation.</p>
        <label>Linked note<select required value={questionForm.materialId} onChange={e => setQuestionForm({ ...questionForm, materialId: e.target.value })}><option value="">Choose a note</option>{notes.map(note => <option key={note.id} value={note.id}>{note.title}</option>)}</select></label>
        {notes.length === 0 && <p>Upload a note first to add its practice questions.</p>}
        <div className="study-fields"><label>Subject<input maxLength="80" value={questionForm.subject} onChange={e => setQuestionForm({ ...questionForm, subject: e.target.value })} /></label><label>Grade or level<input maxLength="40" value={questionForm.grade} onChange={e => setQuestionForm({ ...questionForm, grade: e.target.value })} /></label></div>
        <label>Question<textarea required maxLength="1000" value={questionForm.prompt} onChange={e => setQuestionForm({ ...questionForm, prompt: e.target.value })} /></label>
        {questionForm.options.map((value, index) => <label key={index}>Choice {index + 1}{index < 2 ? ' (required)' : ''}<input required={index < 2} maxLength="300" value={value} onChange={e => { const options = [...questionForm.options]; options[index] = e.target.value; setQuestionForm({ ...questionForm, options }); }} /></label>)}
        <label>Correct choice<select value={questionForm.correctIndex} onChange={e => setQuestionForm({ ...questionForm, correctIndex: Number(e.target.value) })}>{questionForm.options.map((_, index) => <option key={index} value={index}>Choice {index + 1}</option>)}</select></label>
        <label>Explanation<textarea maxLength="1000" value={questionForm.explanation} onChange={e => setQuestionForm({ ...questionForm, explanation: e.target.value })} /></label>
        <button disabled={busy || notes.length === 0}>Add question</button>
      </form>
    </section>}
    {!selectedFolder ? <section><h2>Folders</h2><div className="study-folder-grid">{childFolders.map(folder => <article className="study-folder" key={folder.id}><button onClick={() => openFolder(folder.id)}><span className="study-folder-icon">📁</span><strong>{folder.name}</strong><small>{folder.material_count} file{Number(folder.material_count) === 1 ? '' : 's'} · {folder.child_count} folder{Number(folder.child_count) === 1 ? '' : 's'}</small></button>{adminMode && Number(folder.material_count) === 0 && Number(folder.child_count) === 0 && <button className="study-folder-delete" onClick={() => deleteFolder(folder.id)}>Delete</button>}</article>)}{(unfiledCount > 0 || unlinkedQuestions.length > 0) && <article className="study-folder"><button onClick={() => { setSelectedFolder('unfiled'); setSelectedNoteId(''); setTab('notes'); }}><span className="study-folder-icon">📂</span><strong>Unfiled</strong><small>{unfiledCount} file{unfiledCount === 1 ? '' : 's'}{unlinkedQuestions.length > 0 ? ` · ${unlinkedQuestions.length} unlinked question${unlinkedQuestions.length === 1 ? '' : 's'}` : ''}</small></button></article>}</div>{childFolders.length === 0 && unfiledCount === 0 && unlinkedQuestions.length === 0 && <p className="study-empty">Create the first grade folder to start organizing the library.</p>}</section> : <>
    <div className="study-folder-heading"><button onClick={() => { setSelectedFolder(currentFolder?.parent_id ? String(currentFolder.parent_id) : ''); setSelectedNoteId(''); }}>← Back</button><div className="study-breadcrumbs"><button onClick={() => setSelectedFolder('')}>Folders</button>{folderPath.map(folder => <React.Fragment key={folder.id}><span>/</span><button onClick={() => openFolder(folder.id)}>{folder.name}</button></React.Fragment>)}{selectedFolder === 'unfiled' && <><span>/</span><strong>Unfiled</strong></>}</div></div>
    {selectedFolder !== 'unfiled' && childFolders.length > 0 && <section className="study-subfolders"><h3>Folders</h3><div className="study-folder-grid">{childFolders.map(folder => <article className="study-folder" key={folder.id}><button onClick={() => openFolder(folder.id)}><span className="study-folder-icon">📁</span><strong>{folder.name}</strong><small>{folder.material_count} file{Number(folder.material_count) === 1 ? '' : 's'} · {folder.child_count} folder{Number(folder.child_count) === 1 ? '' : 's'}</small></button>{adminMode && Number(folder.material_count) === 0 && Number(folder.child_count) === 0 && <button className="study-folder-delete" onClick={() => deleteFolder(folder.id)}>Delete</button>}</article>)}</div></section>}
    <div className="study-tabs" role="tablist"><button className={tab === 'notes' ? 'active' : ''} onClick={() => setTab('notes')}>Notes ({folderNotes.length})</button><button className={tab === 'examples' ? 'active' : ''} onClick={() => setTab('examples')}>Worked examples ({folderMaterials.filter(m => m.kind === 'examples').length})</button><button className={tab === 'practice' ? 'active' : ''} onClick={() => setTab('practice')}>Practice ({folderQuestions.length})</button></div>
    {tab !== 'practice' ? <section className="study-list">
      {folderMaterials.filter(item => item.kind === tab).length === 0 && <p className="study-empty">No {tab === 'notes' ? 'notes' : 'worked examples'} have been added here yet.</p>}
      {folderMaterials.filter(item => item.kind === tab).map(item => {
        const count = questions.filter(question => String(question.material_id) === String(item.id)).length;
        return <article className="study-card" key={item.id}>
          <div><span className="study-meta">{[item.subject, item.grade].filter(Boolean).join(' · ') || 'STEM'}</span><h2>{item.title}</h2>{item.description && <p>{item.description}</p>}<small>{item.file_name}</small></div>
          <div className="study-actions"><button onClick={() => openMaterial(item)}>Open material</button>
            {item.kind === 'notes' && <button onClick={() => { setSelectedNoteId(String(item.id)); setTab('practice'); }}>Practice ({count})</button>}
            {adminMode && <label className="study-move">Move to<select value={item.folder_id || ''} onChange={event => moveMaterial(item.id, event.target.value)}><option value="">Choose folder</option>{folders.map(folder => <option key={folder.id} value={folder.id}>{folderLabel(folder)}</option>)}</select></label>}
            {adminMode && <button className="study-danger" onClick={() => remove('materials', item.id)}>Delete</button>}
          </div>
        </article>;
      })}
    </section> : <section className="study-list">
      <label className="study-note-filter">Questions for note<select value={selectedNoteId} onChange={event => setSelectedNoteId(event.target.value)}><option value="">All notes</option>{folderNotes.map(note => <option key={note.id} value={note.id}>{note.title}</option>)}</select></label>
      {visibleQuestions.length === 0 && <p className="study-empty">No practice questions for this note yet.</p>}
      {visibleQuestions.map(question => <article className="study-card study-question" key={question.id}>
        <span className="study-meta">{[question.subject, question.grade].filter(Boolean).join(' · ') || 'STEM'} · {question.material_title || 'Unlinked question'}</span>
        <h2>{question.prompt}</h2>
        <div className="study-options">{question.options.map((option, index) => <label key={index}><input type="radio" name={`question-${question.id}`} checked={answers[question.id] === index} onChange={() => { setAnswers({ ...answers, [question.id]: index }); setFeedback(current => ({ ...current, [question.id]: null })); }} />{option}</label>)}</div>
        {adminMode ? <div>
          <label className="study-note-filter">Linked note<select value={question.material_id || ''} onChange={event => linkQuestion(question.id, event.target.value)}><option value="">Choose a note</option>{notes.map(note => <option key={note.id} value={note.id}>{note.title}</option>)}</select></label>
          <p className="study-answer">Correct: {question.options[question.correct_index]}</p>{question.explanation && <p>{question.explanation}</p>}
          <button className="study-danger" onClick={() => remove('questions', question.id)}>Delete</button>
        </div> : <div>
          <button disabled={answers[question.id] === undefined} onClick={() => check(question.id)}>Check answer</button>
          {feedback[question.id] && <p className={feedback[question.id].correct ? 'study-success' : 'study-alert'} role="status">{feedback[question.id].correct ? 'Correct!' : `Try again. The answer is: ${question.options[feedback[question.id].correctIndex]}`}{feedback[question.id].explanation && ` ${feedback[question.id].explanation}`}</p>}
        </div>}
      </article>)}
    </section>}</>}
    {preview && <div className="study-modal" role="dialog" aria-modal="true" aria-label={preview.title}><div className="study-modal-content"><div className="study-modal-header"><h2>{preview.title}</h2><button onClick={() => setPreview(null)} aria-label="Close material">×</button></div>{preview.mime === 'application/pdf' ? <iframe title={preview.title} src={preview.url} /> : <img src={preview.url} alt={preview.title} />}</div></div>}
  </main>;
}
