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
    sendPaymentEmail, sendAppointmentReminderEmail , sendRegistrationEmail,sendResetEmail, sendTutoringIntakeEmail, sendTutoringApptEmail, sendTutoringRescheduleEmail,sendCancellationEmail, sendTextMessage, sendTaskTextMessage,  sendMentorSessionLogEmail, sendEmailCampaign
} from './emailService.js';
import cron from 'node-cron';
import 'dotenv/config';
import {WebSocketServer} from 'ws';
import http from 'http';
import fs from 'fs';
import { google } from 'googleapis';

const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI
);

oauth2Client.setCredentials({
  access_token: process.env.GOOGLE_ACCESS_TOKEN,
  refresh_token: process.env.GOOGLE_REFRESH_TOKEN,
});

const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

function padToSeconds(time) {
  return time.length === 5 ? `${time}:00` : time;
}

function formatDate(date) {
  // Ensures it's in YYYY-MM-DD format even if passed as a Date object
  return new Date(date).toISOString().split('T')[0];
}

async function createGoogleCalendarEvent(appointment, client) {
  const startTime = padToSeconds(appointment.time);
  const endTime = padToSeconds(appointment.end_time || appointment.time);
  const date = formatDate(appointment.date);

  const event = {
    summary: appointment.title,
    description: appointment.description || '',
    start: {
      dateTime: `${date}T${startTime}`,
      timeZone: 'America/New_York',
    },
    end: {
      dateTime: `${date}T${endTime}`,
      timeZone: 'America/New_York',
    },
    attendees: client?.email ? [{ email: client.email }] : [],
  };

  try {
    console.log("📤 Creating Google Calendar Event with:", JSON.stringify(event, null, 2));

    const response = await calendar.events.insert({
      calendarId: process.env.GOOGLE_CALENDAR_ID || 'stemwithlyn@gmail.com',
      resource: event,
    });

    console.log("📆 Google Calendar Event Created:", response.data.htmlLink);
  } catch (error) {
    console.error("❌ Failed to create Google Calendar event:", error.message);
    if (error.response?.data) {
      console.error("🔍 Google API Error Details:", JSON.stringify(error.response.data, null, 2));
    }
  }
}



const jsonPath = path.join(process.cwd(), '../frontend/src/data/appointmentTypes.json');
const appointmentTypes = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));

const app = express();
const PORT = process.env.PORT || 3001;

// Create HTTP server
const server = http.createServer(app);

// Allow requests from specific origins
const allowedOrigins = [
  'http://localhost:3001',
  'http://localhost:3000',
  'https://stemwithlyn.onrender.com',
  'https://www.stemwithlyn.onrender.com',
];

