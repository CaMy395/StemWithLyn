import React, { useState, useEffect, useCallback } from 'react';
import '../../App.css';

const Profits = () => {
  const [profits, setProfits] = useState([]);
  const [filteredProfits, setFilteredProfits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [totals, setTotals] = useState({
    income: 0,
    expense: 0,
    net: 0,
  });

  // Filters
  const [searchCategory, setSearchCategory] = useState('');
  const [startDate, setStartDate] = useState('');
  const apiUrl = process.env.REACT_APP_API_URL || 'http://localhost:3001';

  const calculateTotals = useCallback(() => {
    let income = 0;
    let expense = 0;

    filteredProfits.forEach((profit) => {
      const amount = parseFloat(profit.amount);
      if (!isNaN(amount)) {
        if (profit.category === 'Income' || profit.category?.toLowerCase().includes('income')) {
          income += amount;
        }
        if (profit.category === 'Expense' || profit.category?.toLowerCase().includes('expense')) {
          expense += amount;
        }
      }
    });

    return {
      income: income.toFixed(2),
      expense: expense.toFixed(2),
      net: (income - expense).toFixed(2),
    };
  }, [filteredProfits]);

  useEffect(() => {
    const fetchProfits = async () => {
      try {
        setLoading(true);
        setError(null);

        const response = await fetch(`${apiUrl}/api/profits`);
        if (!response.ok) throw new Error('Failed to fetch profits data');

        const data = await response.json();
        setProfits(data);
        setFilteredProfits(data);
      } catch (err) {
        setError(err.message || 'Failed to fetch profits data');
      } finally {
        setLoading(false);
      }
    };

    fetchProfits();
  }, [apiUrl]);

  useEffect(() => {
    if (filteredProfits.length > 0) {
      setTotals(calculateTotals());
    } else {
      setTotals({ income: 0, expense: 0, net: 0 });
    }
  }, [filteredProfits, calculateTotals]);

  useEffect(() => {
    let result = profits;

    if (searchCategory.trim() !== '') {
      const lowerSearch = searchCategory.toLowerCase();
      result = result.filter((profit) =>
        (profit.category || '').toLowerCase().includes(lowerSearch)
      );
    }

    if (startDate) {
      result = result.filter((profit) => new Date(profit.created_at) >= new Date(startDate));
    }

    setFilteredProfits(result);
  }, [searchCategory, startDate, profits]);

  return (
    <div className="payouts-container">
      <h1>Profits</h1>

      <div className="filters">
        <input
          type="text"
          value={searchCategory}
          onChange={(e) => setSearchCategory(e.target.value)}
          placeholder="Search by Category"
          className="filter-input"
        />
        <input
          type="date"
          value={startDate}
          onChange={(e) => setStartDate(e.target.value)}
          className="filter-input"
        />
      </div>

      <div className="totals">
        <p><strong>Total Income: </strong><span style={{ color: 'green' }}>${totals.income}</span></p>
        <p><strong>Total Expense: </strong><span style={{ color: 'red' }}>${totals.expense}</span></p>
        <p><strong>Net Profit: </strong><span style={{ color: Number(totals.net) < 0 ? 'red' : 'green' }}>${totals.net}</span></p>
      </div>

      {loading && <p>Loading profits...</p>}
      {error && <p className="error-message">Error: {error}</p>}
      {!loading && filteredProfits.length === 0 && <p>No profits found.</p>}

      {filteredProfits.length > 0 && (
        <div className="table-container">
          <table className="payouts-table">
            <thead>
              <tr>
                <th>Category</th>
                <th>Description</th>
                <th>Amount</th>
                <th>Type</th>
                <th>Date</th>
              </tr>
            </thead>
            <tbody>
              {filteredProfits.map((profit) => (
                <tr key={profit.id ?? `${profit.description}-${profit.created_at}`}>
                  <td>{profit.category}</td>
                  <td>{profit.description}</td>
                  <td>${parseFloat(profit.amount).toFixed(2)}</td>
                  <td>{profit.type}</td>
                  <td>{profit.created_at ? new Date(profit.created_at).toLocaleString() : ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default Profits;
