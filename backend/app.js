// backend/app.js
import express from 'express';
import cors from 'cors';
import { Client } from 'square';
import crypto from 'crypto';
import moment from 'moment-timezone';
import path from 'path'; // Import path to handle static file serving
import { fileURLToPath } from 'url'; // Required for ES module __dirname
import bcrypt from 'bcrypt';
import pool from './db.js'; // Import the centralized pool connection
import axios from "axios"; // ✅ Import axios
import {
    sendAppointmentReminderEmail , sendRegistrationEmail,sendResetEmail, sendTutoringIntakeEmail, sendTutoringApptEmail, sendTutoringRescheduleEmail,sendCancellationEmail, sendTextMessage, sendTaskTextMessage,  sendMentorSessionLogEmail, sendEmailCampaign
} from './emailService.js';
import cron from 'node-cron';
import 'dotenv/config';
import {WebSocketServer} from 'ws';
import http from 'http';
import fs from 'fs';

const jsonPath = path.join(process.cwd(), '../frontend/src/data/appointmentTypes.json');
const appointmentTypes = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));

const app = express();
const PORT = process.env.PORT || 3001;

// Create HTTP server
const server = http.createServer(app);

// Allow requests from specific origins
const allowedOrigins = [
    'http://localhost:3001',
    'http://localhost:3000'
];

app.use(cors({
    origin: allowedOrigins,
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    credentials: true,
    allowedHeaders: ['Content-Type', 'Authorization'],
}));