app.use(cors({
  origin: (origin, callback) => {
    // Allow same-origin / server-to-server (no origin header)
    if (!origin) return callback(null, true);

    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }

    console.error("❌ Blocked by CORS:", origin);
    return callback(new Error("Not allowed by CORS"));
  },
  methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  credentials: true,
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

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

/* Schedule the function to run every day at 8 AM
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
*/

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
            result = await pool.query(
                `SELECT time_slot, label, date FROM schedule_blocks WHERE date = $1 ORDER BY time_slot`, [date]
            );
        } else {
            result = await pool.query(
                `SELECT time_slot, label, date FROM schedule_blocks ORDER BY date, time_slot`
            );
        }

        const blockedTimes = result.rows.map(row => ({
            timeSlot: row.time_slot.trim(),
            label: row.label ? row.label.trim() : "Blocked",
            date: row.date
        }));

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

// POST /api/tutoring-intake
// POST /api/tutoring-intake
app.post('/api/tutoring-intake', async (req, res) => {
  const {
    fullName,
    email,
    phone,
    haveBooked,         // frontend sends "yes" / "no"
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
  } = req.body;

  // ✅ Map yes/no -> boolean for DB column tutoring_intake_forms.have_booked (boolean)
  const haveBookedBool =
    haveBooked === 'yes' ? true :
    haveBooked === 'no' ? false :
    null;

  try {
    // Optional: keep light validation
    if (!fullName || !email) {
      return res.status(400).json({ error: 'Full name and email are required.' });
    }

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
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
      [
        fullName,
        email,
        phone || null,              // ✅ phone can be null now
        haveBookedBool,             // ✅ boolean

        whyHelp || null,

        // keep your conditional logic, but based on "no" path
        haveBooked === 'no' ? (learnDisable || null) : null,
        haveBooked === 'no' && learnDisable === 'yes' ? (whatDisable || null) : null,

        haveBooked === 'no' ? (age || null) : null,
        haveBooked === 'no' ? (grade || null) : null,
        haveBooked === 'no' ? (subject || null) : null,

        haveBooked === 'no' && subject === 'Math' ? (mathSubject || null) : null,
        haveBooked === 'no' && subject === 'Science' ? (scienceSubject || null) : null,

        currentGrade || null,
        additionalDetails || null
      ]
    );

    // ✅ Send email notification (don’t fail submission if email fails)
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

      console.log('Tutoring intake form email sent to admin.');
    } catch (emailError) {
      console.error('Error sending tutoring intake form email:', emailError?.message || emailError);
    }

    return res.status(201).json({ message: 'Tutoring Intake Form submitted successfully!' });
  } catch (error) {
    console.error('Error saving tutoring intake form submission:', error);
    return res.status(500).json({ error: 'Internal Server Error' });
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
  let { full_name, email, phone, payment_method, category } = req.body || {};

  // Required
  if (!full_name || !String(full_name).trim()) {
    return res.status(400).json({ error: 'Full name is required' });
  }

  // Normalize
  full_name = String(full_name).trim();
  email = (email ?? '').toString().trim().toLowerCase();
  if (email === '') email = null; // empty string -> NULL
  phone = (phone ?? '').toString().trim() || null;
  payment_method = (payment_method ?? '').toString().trim() || null;
  category = (category ?? 'StemwithLyn').toString().trim() || 'StemwithLyn';

  // Categories that may share emails (multiple kids per parent)
  const TUTORING_CATEGORIES = new Set(['StemwithLyn', 'Club Z', 'United Mentors', 'Above & beyond Learning']);
  const isTutoring = email && TUTORING_CATEGORIES.has(category);

  try {
    if (!email) {
      // No email, just insert (cannot dedupe without email)
      const ins = await pool.query(
        `INSERT INTO clients (full_name, email, phone, payment_method, category)
         VALUES ($1, NULL, $2, $3, $4)
         RETURNING id, full_name, email, phone, payment_method, category`,
        [full_name, phone, payment_method, category]
      );
      return res.status(201).json(ins.rows[0]);
    }

    if (isTutoring) {
      // Tutoring portal: allow duplicate emails, but prevent exact duplicate person
      // Relies on the unique index: uniq_clients_email_name_tutor
      const upsertTutoring = await pool.query(
        `
        INSERT INTO clients (full_name, email, phone, payment_method, category)
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT ON CONSTRAINT uniq_clients_email_name_tutor DO UPDATE
          SET phone = EXCLUDED.phone,
              payment_method = EXCLUDED.payment_method
        RETURNING id, full_name, email, phone, payment_method, category
        `,
        [full_name, email, phone, payment_method, category]
      );
      return res.status(201).json(upsertTutoring.rows[0]);
    } else {
      // Non-tutoring: email must be unique → upsert by email
      const upsertNonTutoring = await pool.query(
        `
        INSERT INTO clients (full_name, email, phone, payment_method, category)
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (email) DO UPDATE
          SET full_name = EXCLUDED.full_name,
              phone = EXCLUDED.phone,
              payment_method = EXCLUDED.payment_method,
              category = EXCLUDED.category
        RETURNING id, full_name, email, phone, payment_method, category
        `,
        [full_name, email, phone, payment_method, category]
      );
      return res.status(201).json(upsertNonTutoring.rows[0]);
    }
  } catch (err) {
    console.error('❌ Error adding/updating client:', err);
    return res.status(500).json({
      error: 'Failed to add client',
      details: err?.detail || err?.message || 'Unknown database error'
    });
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


app.post('/api/finalize-payment-and-book', async (req, res) => {
  const {
    transactionId,
    appointmentData
  } = req.body;

  if (!transactionId) {
    return res.status(400).json({ error: 'Missing Square transactionId.' });
  }

  try {
    // 1️⃣ Verify payment with Square
    const paymentResp = await client.paymentsApi.getPayment(transactionId);
    const payment = paymentResp?.result?.payment;

    if (!payment || payment.status !== 'COMPLETED') {
      return res.status(400).json({ error: 'Payment not completed.' });
    }

    const amountPaid =
      Number(payment.amountMoney.amount) / 100;

    // 2️⃣ Extract appointment info
    const {
      title,
      client_name,
      client_email,
      client_phone,
      date,
      time,
      end_time,
      description
    } = appointmentData;

    if (!title || !client_name || !client_email || !date || !time) {
      return res.status(400).json({ error: 'Incomplete appointment data.' });
    }

    const formattedTime =
      time.length === 5 ? `${time}:00` : time;
    const formattedEndTime =
      end_time?.length === 5 ? `${end_time}:00` : (end_time || formattedTime);

    // 3️⃣ Availability safety check
    const booked = await pool.query(
      `SELECT 1 FROM appointments WHERE date=$1 AND time=$2`,
      [date, formattedTime]
    );
    if (booked.rowCount > 0) {
      return res.status(409).json({ error: 'Time slot already booked.' });
    }

    await pool.query('BEGIN');

    // 4️⃣ Upsert client
    const clientRes = await pool.query(
      `SELECT id FROM clients WHERE email=$1`,
      [client_email]
    );

    let clientId;
    if (clientRes.rowCount === 0) {
      const insertClient = await pool.query(
        `INSERT INTO clients (full_name, email, phone, payment_method)
         VALUES ($1,$2,$3,'Square')
         RETURNING id`,
        [client_name, client_email, client_phone || '']
      );
      clientId = insertClient.rows[0].id;
    } else {
      clientId = clientRes.rows[0].id;
    }

    // 5️⃣ Create appointment (PAID)
    const apptRes = await pool.query(
      `INSERT INTO appointments
        (title, client_id, date, time, end_time, description, price, paid)
       VALUES ($1,$2,$3,$4,$5,$6,$7,true)
       RETURNING *`,
      [title, clientId, date, formattedTime, formattedEndTime, description || '', amountPaid]
    );

    // 6️⃣ Insert profit
    await pool.query(
      `INSERT INTO profits
        (category, description, amount, type, processor, processor_txn_id)
       VALUES
        ('Income', $1, $2, 'Tutoring Payment', 'Square', $3)`,
      [
        `Square Payment – ${title} (${date} ${formattedTime})`,
        amountPaid,
        transactionId
      ]
    );

    await pool.query('COMMIT');

    return res.json({
      success: true,
      appointment: apptRes.rows[0]
    });

  } catch (err) {
    await pool.query('ROLLBACK');
    console.error('❌ Finalize payment error:', err);
    return res.status(500).json({ error: 'Failed to finalize payment.' });
  }
});

app.post('/api/create-payment-link', async (req, res) => {
  const { email, amount, itemName, appointmentData } = req.body || {};

  if (!email || amount == null || isNaN(amount)) {
    return res.status(400).json({ error: 'Email and valid amount are required.' });
  }

  try {
    const baseAmount = Number(amount);
    const processingFee = (baseAmount * 0.029) + 0.30;
    const grossCents = Math.round((baseAmount + processingFee) * 100);

    const frontendBase =
      process.env.NODE_ENV === 'production'
        ? 'https://stemwithlyn.onrender.com'
        : 'http://localhost:3000';

    // ✅ success page reads localStorage; these params are just a bonus for display/debug
    const redirectUrl =
      `${frontendBase}/payment-success` +
      `?email=${encodeURIComponent(email)}` +
      `&title=${encodeURIComponent(appointmentData?.title || itemName || "Appointment")}` +
      `&amount=${encodeURIComponent(String(baseAmount))}`;

    const response = await checkoutApi.createPaymentLink({
      idempotencyKey: `${Date.now()}-${crypto.randomUUID()}`,
      quickPay: {
        name: itemName || 'Payment for Services',
        description: 'Please complete your payment.',
        priceMoney: {
          amount: grossCents,
          currency: 'USD',
        },
        locationId: process.env.SQUARE_LOCATION_ID,
      },
      checkoutOptions: {
        redirectUrl,
      },
    });

    const url = response?.result?.paymentLink?.url;

    if (!url) {
      return res.status(500).json({ error: 'Failed to create payment link (missing url).' });
    }

    return res.status(200).json({ url });
  } catch (error) {
    console.error('❌ Error creating payment link:', error);
    return res.status(500).json({ error: 'Failed to create payment link' });
  }
});


app.post('/appointments', async (req, res) => {
  try {
    console.log("✅ Received appointment request:", req.body);

    const {
      title,
      client_id,
      client_name,
      client_email,
      client_phone,
      date,
      time,
      end_time,
      description,
      addons,

      // payment info (we will NOT store on appointments table)
      amount_paid,
    } = req.body;

    // ----------------------------
    // Validate minimum required fields for your actual table
    // ----------------------------
    if (!title || !client_email || !client_name || !date || !time) {
      return res.status(400).json({
        error: "Missing required fields: title, client_name, client_email, date, time",
      });
    }

    const formattedTime = String(time).length === 5 ? `${time}:00` : time;
    const formattedEndTime =
      end_time ? (String(end_time).length === 5 ? `${end_time}:00` : end_time) : null;

    // ----------------------------
    // Upsert client by email (since appointments needs client_id)
    // ----------------------------
    let finalClientId = client_id;

    const clientRes = await pool.query(`SELECT id FROM clients WHERE email = $1`, [client_email]);

    if (clientRes.rowCount === 0) {
      const newClient = await pool.query(
        `INSERT INTO clients (full_name, email, phone)
         VALUES ($1, $2, $3)
         RETURNING id`,
        [client_name, client_email, client_phone || ""]
      );
      finalClientId = newClient.rows[0].id;
    } else {
      finalClientId = clientRes.rows[0].id;
    }

    // ----------------------------
    // Prevent double-booking (simple: same date+time)
    // ----------------------------
    const conflict = await pool.query(
      `SELECT id FROM appointments WHERE date = $1 AND time = $2 LIMIT 1`,
      [date, formattedTime]
    );
    if (conflict.rowCount > 0) {
      return res.status(409).json({ error: "That time slot is already booked." });
    }

    // ----------------------------
    // Compute price from request (your table has only `price`)
    // We treat `price` as the amount paid for paid bookings.
    // ----------------------------
    const paidAmount = Number(amount_paid ?? 0);
    const safePaidAmount = Number.isFinite(paidAmount) ? paidAmount : 0;

    // If you want to support free bookings, price stays 0
    const price = Number(req.body.price ?? safePaidAmount ?? 0) || 0;

    // ----------------------------
    // Insert appointment using ONLY existing columns
    // ----------------------------
    const insertRes = await pool.query(
      `INSERT INTO appointments
        (title, client_id, date, time, end_time, description, paid, price, addons)
       VALUES
        ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       RETURNING *`,
      [
        title,
        finalClientId,
        date,
        formattedTime,
        formattedEndTime,
        description || "",
        safePaidAmount > 0,             // paid boolean
        price,                          // store amount on appointment as price
        addons ? JSON.stringify(addons) : JSON.stringify([]),
      ]
    );

    const appointment = insertRes.rows[0];

    // ----------------------------
    // Insert profit if paid (idempotent by appointment_id)
    // ----------------------------
    if (safePaidAmount > 0) {
      const already = await pool.query(
        `SELECT 1 FROM profits WHERE appointment_id = $1 LIMIT 1`,
        [appointment.id]
      );

      if (already.rowCount === 0) {
        const desc = `Tutoring Payment – ${appointment.title} (${appointment.date} ${appointment.time})`;

        await pool.query(
          `INSERT INTO profits
            (category, description, amount, type, processor, appointment_id, paid_at)
           VALUES
            ($1,$2,$3,$4,$5,$6, NOW())`,
          [
            "Income",
            desc,
            safePaidAmount,
            "Tutoring Payment",
            "Square",
            appointment.id,
          ]
        );
      }
    }

    return res.status(201).json({ appointment });
  } catch (error) {
    console.error("❌ Error creating appointment:", error);
    return res.status(500).json({ error: "Failed to create appointment." });
  }
});


// Get all appointments (WITH client info)
app.get('/appointments', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        a.*,
        c.full_name AS client_name,
        c.email     AS client_email,
        c.phone     AS client_phone,
        c.category  AS client_category
      FROM appointments a
      LEFT JOIN clients c ON c.id = a.client_id
      ORDER BY a.date, a.time;
    `);

    res.status(200).json(result.rows);
  } catch (error) {
    console.error('❌ Error fetching all appointments:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});


// Get filtered appointments (WITH client info)
app.get('/appointments/by-date', async (req, res) => {
  try {
    const { date } = req.query;

    if (!date) {
      return res.status(400).json({ error: "Date is required to fetch appointments." });
    }

    const result = await pool.query(`
      SELECT
        a.*,
        c.full_name AS client_name,
        c.email     AS client_email,
        c.phone     AS client_phone,
        c.category  AS client_category
      FROM appointments a
      LEFT JOIN clients c ON c.id = a.client_id
      WHERE a.date = $1
      ORDER BY a.time;
    `, [date]);

    res.json(result.rows);
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

app.patch('/appointments/:id/paid', async (req, res) => {
  const { id } = req.params;
  const { paid } = req.body;

  try {
    // 1) Fetch appointment
    const apptRes = await pool.query(
      `SELECT id, title, price, client_id, date, time, paid
       FROM appointments
       WHERE id = $1`,
      [id]
    );

    if (apptRes.rowCount === 0) {
      return res.status(404).json({ error: 'Appointment not found' });
    }

    const appt = apptRes.rows[0];
    const price = Number(appt.price || 0);

    // 2) Update paid flag
    await pool.query(`UPDATE appointments SET paid = $1 WHERE id = $2`, [paid, id]);

    // 3) If paid=true and price>0 → insert profit (idempotent)
    if (paid === true && price > 0) {
      const description = `Tutoring Payment: ${appt.title} (${appt.date} ${appt.time})`;

      const exists = await pool.query(
        `SELECT id FROM profits WHERE description = $1 LIMIT 1`,
        [description]
      );

      if (exists.rowCount === 0) {
        await pool.query(
          `INSERT INTO profits (category, description, amount, type)
           VALUES ($1, $2, $3, $4)`,
          ['Income', description, price, 'Tutoring Payment']
        );
      }
    }

    return res.json({
      message: 'Payment status updated and profits synced.',
      appointmentId: appt.id,
      paid: paid === true,
    });
  } catch (error) {
    console.error('Error updating appointment paid status:', error);
    return res.status(500).json({ error: 'Internal Server Error' });
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
        const result = await pool.query("SELECT * FROM weekly_availability ORDER BY weekday, start_time");

        res.json(result.rows);
    } catch (error) {
        console.error("❌ Error fetching admin availability:", error);
        res.status(500).json({ success: false, error: "Failed to fetch availability for admin." });
    }
});


app.get('/availability', async (req, res) => {
    try {
        const { weekday, appointmentType } = req.query;

        const availabilityQuery = `
            SELECT * FROM weekly_availability
            WHERE LOWER(weekday) = LOWER($1) 
            AND LOWER(appointment_type) = LOWER($2)
            ORDER BY start_time
        `;
        
        const queryParams = [weekday.trim(), appointmentType.trim()];

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

// ✅ Backend (add to app.js)
app.get("/api/square-confirm/:checkoutId", async (req, res) => {
    const { checkoutId } = req.params;

    try {
        const response = await client.checkoutApi.retrievePaymentLink(checkoutId);
        const payment = response.result.paymentLink;

        if (!payment || payment.status !== 'ACTIVE') {
            return res.status(400).json({ error: 'Invalid or incomplete payment.' });
        }

        const metadata = payment.checkoutOptions?.metadata;
        if (!metadata?.appointmentData) {
            return res.status(400).json({ error: 'Missing appointment metadata.' });
        }

        const appointmentData = JSON.parse(metadata.appointmentData);

        const appointmentRes = await axios.post(`${process.env.API_URL || 'http://localhost:3001'}/appointments`, appointmentData);

        res.status(200).json({ message: "Appointment confirmed!", data: appointmentRes.data });
    } catch (error) {
        console.error("❌ Error confirming Square payment:", error);
        res.status(500).json({ error: "Failed to confirm payment." });
    }
});

app.post('/api/profits', async (req, res) => {
    const { category, description, amount, type } = req.body;

    if (!amount || isNaN(amount)) {
        return res.status(400).json({ error: 'Valid amount is required.' });
    }

    try {
        const query = `
            INSERT INTO profits (category, description, amount, type)
            VALUES ($1, $2, $3::FLOAT, $4)
            RETURNING *;
        `;
        const values = [category, description, amount, type];
        const result = await pool.query(query, values);
        res.status(201).json(result.rows[0]);
    } catch (error) {
        console.error('Error adding to profits:', error);
        res.status(500).json({ error: 'Failed to add to profits.' });
    }
});

app.get('/api/profits', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT id, category, description, amount, type, created_at
      FROM profits
      ORDER BY created_at DESC;
    `);
    res.status(200).json(result.rows);
  } catch (error) {
    console.error('Error fetching profits data:', error);
    res.status(500).json({ error: 'Failed to fetch profits data.' });
  }
});


