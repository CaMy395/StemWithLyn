import React, { useState, useEffect, useCallback } from 'react';

const MyTasks = () => {
    const [tasks, setTasks] = useState([]);
    const [newTask, setNewTask] = useState('');
    const [priority, setPriority] = useState('Medium');
    const [dueDate, setDueDate] = useState('');
    const [category, setCategory] = useState('');
    const [openCategories, setOpenCategories] = useState({}); // Track which categories are open

    const apiUrl = process.env.REACT_APP_API_URL || 'http://localhost:3001';

    // Add a new task
    const addTask = async () => {
        if (newTask.trim() === '') return;
        const adjustedDate = dueDate ? new Date(dueDate + "T12:00:00").toISOString().split("T")[0] : null;
        const task = { text: newTask, completed: false, priority, dueDate: adjustedDate, category };
                try {
            const response = await fetch(`${apiUrl}/tasks`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(task),
            });
            if (!response.ok) throw new Error(`Error adding task: ${response.status}`);
            const newTaskFromDb = await response.json();
            setTasks([...tasks, newTaskFromDb]);
            setNewTask('');
            setPriority('Medium');
            setDueDate('');
            setCategory('');
        } catch (error) {
            console.error('Error adding task:', error);
        }
    };

    // Toggle task completion status
    const toggleTaskCompletion = async (taskId, currentStatus) => {
        try {
            const updatedTask = {
                completed: !currentStatus
            };
            const response = await fetch(`${apiUrl}/tasks/${taskId}`, {
                method: 'PATCH', // Use PATCH instead of PUT for partial update
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(updatedTask),
            });

            if (!response.ok) {
                throw new Error('Error updating task');
            }

            // Re-fetch tasks to update UI after the completion status change
            fetchTasks();
        } catch (error) {
            console.error('Error toggling task completion:', error);
        }
    };

    // Delete a task
    const deleteTask = async (id) => {
        try {
            const response = await fetch(`${apiUrl}/tasks/${id}`, { method: 'DELETE' });

            if (!response.ok) {
                throw new Error(`Error deleting task: ${response.status}`);
            }

            // Remove the deleted task from the state immediately
            setTasks((prevTasks) => prevTasks.filter((task) => task.id !== id));
        } catch (error) {
            console.error('Error deleting task:', error);
        }
    };

    // Memoize fetchTasks with useCallback to avoid the warning
    const fetchTasks = useCallback(async () => {
        try {
            const response = await fetch(`${apiUrl}/tasks`);
            if (!response.ok) {
                throw new Error(`Error fetching tasks: ${response.statusText}`);
            }
            const data = await response.json();
    
            console.log("📅 Raw Task Data from API:", data);
    
            setTasks(data);
        } catch (error) {
            console.error('Error fetching tasks:', error);
        }
    }, [apiUrl]);
    

    useEffect(() => {
        fetchTasks();
    }, [fetchTasks]);

    // Hardcode categories and filter tasks by category
    const categories = ['Lyn', 'Red', 'Ace']; // Hardcoded categories
    const groupedTasks = categories.reduce((groups, category) => {
        groups[category] = tasks.filter((task) => task.category === category);
        return groups;
    }, {});

    // Handle category visibility
    const toggleCategoryVisibility = (category) => {
        setOpenCategories((prev) => ({
            ...prev,
            [category]: !prev[category],
        }));
    };

    return (
        <div>
            <h1>My Tasks</h1>
            <div>
                <input
                    type="text"
                    value={newTask}
                    onChange={(e) => setNewTask(e.target.value)}
                    placeholder="Enter a new task"
                    style={{ padding: '10px', width: '70%', marginRight: '10px' }}
                />
                <br></br>
                <br></br>
                <select
                    value={priority}
                    onChange={(e) => setPriority(e.target.value)}
                    style={{ padding: '5px', marginRight: '10px' }}
                >
                    <option value="Low">Low</option>
                    <option value="Medium">Medium</option>
                    <option value="High">High</option>
                </select>
                <input
                    type="date"
                    value={dueDate}
                    onChange={(e) => setDueDate(e.target.value)}
                    style={{ padding: '5px', marginRight: '10px' }}
                />
                <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    style={{ padding: '5px', marginRight: '10px' }}
                >
                    <option value="">Select a User</option>
                    <option value="Lyn">Lyn</option>
                    <option value="Red">Red</option>
                    <option value="Ace">Ace</option>
                </select>
                <button
                    onClick={addTask}
                    style={{
                        padding: '6px 20px',
                        backgroundColor: '#8B0000',
                        color: 'white',
                        border: 'none',
                        cursor: 'pointer',
                    }}
                >
                    Add Task
                </button>
            </div>

            {/* Hardcoded categories */}
            {categories.map((category) => (
                <div key={category} style={{ marginTop: '20px' }}>
                    {/* Show the category header */}
                    <h2
                        onClick={() => toggleCategoryVisibility(category)}
                        style={{
                            cursor: 'pointer',
                            margin: '10px 0',
                            fontSize: '20px',
                            fontWeight: 'bold',
                            color: 'white',
                            padding: '5px',
                            textDecoration: 'underline', // Add underline here
                        }}
                    >
                        {category}
                    </h2>

                    {/* Show tasks under the category */}
                    {openCategories[category] && (
                        <ul style={{ listStyleType: 'none', padding: 0 }}>
                            {groupedTasks[category].map((task) => (
                                <li
                                    key={task.id}
                                    style={{
                                        marginBottom: '10px',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'space-between',
                                        padding: '5px',
                                        border: '1px solid #ccc',
                                        borderRadius: '5px',
                                        backgroundColor: task.completed ? '#d4edda' : '#f8d7da', // Light green for completed
                                        
                                    }}
                                >
                                    <div
                                        style={{
                                            textDecoration: task.completed ? 'line-through' : 'none',
                                            flex: 1,
                                            textAlign: 'left',
                                            marginLeft: '10px',
                                            color: 'black',
                                        }}
                                    >
                                        {task.text}
                                        <div style={{ marginTop: '5px', display: 'flex', gap: '10px' }}>
                                            {/* Priority */}
                                            <div
                                                style={{
                                                    padding: '3px 10px',
                                                    backgroundColor: '#ffcc00',
                                                    borderRadius: '5px',
                                                    color: '#fff',
                                                    fontWeight: 'bold',
                                                }}
                                            >
                                                {task.priority}
                                            </div>

                                            {/* Due Date */}
                                            <div
                                                style={{
                                                    padding: '5px 5px',
                                                    backgroundColor: '#8B0000',
                                                    borderRadius: '5px',
                                                    color: '#fff',
                                                    fontWeight: 'bold',
                                                }}
                                            >
                                                {task.due_date 
                                                    ? new Date(task.due_date).toLocaleDateString("en-US", {
                                                        timeZone: "America/New_York"
                                                    })
                                                    : 'No Due Date'
                                                }
                                            </div>
                                        </div>
                                    </div>
                                    <input
                                        type="checkbox"
                                        checked={task.completed}
                                        onChange={() => toggleTaskCompletion(task.id, task.completed)}
                                        style={{ marginRight: '10px' }}
                                    />
                                    <button
                                        onClick={() => deleteTask(task.id)}
                                        style={{
                                            padding: '5px 10px',
                                            backgroundColor: '#8B0000',
                                            color: 'white',
                                            border: 'none',
                                            cursor: 'pointer',
                                        }}
                                    >
                                        Delete
                                    </button>
                                </li>
                            ))}
                        </ul>
                    )}

                    {/* If no tasks under the category, still show the category header */}
                    {groupedTasks[category].length === 0 && openCategories[category] && (
                        <div>No tasks available in this category.</div>
                    )}
                </div>
            ))}
        </div>
    );
};

export default MyTasks;
