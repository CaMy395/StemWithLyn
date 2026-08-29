import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { FaArrowDown, FaArrowUp, FaChartLine, FaEdit, FaPlus, FaSearch, FaTimes, FaTrash, FaWallet } from 'react-icons/fa';

const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
const parseAmount = (value) => Number(String(value ?? '').replace(/[$,]/g, '')) || 0;
const dateKey = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const emptyForm = { category: 'Income', description: '', amount: '', type: 'Income' };
const transactionKind = (row) => {
  const words = `${row.type || ''} ${row.category || ''}`.toLowerCase();
  if (/expense|staff payment|payout|pay out|cost/.test(words) || parseAmount(row.amount) < 0) return 'expense';
  return 'income';
};

const Profits = () => {
  const apiUrl = process.env.REACT_APP_API_URL || 'http://localhost:3001';
  const now = useMemo(() => new Date(), []);
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState({ type: '', text: '' });
  const [query, setQuery] = useState('');
  const [kind, setKind] = useState('all');
  const [startDate, setStartDate] = useState(dateKey(new Date(now.getFullYear(), 0, 1)));
  const [endDate, setEndDate] = useState(dateKey(now));
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState(null);

  const fetchTransactions = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(`${apiUrl}/api/profits`);
      if (!response.ok) throw new Error((await response.text()) || 'Failed to load financial activity.');
      const data = await response.json();
      setTransactions((Array.isArray(data) ? data : []).sort((a, b) => new Date(b.created_at) - new Date(a.created_at)));
    } catch (error) { setMessage({ type: 'error', text: error.message || 'Failed to load financial activity.' }); }
    finally { setLoading(false); }
  }, [apiUrl]);
  useEffect(() => { fetchTransactions(); }, [fetchTransactions]);

  const filtered = useMemo(() => transactions.filter((row) => {
    const rowKind = transactionKind(row);
    const text = `${row.category || ''} ${row.description || ''} ${row.type || ''}`.toLowerCase();
    const date = row.created_at ? new Date(row.created_at) : null;
    if (query.trim() && !text.includes(query.trim().toLowerCase())) return false;
    if (kind !== 'all' && rowKind !== kind) return false;
    if (date && startDate && date < new Date(`${startDate}T00:00:00`)) return false;
    if (date && endDate && date > new Date(`${endDate}T23:59:59`)) return false;
    return Boolean(date);
  }), [endDate, kind, query, startDate, transactions]);

  const totals = useMemo(() => filtered.reduce((sum, row) => {
    const amount = Math.abs(parseAmount(row.amount));
    if (transactionKind(row) === 'expense') sum.expenses += amount; else sum.income += amount;
    sum.net = sum.income - sum.expenses;
    return sum;
  }, { income: 0, expenses: 0, net: 0 }), [filtered]);
  const margin = totals.income ? (totals.net / totals.income) * 100 : 0;

  const openForm = (row = null) => { setEditing(row); setForm(row ? { category: row.category || '', description: row.description || '', amount: Math.abs(parseAmount(row.amount)), type: row.type || transactionKind(row) } : emptyForm); setShowForm(true); setMessage({ type: '', text: '' }); };
  const saveTransaction = async (event) => {
    event.preventDefault();
    if (!form.description.trim() || !form.category.trim() || !Number.isFinite(Number(form.amount)) || Number(form.amount) <= 0) return setMessage({ type: 'error', text: 'Complete the category, description, and a positive amount.' });
    setSaving(true);
    try {
      const response = await fetch(editing ? `${apiUrl}/api/profits/${editing.id}` : `${apiUrl}/api/profits`, { method: editing ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...form, amount: Number(form.amount), type: form.type }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error || 'Transaction could not be saved.');
      await fetchTransactions(); setShowForm(false); setEditing(null); setForm(emptyForm);
      setMessage({ type: 'success', text: `Transaction ${editing ? 'updated' : 'added'} successfully.` });
    } catch (error) { setMessage({ type: 'error', text: error.message || 'Transaction could not be saved.' }); }
    finally { setSaving(false); }
  };
  const deleteTransaction = async (row) => {
    if (!window.confirm(`Delete “${row.description}”? This cannot be undone.`)) return;
    setDeletingId(row.id);
    try {
      const response = await fetch(`${apiUrl}/api/profits/${row.id}`, { method: 'DELETE' }); const data = await response.json();
      if (!response.ok) throw new Error(data?.error || 'Transaction could not be deleted.');
      setTransactions((current) => current.filter((item) => item.id !== row.id)); setMessage({ type: 'success', text: 'Transaction deleted.' });
    } catch (error) { setMessage({ type: 'error', text: error.message || 'Transaction could not be deleted.' }); }
    finally { setDeletingId(null); }
  };

  return <main className="finance-workspace">
    <header className="finance-header"><div><span className="finance-kicker">ADMIN WORKSPACE</span><h1>Profit & loss</h1><p>Track income, expenses, and net performance.</p></div><button className="finance-primary" onClick={() => openForm()}><FaPlus /> Add transaction</button></header>
    <section className="finance-stats"><article className="income"><span><FaArrowUp /></span><div><small>INCOME</small><strong>{money.format(totals.income)}</strong><em>{filtered.filter((row) => transactionKind(row) === 'income').length} transactions</em></div></article><article className="expense"><span><FaArrowDown /></span><div><small>EXPENSES</small><strong>{money.format(totals.expenses)}</strong><em>{filtered.filter((row) => transactionKind(row) === 'expense').length} transactions</em></div></article><article className={totals.net < 0 ? 'net negative' : 'net'}><span><FaWallet /></span><div><small>NET PROFIT</small><strong>{money.format(totals.net)}</strong><em>{margin.toFixed(1)}% margin</em></div></article></section>
    {message.text && <div className={`finance-notice ${message.type}`}><span>{message.text}</span><button onClick={() => setMessage({ type: '', text: '' })}><FaTimes /></button></div>}
    <section className="finance-panel"><div className="finance-tools"><label className="finance-search"><FaSearch /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search category, description, or type…" /></label><select value={kind} onChange={(event) => setKind(event.target.value)}><option value="all">All activity</option><option value="income">Income only</option><option value="expense">Expenses only</option></select><label className="finance-date"><span>From</span><input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} /></label><label className="finance-date"><span>To</span><input type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} /></label><button className="finance-clear" onClick={() => { setQuery(''); setKind('all'); setStartDate(''); setEndDate(''); }}>Show all</button></div>
      <div className="finance-table-label"><div><FaChartLine /><strong>Financial activity</strong><span>{filtered.length} records</span></div><small>{startDate || endDate ? `${startDate || 'Beginning'} – ${endDate || 'Today'}` : 'All dates'}</small></div>
      {loading ? <div className="finance-empty"><span className="finance-spinner" />Loading activity…</div> : filtered.length === 0 ? <div className="finance-empty"><FaChartLine /><strong>No transactions found</strong><span>Adjust the filters or add a transaction.</span></div> : <div className="finance-table-wrap"><table className="finance-table"><thead><tr><th>Date</th><th>Description</th><th>Category</th><th>Type</th><th>Amount</th><th /></tr></thead><tbody>{filtered.map((row) => { const rowKind = transactionKind(row); return <tr key={row.id}><td><strong>{new Date(row.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</strong><small>{new Date(row.created_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}</small></td><td><strong>{row.description || 'No description'}</strong></td><td><span className="finance-category">{row.category || 'Uncategorized'}</span></td><td><span className={`finance-kind ${rowKind}`}>{rowKind === 'income' ? <FaArrowUp /> : <FaArrowDown />}{row.type || rowKind}</span></td><td className={`finance-amount ${rowKind}`}>{rowKind === 'expense' ? '−' : '+'}{money.format(Math.abs(parseAmount(row.amount)))}</td><td><div className="finance-actions"><button onClick={() => openForm(row)} aria-label="Edit transaction"><FaEdit /></button><button className="danger" disabled={deletingId === row.id} onClick={() => deleteTransaction(row)} aria-label="Delete transaction"><FaTrash /></button></div></td></tr>; })}</tbody></table></div>}
    </section>
    {showForm && <div className="finance-modal-backdrop"><section className="finance-modal" role="dialog" aria-modal="true"><header><div><span>{editing ? 'UPDATE RECORD' : 'NEW RECORD'}</span><h2>{editing ? 'Edit transaction' : 'Add transaction'}</h2></div><button onClick={() => setShowForm(false)}><FaTimes /></button></header><form onSubmit={saveTransaction}><div className="finance-form-grid"><label><span>Direction *</span><select value={form.type} onChange={(event) => { const type = event.target.value; setForm({ ...form, type, category: type }); }}><option value="Income">Income</option><option value="Expense">Expense</option><option value="Staff Payment">Staff payment</option><option value="Payout">Payout</option></select></label><label><span>Category *</span><input value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })} placeholder="Tutoring, supplies…" /></label><label className="wide"><span>Description *</span><input value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} placeholder="What was this transaction for?" /></label><label className="wide"><span>Amount *</span><div className="money-input"><span>$</span><input type="number" min="0.01" step="0.01" value={form.amount} onChange={(event) => setForm({ ...form, amount: event.target.value })} placeholder="0.00" /></div></label></div><footer><button type="button" className="secondary" onClick={() => setShowForm(false)}>Cancel</button><button type="submit" disabled={saving}>{saving ? 'Saving…' : editing ? 'Save changes' : 'Add transaction'}</button></footer></form></section></div>}
  </main>;
};
export default Profits;
