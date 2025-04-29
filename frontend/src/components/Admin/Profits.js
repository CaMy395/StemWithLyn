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

    // Filter states
    const [searchCategory, setSearchCategory] = useState('');
    const [startDate, setStartDate] = useState('');
    const apiUrl = process.env.REACT_APP_API_URL || 'http://localhost:3001';

    // Calculate totals
    const calculateTotals = useCallback(() => {
        let income = 0;
        let expense = 0;
    
        filteredProfits.forEach((profit) => {
            const amount = parseFloat(profit.amount);
            if (!isNaN(amount)) {
                if (profit.category === 'Income') {
                    income += amount;
                }
            } else {
                console.warn('Invalid amount detected:', profit.amount);
            }
        });
    
        console.log('Income:', income, 'Expense:', expense, 'Net:', income - expense);
    
        return {
            income: income.toFixed(2),
            expense: expense.toFixed(2),
            net: (income - expense).toFixed(2),
        };
    }, [filteredProfits]); // Add 'filteredProfits' as a dependency
    

    // Fetch profits data
    useEffect(() => {
        const fetchProfits = async () => {
            try {
                const response = await fetch(`${apiUrl}/api/profits`);
                if (!response.ok) {
                    throw new Error('Failed to fetch profits data');
                }
                const data = await response.json();
                setProfits(data);
                setFilteredProfits(data);
            } catch (err) {
                setError(err.message);
            } finally {
                setLoading(false);
            }
        };
        // Fetch and update profits with credit card transactions
        const updateProfits = async () => {
            try {
                await fetch(`${apiUrl}/api/update-profits-from-transactions`, {
                    method: 'POST',
                });

                // Refresh profits data
                fetchProfits();
            } catch (error) {
                console.error('Error updating profits from transactions:', error);
            }
        };

        updateProfits();
        fetchProfits();
    }, [apiUrl]);
    
    useEffect(() => {
        if (filteredProfits.length > 0) {
            const totals = calculateTotals();
            setTotals(totals);
        } else {
            setTotals({ income: 0, expense: 0, net: 0 });
        }
    }, [filteredProfits, calculateTotals]);
    
    

    // Filter profits data based on criteria
    useEffect(() => {
        let result = profits;

        if (searchCategory.trim() !== '') {
            const lowerSearch = searchCategory.toLowerCase();
            result = result.filter((profit) =>
                profit.category.toLowerCase().includes(lowerSearch)
            );
        }

        if (startDate) {
            result = result.filter(
                (profit) => new Date(profit.created_at) >= new Date(startDate)
            );
        }

        setFilteredProfits(result);
    }, [searchCategory, startDate, profits]);


    return (
        <div className="payouts-container">
            <h1>Profits</h1>

            {/* Filters */}
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

            {/* Totals */}
            <div className="totals">
                <p><strong>Total Income: </strong><span style={{ color: 'green' }}>${totals.income}</span></p>
                <p><strong>Total Expense: </strong><span style={{ color: 'red' }}>${-totals.expense}</span></p>
                <p><strong>Net Profit: </strong><span style={{ color: totals.net < 0 ? 'red' : 'green' }}>${totals.net}</span></p>
            </div>
            {/* Show loading, error, or the data */}
            {loading && <p>Loading profits...</p>}
            {error && <p className="error-message">Error: {error}</p>}
            {!loading && filteredProfits.length === 0 && <p>No profits found.</p>}

            {/* Display table if profits exist */}
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
                                <tr key={profit.id}>
                                    <td>{profit.category}</td>
                                    <td>{profit.description}</td>
                                    <td>${parseFloat(profit.amount).toFixed(2)}</td>
                                    <td>{profit.type}</td>
                                    <td>{new Date(profit.created_at).toLocaleString()}</td>
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
