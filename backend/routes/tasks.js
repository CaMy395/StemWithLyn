// In routes/tasks.js or app.js
import express from 'express';
const router = express.Router();
import pool from '../db.js'; // Ensure this points to your db connection file

// Get all tasks
router.get('/', async (req, res) => {
    console.log('GET /tasks route hit');
    try {
        const result = await pool.query('SELECT * FROM tasks');
        res.json(result.rows);
    } catch (error) {
        console.error('Error fetching tasks:', error);
        res.status(500).json({ error: 'Failed to fetch tasks' });
    }
});

// Add a new task
router.post('/', async (req, res) => {
    const { text, completed } = req.body;
    try {
        const result = await pool.query(
            'INSERT INTO tasks (text, completed) VALUES ($1, $2) RETURNING *',
            [text, completed]
        );
        res.json(result.rows[0]);
    } catch (error) {
        console.error('Error adding task:', error);
        res.status(500).json({ error: 'Failed to add task' });
    }
});

// Update a task's completion status
router.patch('/:id', async (req, res) => {
    const { id } = req.params;
    const { completed } = req.body;
    try {
        const result = await pool.query(
            'UPDATE tasks SET completed = $1 WHERE id = $2 RETURNING *',
            [completed, id]
        );
        res.json(result.rows[0]);
    } catch (error) {
        console.error('Error updating task:', error);
        res.status(500).json({ error: 'Failed to update task' });
    }
});

// Delete a task
router.delete('/:id', async (req, res) => {
    const { id } = req.params;
    try {
        const result = await pool.query('DELETE FROM tasks WHERE id = $1', [id]);
        if (result.rowCount === 0) {
            return res.status(404).json({ error: 'Task not found' });
        }
        res.sendStatus(204); // Success without content
    } catch (error) {
        console.error('Error deleting task:', error);
        res.status(500).json({ error: 'Failed to delete task' });
    }
});

export default router;