app.options('*', (req, res) => {
    res.header('Access-Control-Allow-Origin', req.headers.origin);
    res.header('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.header('Access-Control-Allow-Credentials', 'true');
    res.sendStatus(200);
});

// Attach WebSocket server to the same HTTP server
const wss = new WebSocketServer({ server });

wss.on('connection', (ws, req) => {
    const urlParams = new URLSearchParams(req.url.split('?')[1]);
    const token = urlParams.get('token');

    if (!token || token !== process.env.REACT_APP_AUTH_TOKEN) {
        console.error('Invalid or missing token');
        ws.close();
        return;
    }

    console.log('WebSocket connection authenticated');
    ws.send('Connection authenticated');
});

app.use(express.json()); // Middleware to parse JSON bodies

// Define __filename and __dirname for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);


// Test route to check server health
app.get('/api/health', (req, res) => {
    res.status(200).json({ message: 'Server is running and healthy!' });
});


// Set the timezone for the pool connection
pool.on('connect', async (client) => {
    await client.query("SET timezone = 'America/New_York'");
    console.log('Timezone set to America/New_York for the connection');
});

// Test database connection
(async () => {
    try {
        await pool.connect();
        console.log('Connected to PostgreSQL');
    } catch (err) {
        console.error('Connection error', err.stack);
    }
})();

// POST endpoint for registration
app.post('/register', async (req, res) => {
    const { name, username, email, phone, password, role = 'user' } = req.body;

    try {
        // Check if the username or email already exists
        const existingUser = await pool.query(
            'SELECT * FROM users WHERE username = $1 OR email = $2',
            [username, email]
        );

        if (existingUser.rowCount > 0) {
            return res.status(400).json({ error: 'Username or email already exists' });
        }

        // Hash the password
        const hashedPassword = await bcrypt.hash(password, 10);

        // Correct SQL Query: Remove extra placeholders ($7, $8, $9)
        const newUser = await pool.query(
            'INSERT INTO users (name, username, email, phone, password, role) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
            [name, username, email, phone, hashedPassword, role]
        );

        // Send registration email
        try {
            await sendRegistrationEmail(email, username, name);
            console.log(`Welcome email sent to ${email}`);
        } catch (emailError) {
            console.error('Error sending registration email:', emailError.message);
        }

        res.status(201).json(newUser.rows[0]);
    } catch (error) {
        console.error('Error during registration:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.post('/login', async (req, res) => {
    console.log('Login request received:', req.body); // Log the request body
    const { username, password } = req.body;

    try {
        const result = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
        console.log('Database query result:', result.rows); // Log the query result

        if (result.rowCount === 0) {
            return res.status(404).send('User not found');
        }

        const user = result.rows[0];
        console.log('User found:', user); // Log the user details

        const passwordMatch = await bcrypt.compare(password, user.password);
        console.log('Password match:', passwordMatch); // Log password comparison result

        if (!passwordMatch) {
            return res.status(401).send('Invalid password');
        }

        res.status(200).json({ role: user.role });
    } catch (error) {
        console.error('Error during login:', error);
        res.status(500).send('Internal server error');
    }
});

// Forgot Password Route
app.post('/forgot-password', async (req, res) => {
    const { email } = req.body;

    // Check if the email exists in the database
    const user = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    if (user.rows.length === 0) { // Make sure to check if user exists
        return res.status(400).send('Email not found');
    }

    // Generate a unique reset token
    const resetToken = crypto.randomBytes(20).toString('hex'); // Generate a random token (20 bytes)
    const expiration = Date.now() + 3600000; // Token expiration time (1 hour)

    // Save the token and expiration to the database
    await pool.query('UPDATE users SET reset_token = $1, reset_token_expiry = $2 WHERE email = $3', [resetToken, expiration, email]);

    // Generate the reset link
    const frontendUrl = process.env.REACT_APP_API_URL || 'http://localhost:3000'; // Dynamically handle the frontend URL
    const resetLink = `${frontendUrl}/reset-password?token=${resetToken}`;

    // Send the reset email
    sendResetEmail(email, resetLink);

    res.status(200).send('Password reset email sent');
});

// Reset Password Route
app.post('/reset-password', async (req, res) => {
    const { token, newPassword } = req.body;

    // Find the user by the reset token and check expiration
    const user = await pool.query('SELECT * FROM users WHERE reset_token = $1 AND reset_token_expiry > $2', [token, Date.now()]);
    if (user.rows.length === 0) {
        return res.status(400).send('Invalid or expired token');
    }

    // Hash the new password (you should hash the password before storing it)
    const hashedPassword = bcrypt.hashSync(newPassword, 10);  // Assuming you use bcrypt for hashing passwords

    // Update the user's password in the database and clear the reset token
    await pool.query('UPDATE users SET password = $1, reset_token = NULL, reset_token_expiry = NULL WHERE email = $2', [hashedPassword, user.rows[0].email]);

    res.status(200).send('Password updated successfully');
});

// Example route for getting users
app.get('/users', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM users'); // Adjust the query as necessary
        res.json(result.rows);
    } catch (error) {
        console.error('Error fetching users:', error);
        res.status(500).send('Server Error');
    }
});


// Example POST route for creating a task
app.post('/tasks', async (req, res) => {
    const { text, priority, dueDate, category } = req.body;

    try {
        const result = await pool.query(
            'INSERT INTO tasks (text, priority, due_date, category) VALUES ($1, $2, $3, $4) RETURNING *',
            [text, priority, dueDate, category]
        );

        const newTask = result.rows[0];
        console.log("✅ New Task Created:", newTask); // Debugging

        // Send an immediate notification to the assigned user
        await notifyNewTask(newTask);

        res.status(201).json(newTask);
    } catch (error) {
        console.error('Error adding task:', error);
        res.status(500).json({ error: 'Failed to add task' });
    }
});


const users = {
    "Lyn": { phone: "3059655863", carrier: "att" }
};

async function notifyNewTask(task) {
    console.log("🔍 Full Task Object:", task); // Debugging - Ensure task data is correct

    try {
        if (!task || !task.category || !task.due_date) {
            console.error("❌ Missing task fields:", task);
            return;
        }

        const user = users[task.category]; // Get the assigned user

        if (user) {
            // Convert `due_date` from UTC to `America/New_York`
            const formattedDueDate = moment.utc(task.due_date).tz('America/New_York').format('YYYY-MM-DD hh:mm A');

            // Pass correct task values to sendTaskTextMessage
            await sendTaskTextMessage({ 
                phone: user.phone, 
                carrier: user.carrier, 
                task: task.text, 
                due_date: formattedDueDate
            });

            console.log(`📩 New task notification sent to ${task.category} for task: ${task.text}`);
        } else {
            console.log(`⚠️ No user found for category: ${task.category}`);
        }
    } catch (error) {
        console.error('❌ Error sending new task notification:', error);
    }
}

// Function to check for upcoming tasks and send reminders
async function checkAndSendTaskReminders() {
    try {
        const now = new Date();
        const today = now.toISOString().split('T')[0]; // Format as YYYY-MM-DD
        const tomorrow = new Date(now);
        tomorrow.setDate(now.getDate() + 1);
        const formattedTomorrow = tomorrow.toISOString().split('T')[0];

        // Query tasks that are due today, tomorrow, OR overdue but not completed
        const tasksResult = await pool.query(
            `SELECT * FROM tasks 
             WHERE (due_date <= $1 OR due_date = $2) 
             AND completed = false`,
            [today, formattedTomorrow]
        );       

        for (const task of tasksResult.rows) {
            const user = users[task.category];

            if (user) {
                // Convert `due_date` to local time and format properly
                const formattedDueDate = moment.utc(task.due_date).tz('America/New_York').format('YYYY-MM-DD hh:mm A');

                // Customize message for overdue tasks
                const isOverdue = new Date(task.due_date) < now;
                const message = isOverdue
                    ? `⏳ Overdue Task Reminder: "${task.text}" was due on ${formattedDueDate}. Please complete it as soon as possible!`
                    : `🔔 Task Reminder: "${task.text}" is due on ${formattedDueDate}.`;

                await sendTextMessage({ phone: user.phone, carrier: user.carrier, message });

                console.log(`Reminder sent to ${task.category} for task: ${task.text} (Due: ${formattedDueDate})`);
            }
        }
    } catch (error) {
        console.error('Error sending task reminders:', error);
    }
}

// Schedule the function to run every day at 8 AM
cron.schedule('0 9 * * *', () => {
    console.log('Checking and sending task reminders...');
    checkAndSendTaskReminders();
}, {
    timezone: "America/New_York"
});

cron.schedule('0 8 * * *', async () => {
    console.log('⏰ Running daily appointment reminder check...');

    const tomorrow = moment().tz('America/New_York').add(1, 'day').format('YYYY-MM-DD');

    try {
        const result = await pool.query(`
            SELECT a.*, c.full_name, c.email
            FROM appointments a
            JOIN clients c ON a.client_id = c.id
            WHERE a.date = $1
        `, [tomorrow]);

        for (const appt of result.rows) {
            if (appt.email) {
                await sendAppointmentReminderEmail({
                    email: appt.email,
                    full_name: appt.full_name,
                    date: appt.date,
                    time: appt.time,
                    title: appt.title
                });
            }
        }

        console.log(`✅ Sent ${result.rows.length} appointment reminders for ${tomorrow}`);
    } catch (error) {
        console.error('❌ Error sending appointment reminders:', error.message);
    }
}, {
    timezone: "America/New_York"
});

// // PATCH endpoint to update task completion status
app.patch('/tasks/:id', async (req, res) => {
    const { id } = req.params;  // Extract the task ID from the URL
    const { completed } = req.body;  // Get the completed status from the request body

    try {
        // Update the task's completion status
        const query = 'UPDATE tasks SET completed = $1 WHERE id = $2 RETURNING *';
        const values = [completed, id];
        const result = await pool.query(query, values);  // Execute the query

        if (result.rowCount === 0) {
            // Task not found
            return res.status(404).json({ error: 'Task not found' });
        }

        // Return the updated task
        res.json(result.rows[0]);
    } catch (error) {
        console.error('Error updating task:', error.message);
        res.status(500).json({ error: 'Failed to update task' });
    }
});

app.get('/tasks', async (req, res) => {
    try {
        const result = await pool.query(`SELECT * FROM tasks`);
const tasks = result.rows.map(task => ({
    ...task,
    due_date: task.due_date 
        ? new Date(task.due_date).toLocaleDateString("en-US", { timeZone: "America/New_York" }) 
        : null
}));

console.log("📅 Sending Adjusted Tasks:", tasks);
res.json(tasks);

    } catch (error) {
        console.error('Error fetching tasks:', error);
        res.status(500).json({ error: 'Failed to fetch tasks' });
    }
});

// PUT endpoint to update task completion
app.put('/tasks/:id', async (req, res) => {
    const { id } = req.params;
    const { completed } = req.body;  // Status of task completion (true/false)

    try {
        const query = 'UPDATE tasks SET completed = $1 WHERE id = $2 RETURNING *';
        const values = [completed, id];
        const result = await pool.query(query, values);

        if (result.rowCount === 0) {
            return res.status(404).json({ error: 'Task not found' });
        }

        const updatedTask = result.rows[0];
        res.json(updatedTask);
    } catch (error) {
        console.error('Error updating task:', error.message);
        res.status(500).json({ error: 'Failed to update task' });
    }
});

// DELETE endpoint to delete a task
app.delete('/tasks/:id', async (req, res) => {
    const { id } = req.params;  // Get the task ID from the request parameters
    console.log('Attempting to delete task with ID:', id);  // Log the ID for debugging

    try {
        // Query to delete the task
        const result = await pool.query('DELETE FROM tasks WHERE id = $1 RETURNING *', [id]);

        if (result.rowCount === 0) {
            // If no rows were deleted, return 404
            return res.status(404).json({ error: 'Task not found' });
        }

        // Return a success message
        res.status(200).json({ message: 'Task deleted successfully' });
    } catch (error) {
        console.error('Error deleting task:', error);
        res.status(500).json({ error: 'Failed to delete task' });
    }
});

// Save blocked times to the database
app.post("/api/schedule/block", async (req, res) => {
    try {
        console.log("📥 Received blockedTimes:", req.body);
        const { blockedTimes } = req.body;

        if (!Array.isArray(blockedTimes) || blockedTimes.length === 0) {
            return res.status(400).json({ success: false, error: "Invalid blockedTimes format" });
        }

        await pool.query("BEGIN");

        // ✅ Delete only the affected time slots for the given date
        const existingTimeSlots = blockedTimes.map(bt => bt.timeSlot);
        if (existingTimeSlots.length > 0) {
            await pool.query(`DELETE FROM schedule_blocks WHERE time_slot = ANY($1) AND date = $2`, [existingTimeSlots, blockedTimes[0].date]);
        }

        // ✅ Insert new blocked times with date
        const query = `
        INSERT INTO schedule_blocks (time_slot, label, date) 
        VALUES ($1, $2, $3) 
        ON CONFLICT ON CONSTRAINT unique_block_time 
        DO UPDATE SET label = EXCLUDED.label
        `;

    
    for (const entry of blockedTimes) {
        if (!entry.timeSlot || !entry.label || !entry.date) continue; // Skip invalid entries
    
        // ✅ Convert `HH:MM:SS` to `YYYY-MM-DD-HH`
        let formattedTimeSlot = entry.timeSlot.trim();
        
        if (formattedTimeSlot.match(/^\d{2}:\d{2}:\d{2}$/)) {
            formattedTimeSlot = `${entry.date}-${formattedTimeSlot.split(":")[0]}`;
        }
    
        console.log("✅ Inserting Blocked Time:", formattedTimeSlot, entry.label, entry.date);
        await pool.query(query, [formattedTimeSlot, entry.label, entry.date]);
    }
    

        await pool.query("COMMIT");
        res.json({ success: true, blockedTimes });
    } catch (error) {
        await pool.query("ROLLBACK");
        console.error("❌ Error saving blocked times:", error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Fetch blocked times from the database
app.get('/api/schedule/block', async (req, res) => {
    try {
        const { date } = req.query;
        let result;

        if (date) {
            console.log("📆 Fetching blocked times for date:", date);
            result = await pool.query(
                `SELECT time_slot, label, date FROM schedule_blocks WHERE date = $1 ORDER BY time_slot`, [date]
            );
        } else {
            console.log("📆 Fetching all blocked times...");
            result = await pool.query(
                `SELECT time_slot, label, date FROM schedule_blocks ORDER BY date, time_slot`
            );
        }

        const blockedTimes = result.rows.map(row => ({
            timeSlot: row.time_slot.trim(),
            label: row.label ? row.label.trim() : "Blocked",
            date: row.date
        }));

        console.log("✅ Blocked Times from DB:", blockedTimes);
        return res.json({ blockedTimes });

    } catch (error) {
        console.error("❌ Error fetching blocked times:", error);
        return res.status(500).json({ error: "Failed to fetch blocked times." });
    }
});

app.delete('/api/schedule/block', async (req, res) => {
    try {
        const { timeSlot, date } = req.body;

        if (!timeSlot || !date) {
            return res.status(400).json({ error: "Both timeSlot and date are required for deletion." });
        }

        console.log(`🗑️ Deleting blocked time: ${timeSlot} on ${date}`);

        const result = await pool.query(
            `DELETE FROM schedule_blocks WHERE time_slot = $1 AND date = $2 RETURNING *`,
            [timeSlot, date]
        );

        if (result.rowCount === 0) {
            return res.status(404).json({ error: "Blocked time not found." });
        }

        console.log(`✅ Blocked time deleted: ${timeSlot} on ${date}`);
        res.json({ success: true });

    } catch (error) {
        console.error("❌ Error deleting blocked time:", error);
        res.status(500).json({ error: "Failed to delete blocked time." });
    }
});

app.post('/api/tutoring-intake', async (req, res) => {
    const {
        fullName,
        email,
        phone,
        haveBooked,
        whyHelp,
        learnDisable,
        whatDisable,
        age,
        grade,
        subject,
        mathSubject,
        scienceSubject,
        currentGrade,
        paymentMethod,
        additionalDetails
    } = req.body;

    const clientInsertQuery = `
        INSERT INTO clients (full_name, email, phone, payment_method)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (email) DO NOTHING;
    `;

    try {
        // Insert client data
        await pool.query(clientInsertQuery, [fullName, email, phone, paymentMethod]);

        // Insert tutoring intake form data
        await pool.query(
            `INSERT INTO tutoring_intake_forms (
                full_name,
                email,
                phone,
                have_booked,
                why_help,
                learn_disability,
                what_disability,
                age,
                grade,
                subject,
                math_subject,
                science_subject,
                current_grade,
                additional_details
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
            [
                fullName,
                email,
                phone,
                haveBooked,
                whyHelp,
                haveBooked === 'no' ? learnDisable : null,
                haveBooked === 'no' && learnDisable === 'yes' ? whatDisable : null,
                haveBooked === 'no' ? age : null,
                haveBooked === 'no' ? grade : null,
                haveBooked === 'no' ? subject : null,
                subject === 'Math' && haveBooked === 'no' ? mathSubject : null,
                subject === 'Science' && haveBooked === 'no' ? scienceSubject : null,
                currentGrade,
                additionalDetails || null // Save the additional details or null if empty
            ]
        );
       

        // Send email notification
        try {
            await sendTutoringIntakeEmail({
                fullName,
                email,
                phone,
                haveBooked,
                whyHelp,
                learnDisable,
                whatDisable,
                age,
                grade,
                subject,
                mathSubject,
                scienceSubject,
                currentGrade,
                additionalDetails
            });

            console.log(`Tutoring intake form email sent to admin.`);
        } catch (emailError) {
            console.error('Error sending tutoring intake form email:', emailError.message);
        }

        res.status(201).json({ message: 'Tutoring Intake Form submitted successfully!' });
    } catch (error) {
        console.error('Error saving tutoring intake form submission:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

app.post('/api/tech-intake', async (req, res) => {
    const {
        fullName,
        email,
        phone,
        helpType,
        platform,
        experienceLevel,
        deadline,
        paymentMethod,
        additionalDetails,
        haveBooked
    } = req.body;

    const insertQuery = `
        INSERT INTO tech_intake_forms (
            full_name,
            email,
            phone,
            help_type,
            platform,
            experience_level,
            deadline,
            payment_method,
            additional_details,
            have_booked
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
    `;

    try {
        await pool.query(insertQuery, [
            fullName,
            email,
            phone,
            helpType,
            platform,
            experienceLevel,
            deadline || null,
            paymentMethod,
            additionalDetails || null,
            haveBooked === 'yes'
        ]);

        res.status(201).json({ message: 'Tech intake form submitted successfully' });
    } catch (error) {
        console.error('❌ Error saving tech intake form:', error);
        res.status(500).json({ error: 'Failed to save tech intake form' });
    }
});

app.post('/api/clients', async (req, res) => {
    const { full_name, email, phone, payment_method, category } = req.body; // Destructure the incoming data

    // Validate input data
    if (!full_name) {
        return res.status(400).json({ error: 'Full name is required' });
    }

    try {
        // Insert the new client into the database
        const result = await pool.query(
            'INSERT INTO clients (full_name, email, phone, payment_method, category) VALUES ($1, $2, $3, $4, $5) RETURNING *',
            [full_name, email || null, phone || null, payment_method || null, category || null] // Default email and phone to NULL if not provided
        );

        res.status(201).json(result.rows[0]); // Respond with the created client
    } catch (error) {
        console.error('Error adding client:', error);
        res.status(500).json({ error: 'Failed to add client' });
    }
});

app.get('/api/clients', async (req, res) => {
    try {
        const result = await pool.query('SELECT id, full_name, email, phone, payment_method, category FROM clients ORDER BY id DESC');
        res.status(200).json(result.rows);
    } catch (error) {
        console.error('Error fetching clients:', error);
        res.status(500).json({ error: 'Failed to fetch clients' });
    }
});

app.patch('/api/clients/:id', async (req, res) => {
    const { id } = req.params;
    const updates = req.body;

    let updateQuery = "UPDATE clients SET ";
    const values = [];
    let counter = 1;

    for (const key in updates) {
        updateQuery += `${key} = $${counter}, `;
        values.push(updates[key]);
        counter++;
    }

    updateQuery = updateQuery.slice(0, -2); // Remove trailing comma
    updateQuery += ` WHERE id = $${counter} RETURNING *`;
    values.push(id);

    try {
        const result = await pool.query(updateQuery, values);
        if (result.rowCount === 0) {
            return res.status(404).json({ error: 'Client not found' });
        }
        res.status(200).json(result.rows[0]);
    } catch (error) {
        console.error('Error updating client:', error);
        res.status(500).json({ error: 'Failed to update client' });
    }
});

app.delete('/api/clients/:id', async (req, res) => {
    const { id } = req.params;

    try {
        const result = await pool.query(
            'DELETE FROM clients WHERE id = $1 RETURNING *',
            [id]
        );

        if (result.rowCount === 0) {
            return res.status(404).json({ error: 'Client not found' });
        }

        res.status(200).json({ message: 'Client deleted successfully' });
    } catch (error) {
        console.error('Error deleting client:', error);
        res.status(500).json({ error: 'Failed to delete client' });
    }
});


app.post("/api/send-campaign", async (req, res) => {
    const { subject, message, sendTo } = req.body;

    if (!message || !sendTo) {
        return res.status(400).json({ error: "MessageCati and recipient type are required" });
    }

    try {
        if (sendTo === "clients" || sendTo === "both") {
            const clientsResult = await pool.query("SELECT full_name, email FROM clients WHERE email IS NOT NULL");
            const clients = clientsResult.rows;
            await sendEmailCampaign(clients, subject, message);
        }

        res.status(200).json({ message: "Campaign sent successfully" });
    } catch (error) {
        console.error("❌ Error sending campaign:", error);
        res.status(500).json({ error: "Failed to send campaign" });
    }
});

// GET endpoint to fetch all intake forms
app.get('/api/tutoring-intake', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM tutoring_intake_forms ORDER BY created_at DESC');
        res.json(result.rows);
    } catch (error) {
        console.error('Error fetching tutroing intake forms:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.delete('/api/tutoring-intake/:id', async (req, res) => {
    try {
        const { id } = req.params;
        // Logic to delete the form from your database
        const result = await pool.query('DELETE FROM tutoring_intake_forms WHERE id = $1', [id]);

        if (result.rowCount > 0) {
            res.status(200).send('Form deleted successfully');
        } else {
            res.status(404).send('Form not found');
        }
    } catch (error) {
        console.error('Error deleting form:', error);
        res.status(500).send('Failed to delete form');
    }
});

const client = new Client({
    accessToken: process.env.SQUARE_ACCESS_TOKEN, // Use the token from environment variables
    environment: process.env.NODE_ENV === 'production' ? 'production' : 'sandbox',
});

const checkoutApi = client.checkoutApi;

app.post('/api/create-payment-link', async (req, res) => {
    const { email, amount, description } = req.body;

    if (!email || !amount || isNaN(amount)) {
        return res.status(400).json({ error: 'Email and valid amount are required.' });
    }

    try {
        // ✅ Calculate Square Fees: 2.9% + $0.30
        const processingFee = (amount * 0.029) + 0.30;
        const adjustedAmount = Math.round((parseFloat(amount) + processingFee) * 100); // Convert to cents

        console.log(`💰 Original Amount: $${amount}, Adjusted Amount: $${(adjustedAmount / 100).toFixed(2)}`);

        const response = await checkoutApi.createPaymentLink({
            idempotencyKey: new Date().getTime().toString(),
            quickPay: {
                name: 'Payment for Services',
                description: description || 'Please complete your payment.',
                priceMoney: {
                    amount: adjustedAmount, // ✅ Use adjusted amount to cover Square fees
                    currency: 'USD',
                },
                locationId: process.env.SQUARE_LOCATION_ID,
            },
        });

        const paymentLink = response.result.paymentLink.url;

        // Send the payment link via email
        await sendPaymentEmail(email, paymentLink);

        res.status(200).json({ url: paymentLink });
    } catch (error) {
        console.error('Error creating payment link:', error);
        res.status(500).json({ error: 'Failed to create payment link' });
    }
});

app.post('/appointments', async (req, res) => {
    try {
        console.log("✅ Received appointment request:", req.body);

        const { title, client_id, client_name, client_email, date, time, end_time, description, recurrence = '', occurrences = 1 } = req.body;

        let finalClientName = client_name;
        let finalClientEmail = client_email;

        if (client_id && (!client_name || !client_email)) {
            const clientResult = await pool.query(`SELECT full_name, email FROM clients WHERE id = $1`, [client_id]);
            if (clientResult.rowCount > 0) {
                finalClientName = clientResult.rows[0].full_name;
                finalClientEmail = clientResult.rows[0].email;
            }
        }

        if (!title || !finalClientName || !finalClientEmail || !date || !time) {
            console.error("❌ Missing required appointment details:", { title, client_name: finalClientName, client_email: finalClientEmail, date, time });
            return res.status(400).json({ error: "Missing required appointment details." });
        }

        let clientResult = await pool.query(`SELECT id, payment_method FROM clients WHERE email = $1`, [client_email]);
        let finalClientId = client_id;
        let payment_method = req.body.payment_method;

        if (clientResult.rowCount === 0) {
            const finalClientPhone = req.body.client_phone || "";
            const newClient = await pool.query(
                `INSERT INTO clients (full_name, email, phone, payment_method) VALUES ($1, $2, $3, $4) RETURNING id`,
                [finalClientName, finalClientEmail, finalClientPhone, payment_method]
            );
            finalClientId = newClient.rows[0].id;
        } else {
            finalClientId = clientResult.rows[0].id;
        }

        const isAdmin = req.body.isAdmin || false;
        const formattedTime = time.length === 5 ? `${time}:00` : time;
        const formattedEndTime = end_time.length === 5 ? `${end_time}:00` : end_time;

        function extractPriceFromTitle(title) {
            const match = title.match(/\$(\d+(\.\d{1,2})?)/);
            return match ? parseFloat(match[1]) : 0;
        }

        const basePrice = extractPriceFromTitle(title);

        // ⏰ Recurrence logic
        const weekdays = req.body.weekdays || [];
        const recurrenceDates = [];

        if ((recurrence === 'weekly' || recurrence === 'biweekly') && weekdays.length > 0) {
            const weekdayMap = {
                Monday: 0, Tuesday: 1, Wednesday: 2,
                Thursday: 3, Friday: 4, Saturday: 5, Sunday: 6
            };

            const startDate = new Date(date);
            const currentDay = startDate.getDay(); // Sunday = 0 ... Saturday = 6
            const offsetToSunday = currentDay ; // Monday = 0
            const weeks = parseInt(occurrences, 10);

            for (let week = 0; week < weeks; week++) {
                const baseWeek = new Date(startDate);
                baseWeek.setDate(baseWeek.getDate() - offsetToSunday + (week * (recurrence === 'weekly' ? 7 : 14)));

                for (const day of weekdays) {
                    const dayIndex = weekdayMap[day];
                    const recurDate = new Date(baseWeek);
                    recurDate.setDate(baseWeek.getDate() + dayIndex);

                    const formatted = recurDate.toISOString().split('T')[0];
                    recurrenceDates.push(formatted);
                }
            }

        } else {
            // Daily/monthly or single-day fallback
            const startDate = new Date(date);
            for (let i = 0; i < occurrences; i++) {
                const recurDate = new Date(startDate);
                switch (recurrence) {
                    case 'daily':
                        recurDate.setDate(startDate.getDate() + i);
                        break;
                    case 'monthly':
                        recurDate.setMonth(startDate.getMonth() + i);
                        break;
                    default:
                        if (i > 0) continue;
                }
                recurrenceDates.push(recurDate.toISOString().split('T')[0]);
            }
        }

        const createdAppointments = [];

        for (const recurDate of recurrenceDates) {
            if (!isAdmin) {
                const blockedCheck = await pool.query(
                    `SELECT * FROM schedule_blocks WHERE date = $1 AND time_slot = $2`,
                    [recurDate, `${formattedTime.split(":")[0]}`]
                );
                if (blockedCheck.rowCount > 0) continue;

                const existingAppointment = await pool.query(
                    `SELECT * FROM appointments WHERE date = $1 AND time = $2`,
                    [recurDate, formattedTime]
                );
                if (existingAppointment.rowCount > 0) continue;

                const appointmentWeekday = new Date(recurDate + "T12:00:00").toLocaleDateString("en-US", {
                    weekday: "long",
                    timeZone: "America/New_York"
                }).trim();

                const availabilityCheck = await pool.query(
                    `SELECT * FROM weekly_availability WHERE weekday = $1 AND appointment_type ILIKE $2 AND start_time = $3`,
                    [appointmentWeekday, `%${title}%`, formattedTime]
                );
                if (availabilityCheck.rowCount === 0) continue;
            }

            const insertAppointment = await pool.query(
                `INSERT INTO appointments (title, client_id, date, time, end_time, description, price)
                 VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
                [title, finalClientId, recurDate, formattedTime, formattedEndTime, description, basePrice]
            );

            createdAppointments.push(insertAppointment.rows[0]);
        }

        // ✅ Payment link generation (only once)
        let paymentUrl = null;
        if (basePrice > 0) {
            if (payment_method === "Square") {
                try {
                    const apiUrl = process.env.API_URL || "http://localhost:3001";
                    const squareResponse = await axios.post(`${apiUrl}/api/create-payment-link`, {
                        email: finalClientEmail,
                        amount: basePrice,
                        description: `Payment for ${title} on ${recurrenceDates[0]} at ${time}`
                    });
                    paymentUrl = squareResponse.data.url;
                } catch (error) {
                    console.error("❌ Error generating Square link:", error);
                }
            } else if (payment_method === "Zelle" || payment_method === "CashApp") {
                const encodedTitle = encodeURIComponent(title.trim());
                paymentUrl = `${process.env.API_URL || 'http://localhost:3000'}/payment?price=${basePrice}&appointment_type=${encodedTitle}`;
            }
        }

        // ✅ Send confirmation email
        if (createdAppointments.length > 0) {
            const sessionDates = createdAppointments.map(a => a.date).join(', ');
            await sendTutoringApptEmail({
                title,
                email: finalClientEmail,
                full_name: finalClientName,
                date: createdAppointments[0].date,
                time: createdAppointments[0].time,
                description: `${createdAppointments.length} session(s) scheduled:\n${sessionDates}`,
                payment_method: payment_method
            });
        }

        res.status(201).json({
            message: `${createdAppointments.length} appointment(s) created.`,
            appointments: createdAppointments,
            paymentLink: paymentUrl,
            paymentMethod: payment_method
        });

    } catch (error) {
        console.error("❌ Error saving appointment:", error);
        res.status(500).json({ error: "Failed to save appointment.", details: error.message });
    }
});





// Get all appointments
app.get('/appointments', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM appointments ORDER BY date, time');
        res.status(200).json(result.rows);
    } catch (error) {
        console.error('❌ Error fetching all appointments:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get filtered appointments
app.get('/appointments/by-date', async (req, res) => {
    try {
        const { date } = req.query;

        if (!date) {
            return res.status(400).json({ error: "Date is required to fetch appointments." });
        }

        const appointments = await pool.query(
            `SELECT * FROM appointments WHERE date = $1`, 
            [date]
        );

        res.json(appointments.rows);
    } catch (error) {
        console.error("❌ Error fetching appointments by date:", error);
        res.status(500).json({ error: "Failed to fetch appointments." });
    }
});

app.get('/blocked-times', async (req, res) => {
    try {
        const { date } = req.query;

        if (!date) {
            return res.status(400).json({ error: "Date is required to fetch blocked times." });
        }

        // ✅ Fetch manually blocked times from `schedule_blocks`
        const blockedTimesResult = await pool.query(
            `SELECT time_slot FROM schedule_blocks WHERE date = $1`,
            [date]
        );
        const blockedTimes = blockedTimesResult.rows.map(row => row.time_slot);

        // ✅ Fetch already booked appointments from `appointments`
        const bookedTimesResult = await pool.query(
            `SELECT time FROM appointments WHERE date = $1`,
            [date]
        );
        const bookedTimes = bookedTimesResult.rows.map(row => row.time);

        // ✅ Merge both lists and remove duplicates
        const allUnavailableTimes = [...new Set([...blockedTimes, ...bookedTimes])];

        
        res.json({ blockedTimes: allUnavailableTimes });

    } catch (error) {
        console.error("❌ Error fetching blocked times:", error);
        res.status(500).json({ error: "Failed to fetch blocked times." });
    }
});

app.patch('/appointments/:id', async (req, res) => {
    const appointmentId = req.params.id;
    const { title, description, date, time, end_time, client_id } = req.body;

    try {
        // Check if the appointment exists
        const existingAppointmentResult = await pool.query(
            'SELECT * FROM appointments WHERE id = $1',
            [appointmentId]
        );

        if (existingAppointmentResult.rowCount === 0) {
            return res.status(404).json({ error: 'Appointment not found' });
        }

        const existingAppointment = existingAppointmentResult.rows[0];

        // Update the appointment
        const result = await pool.query(
            `UPDATE appointments 
             SET title = $1, description = $2, date = $3, time = $4, end_time = $5, client_id = $6 
             WHERE id = $7 
             RETURNING *`,
            [title, description, date, time, end_time, client_id, appointmentId]
        );

        const updatedAppointment = result.rows[0];

        // Fetch the client's email and full name
        const clientResult = await pool.query(
            `SELECT email, full_name FROM clients WHERE id = $1`,
            [client_id]
        );

        if (clientResult.rowCount === 0) {
            return res.status(400).json({ error: 'Client not found' });
        }

        const client = clientResult.rows[0];

        const rescheduleDetails = {
            title: updatedAppointment.title,
            email: client.email,
            full_name: client.full_name,
            old_date: existingAppointment.date,
            old_time: existingAppointment.time,
            new_date: updatedAppointment.date,
            new_time: updatedAppointment.time,
            end_time: updatedAppointment.end_time,
            description: updatedAppointment.description,
        };
        
        await sendTutoringRescheduleEmail(rescheduleDetails);

        // Send success response
        return res.status(200).json(updatedAppointment);
    } catch (error) {
        console.error('Error updating appointment:', error);
        return res.status(500).json({ error: 'Failed to update appointment' });
    }
});

app.delete('/appointments/:id', async (req, res) => {
    const appointmentId = req.params.id;

    try {
        // Fetch the appointment details before deleting
        const appointmentResult = await pool.query(
            `SELECT * FROM appointments WHERE id = $1`,
            [appointmentId]
        );

        if (appointmentResult.rowCount === 0) {
            return res.status(404).json({ error: 'Appointment not found' });
        }

        const appointment = appointmentResult.rows[0];

        // Fetch the client's email and full name
        const clientResult = await pool.query(
            `SELECT email, full_name FROM clients WHERE id = $1`,
            [appointment.client_id]
        );

        if (clientResult.rowCount === 0) {
            return res.status(400).json({ error: 'Client not found' });
        }

        const client = clientResult.rows[0];

        // Delete the appointment
        await pool.query(
            `DELETE FROM appointments WHERE id = $1`,
            [appointmentId]
        );

        // Send cancellation email
        await sendCancellationEmail({
            title: appointment.title,
            email: client.email,
            full_name: client.full_name,
            date: appointment.date,
            time: appointment.time,
            description: appointment.description,
        });

        res.status(200).json({ message: 'Appointment successfully deleted' });
    } catch (error) {
        console.error('Error deleting appointment:', error.message);
        res.status(500).json({ error: 'Failed to delete appointment' });
    }
});

app.patch('/appointments/:id/paid', async (req, res) => {
    const { id } = req.params;
    const { paid } = req.body;

    try {
        // Fetch appointment details
        const appointmentResult = await pool.query(
            'SELECT * FROM appointments WHERE id = $1',
            [id]
        );

        if (appointmentResult.rowCount === 0) {
            return res.status(404).json({ error: 'Appointment not found' });
        }

        const appointment = appointmentResult.rows[0];
        const price = appointment.price || 0;

        // Fetch payment method from clients table
        const clientResult = await pool.query(
            'SELECT payment_method FROM clients WHERE id = $1',
            [appointment.client_id]
        );

        if (clientResult.rowCount === 0) {
            return res.status(404).json({ error: 'Client not found for this appointment.' });
        }

        const paymentMethod = clientResult.rows[0].payment_method || 'Other';

        // Update the paid status in the appointments table
        await pool.query('UPDATE appointments SET paid = $1 WHERE id = $2', [paid, id]);

        if (paid && price > 0) {
            // Calculate net payment based on payment method
            let netPayment = price;

            if (price > 0 && paymentMethod === 'Square') {
                const squareFees = (price * 0.029) + 0.30; // Square fees: 2.9% + $0.30
                netPayment -= squareFees;
            }   
        }

        res.json({ message: 'Appointment payment status updated successfully.' });
    } catch (error) {
        console.error('Error updating appointment paid status:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

//Availability
// Endpoint to get available time slots
app.get('/schedule/availability', async (req, res) => {
    const { date } = req.query;

    if (!date) {
        return res.status(400).json({ error: 'Date parameter is required' });
    }

    try {
        // Fetch blocked times for the given date
        const blockedTimesResult = await pool.query(
            `SELECT time_slot FROM schedule_blocks WHERE time_slot LIKE $1`,
            [`${date}-%`]
        );
        const blockedTimes = blockedTimesResult.rows.map(row => row.time_slot);

        // Fetch booked appointments for the given date
        const appointmentsResult = await pool.query(
            `SELECT time FROM appointments WHERE date = $1`,
            [date]
        );
        const bookedTimes = appointmentsResult.rows.map(row => `${date}-${row.time}`);

        // Define available slots (assuming time slots from 9 AM - 6 PM)
        const allSlots = Array.from({ length: 10 }, (_, i) => `${date}-${9 + i}`);

        // Filter available slots
        const availableSlots = allSlots.filter(slot => !blockedTimes.includes(slot) && !bookedTimes.includes(slot));

        res.json({ availableSlots });
    } catch (error) {
        console.error('Error fetching availability:', error);
        res.status(500).json({ error: 'Failed to fetch available time slots' });
    }
});

app.get('/admin-availability', async (req, res) => {
    try {
        console.log("📥 Fetching all availability for admin...");

        const result = await pool.query("SELECT * FROM weekly_availability ORDER BY weekday, start_time");

        console.log("✅ Sending Admin Availability Data:", result.rows);
        res.json(result.rows);
    } catch (error) {
        console.error("❌ Error fetching admin availability:", error);
        res.status(500).json({ success: false, error: "Failed to fetch availability for admin." });
    }
});

app.post("/availability", async (req, res) => {
    const { weekday, start_time, end_time, appointment_type } = req.body;

    console.log("📥 Received request:", req.body); // Debugging log

    if (!weekday || !start_time || !end_time || !appointment_type) {
        return res.status(400).json({ error: "All fields are required." });
    }

    try {
        const result = await pool.query(
            `INSERT INTO weekly_availability (weekday, start_time, end_time, appointment_type) 
             VALUES ($1, $2, $3, $4) RETURNING *`,
            [weekday, start_time, end_time, appointment_type]
        );

        console.log("✅ Successfully added:", result.rows[0]); // Debugging log
        res.status(201).json({ success: true, availability: result.rows[0] });
    } catch (error) {
        console.error("❌ Error adding availability:", error);
        res.status(500).json({ error: "Failed to add availability." });
    }
});

app.get('/availability', async (req, res) => {
    try {
        const { weekday, appointmentType } = req.query;

        console.log(`📥 Fetching availability - Weekday: "${weekday}", Appointment Type: "${appointmentType}"`);

        const availabilityQuery = `
            SELECT * FROM weekly_availability
            WHERE LOWER(weekday) = LOWER($1) 
            AND LOWER(appointment_type) = LOWER($2)
            ORDER BY start_time
        `;
        
        const queryParams = [weekday.trim(), appointmentType.trim()];
        console.log("🔎 Query Params:", queryParams);

        const result = await pool.query(availabilityQuery, queryParams);

        if (result.rowCount === 0) {
            console.log("⚠️ No availability found for the given filters.");
            return res.json([]); // ✅ Return empty array instead of 400 error
        }

        console.log("✅ Sending Availability Data:", result.rows);
        res.json(result.rows);
    } catch (error) {
        console.error("❌ Error fetching availability:", error);
        res.status(500).json({ error: "Failed to fetch availability." });
    }
});

app.delete("/availability/:id", async (req, res) => {
    const { id } = req.params;

    try {
        await pool.query(`DELETE FROM availability WHERE id = $1`, [id]);
        res.json({ success: true, message: "Availability removed successfully" });
    } catch (error) {
        console.error("❌ Error deleting availability:", error);
        res.status(500).json({ error: "Failed to delete availability" });
    }
});

// API endpoint to handle form submissions
app.post('/mentors-log', async (req, res) => {
    try {
        const formData = req.body;

        // Validate required fields
        if (!formData.email || !formData.mentorName || !formData.studentName) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        // Send email notification
        await sendMentorSessionLogEmail(formData);

        res.status(200).json({ message: "Session log submitted and email sent." });
    } catch (error) {
        console.error("❌ Error handling mentor session log:", error);
        res.status(500).json({ error: "Failed to submit session log." });
    }
});


// Serve static files from the React app
app.use(express.static(path.join(__dirname, '../frontend/build')));

// Catch-all route to serve index.html for any unknown routes
app.get('*', (req, res) => {
    console.log(`Serving index.html for route ${req.url}`);
    res.sendFile(path.join(__dirname,  '../frontend/build', 'index.html'), (err) => {
        if (err) {
            res.status(500).send(err);
        }
    });
});

// Export app for server startup
export default app;

// Start the server
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});