// Helper: Calculate the correct profit amount
function determineProfitAmount(appointment, clientCategory) {
    const thirdPartyRates = {
      "Above & Beyond Learning": {
        virtual: 35,
        inPerson: 40
      },
      "Club Z": {
        virtual: 25,
        inPerson: 28
      },
      "United Mentors": {
        virtual: 30,
        inPerson: 35
      },
    };
  
    // If StemwithLyn or no category, parse from title
    if (!clientCategory || clientCategory === 'StemwithLyn') {
      const match = appointment.title.match(/\$(\d+(\.\d{1,2})?)/);
      return match ? parseFloat(match[1]) : 0;
    }
  
    // Third Party handling
    const rates = thirdPartyRates[clientCategory];
    if (!rates) return 0;
  
    const lowerTitle = appointment.title.toLowerCase();
    if (lowerTitle.includes('in-person')) {
      return rates.inPerson;
    } else {
      return rates.virtual;
    }
  }
  
// Update profits for already paid appointments
app.post('/api/update-profits-for-old-payments', async (req, res) => {
    try {
      // Fetch all paid appointments and join with client categories
      const appointmentsResult = await pool.query(`
        SELECT a.id, a.title, a.price, c.category
        FROM appointments a
        JOIN clients c ON a.client_id = c.id
        WHERE a.paid = true
          AND NOT EXISTS (
            SELECT 1 FROM profits
            WHERE profits.description LIKE CONCAT('%', a.title, '%')
            AND profits.amount = a.price
          )
      `);
  
      for (const appt of appointmentsResult.rows) {
        const calculatedAmount = determineProfitAmount(appt, appt.category);
  
        const isThirdParty = appt.category && appt.category !== 'StemwithLyn';
  
        await pool.query(
          `INSERT INTO profits (category, description, amount, type)
           VALUES ($1, $2, $3, $4)`,
          [
            isThirdParty ? 'Income (Third Party)' : 'Income',
            `Payment for Tutoring: ${appt.title}`,
            calculatedAmount,
            'Tutoring Payment',
          ]
        );
      }
  
      res.json({ message: 'Profits table updated successfully based on paid appointments.' });
    } catch (error) {
      console.error('Error updating profits for old payments:', error);
      res.status(500).json({ error: 'Failed to update profits.' });
    }
  });
  

// Serve static files (hashed assets can be cached long-term)
app.use(
  express.static(path.join(__dirname, '../frontend/build'), {
    setHeaders: (res, filePath) => {
      if (filePath.endsWith('index.html')) {
        // ❗ NEVER cache index.html
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');
      } else {
        // ✅ Cache hashed JS/CSS forever
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      }
    },
  })
);

// React Router fallback
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/build', 'index.html'));
});


// Export app for server startup
export default app;

// Start the server
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});