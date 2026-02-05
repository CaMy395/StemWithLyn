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
import {sendPortalInviteEmail, sendRegistrationEmail,sendResetEmail, sendTutoringIntakeEmail, sendTutoringApptEmail, sendTutoringRescheduleEmail,sendCancellationEmail, sendTextMessage,  sendMentorSessionLogEmail} from './emailService.js';
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
  'http://127.0.0.1:3000',
  'https://stemwithlyn.onrender.com',
  'https://www.stemwithlyn.onrender.com',
];

app.use(
  cors({
    origin: function (origin, callback) {
      // allow requests with no origin (like Postman) and allow known origins
      if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
      return callback(new Error("Not allowed by CORS"));
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: [
      "Content-Type",
      "Authorization",
      "x-user-id",
      "x-username",
    ],
    exposedHeaders: ["Content-Type"],
  })
);

// IMPORTANT: respond to preflight
app.options("*", cors());


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
  // Everyone is a "user". user_type controls student vs tech-client.
  const { name, username, email, phone, password, user_type } = req.body;

  // ✅ Force role
  const role = 'user';

  // ✅ Validate user_type
  const normalizedUserType = user_type ? String(user_type).toLowerCase().trim() : null;
  const allowedUserTypes = new Set(['student', 'client', null]);
  if (!allowedUserTypes.has(normalizedUserType)) {
    return res.status(400).json({ error: "Invalid user_type. Use 'student' or 'client'." });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Check if the username or email already exists
    const existingUser = await client.query(
      'SELECT id FROM users WHERE username = $1 OR lower(email) = lower($2) LIMIT 1',
      [username, email]
    );

    if (existingUser.rowCount > 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Username or email already exists' });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Insert user (✅ role forced to 'user', ✅ store user_type)
    const newUserRes = await client.query(
      `INSERT INTO users (name, username, email, phone, password, role, user_type)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, name, username, email, phone, role, user_type, created_at`,
      [name, username, email, phone || null, hashedPassword, role, normalizedUserType]
    );

    const newUser = newUserRes.rows[0];

    // ✅ If they registered as a STUDENT, ensure there is a linked clients row
    // This is what prevents "Client profile not linked yet" in tutoring portal.
    if (normalizedUserType === 'student') {
      // Try to find existing StemwithLyn client record by email
      const existingClient = await client.query(
        `SELECT id, user_id
           FROM clients
          WHERE category = 'StemwithLyn'
            AND email IS NOT NULL
            AND lower(email) = lower($1)
          ORDER BY id DESC
          LIMIT 1`,
        [email]
      );

      if (existingClient.rowCount > 0) {
        const c = existingClient.rows[0];

        // If already linked to someone else, don't overwrite
        if (c.user_id && Number(c.user_id) !== Number(newUser.id)) {
          await client.query('ROLLBACK');
          return res.status(409).json({
            error: "This email is already linked to another student portal account. Please contact support.",
          });
        }

        await client.query(
          `UPDATE clients
              SET user_id = $1,
                  full_name = COALESCE(full_name, $2),
                  phone = COALESCE(phone, $3)
            WHERE id = $4`,
          [newUser.id, name, phone || null, c.id]
        );
      } else {
        // Create a new client row linked to this user
        await client.query(
          `INSERT INTO clients (full_name, email, phone, category, user_id)
           VALUES ($1, $2, $3, 'StemwithLyn', $4)`,
          [name, email, phone || null, newUser.id]
        );
      }
    }

    await client.query('COMMIT');

    // Send registration email (outside transaction is OK)
    try {
      await sendRegistrationEmail(email, username, name);
      console.log(`Welcome email sent to ${email}`);
    } catch (emailError) {
      console.error('Error sending registration email:', emailError.message);
    }

    return res.status(201).json(newUser);
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error during registration:', error);
    return res.status(500).json({ error: 'Internal server error' });
  } finally {
    client.release();
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


      return res.status(200).json({
        id: user.id,
        name: user.name,
        username: user.username,
        email: user.email,
        role: user.role,
      });

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

// Route for getting users
app.get('/users', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM users'); // Adjust the query as necessary
        res.json(result.rows);
    } catch (error) {
        console.error('Error fetching users:', error);
        res.status(500).send('Server Error');
    }
});

/* ============================
   CLIENT PORTAL / INVITES
   ============================ */

// ✅ Client Portal Auth Helper
async function requireClientUser(req) {
  try {
    const userIdRaw = req.headers["x-user-id"];
    const usernameRaw = req.headers["x-username"];

    let user = null;

    if (userIdRaw) {
      const id = Number(userIdRaw);
      if (!Number.isFinite(id)) {
        return { ok: false, status: 401, error: "Invalid user id." };
      }

      const u = await pool.query(
        "SELECT id, name, username, email, phone, role FROM users WHERE id = $1 LIMIT 1",
        [id]
      );
      user = u.rows[0] || null;
    } else if (usernameRaw) {
      const u = await pool.query(
        "SELECT id, name, username, email, phone, role FROM users WHERE username = $1 LIMIT 1",
        [String(usernameRaw)]
      );
      user = u.rows[0] || null;
    }

    if (!user) return { ok: false, status: 401, error: "Not authenticated." };

    // ✅ Only block admins
    if (user.role === "admin") {
      return { ok: false, status: 403, error: "Admins do not use the client portal." };
    }

    return { ok: true, user };
  } catch (err) {
    console.error("❌ requireClientUser error:", err);
    return { ok: false, status: 500, error: "Auth error." };
  }
}

// helper: make a username from a name + id fallback
function makeUsernameFromName(fullName, fallbackId) {
  const base = String(fullName || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ".")
    .replace(/^\.+|\.+$/g, "")
    .slice(0, 22);

  return base ? `${base}` : `client_${fallbackId || Date.now()}`;
}

// helper: require a logged-in user from headers (simple, matches your current style)
// Frontend will send: x-user-id and x-username (stored after login)
async function requireLoggedInUser(req) {
  const userId = Number(req.headers["x-user-id"]);
  const username = String(req.headers["x-username"] || "").trim();

  if (!userId || !username) {
    return { ok: false, status: 401, error: "Not logged in." };
  }

  const u = await pool.query(
    "SELECT id, username, email, role, name, phone FROM users WHERE id = $1 AND username = $2 LIMIT 1",
    [userId, username]
  );

  if (u.rowCount === 0) {
    return { ok: false, status: 401, error: "Invalid session." };
  }

  const user = u.rows[0];

  // only you are admin
  if (user.role === "admin") {
    return { ok: false, status: 403, error: "Admins do not use the client portal." };
  }

  return { ok: true, user };
}


/**
 * ADMIN: Invite an existing client to create a portal login
 * POST /admin/clients/:clientId/invite-login
 * body: { }  (optional: { force: true })
 *
 * - Creates a users row with role=client (if missing)
 * - Links clients.user_id
 * - Generates reset_token and emails reset link (uses your existing reset flow)
 */
app.post("/admin/clients/:clientId/invite-login", async (req, res) => {
  const { clientId } = req.params;
  const force = Boolean(req.body?.force);

  try {
    const cRes = await pool.query(
      "SELECT id, full_name, email, user_id FROM clients WHERE id = $1 LIMIT 1",
      [clientId]
    );

    if (cRes.rowCount === 0) return res.status(404).json({ error: "Client not found." });

    const clientRow = cRes.rows[0];
    if (!clientRow.email) {
      return res.status(400).json({ error: "Client has no email on file." });
    }

    // If already linked to a user and not forcing, re-send invite
    let userId = clientRow.user_id;

    if (!userId || force) {
      // Check if a user already exists by email
      const existingU = await pool.query(
        "SELECT id, username FROM users WHERE lower(email) = lower($1) LIMIT 1",
        [clientRow.email]
      );

      if (existingU.rowCount > 0 && !force) {
        // If user exists but client not linked, link it
        userId = existingU.rows[0].id;
        await pool.query("UPDATE clients SET user_id = $1 WHERE id = $2", [userId, clientRow.id]);
      } else if (existingU.rowCount > 0 && force) {
        userId = existingU.rows[0].id;
        // keep linkage correct
        await pool.query("UPDATE clients SET user_id = $1 WHERE id = $2", [userId, clientRow.id]);
      } else {
        // Create a new client user with a random temp password (never emailed)
        const tempPassword = crypto.randomBytes(12).toString("hex");
        const hashed = await bcrypt.hash(tempPassword, 10);

        // Generate a unique username
        let username = makeUsernameFromName(clientRow.full_name, clientRow.id);
        let attempt = 0;

        // Ensure username is unique
        while (attempt < 5) {
          const chk = await pool.query("SELECT 1 FROM users WHERE username = $1 LIMIT 1", [username]);
          if (chk.rowCount === 0) break;
          attempt += 1;
          username = `${makeUsernameFromName(clientRow.full_name, clientRow.id)}${attempt}`;
        }

        const newU = await pool.query(
          `INSERT INTO users (name, username, email, phone, password, role)
           VALUES ($1,$2,$3,$4,$5,'client')
           RETURNING id, username, email`,
          [clientRow.full_name, username, clientRow.email, null, hashed]
        );

        userId = newU.rows[0].id;
        await pool.query("UPDATE clients SET user_id = $1 WHERE id = $2", [userId, clientRow.id]);
      }
    }

    // Create a reset token as the "invite" link
    const resetToken = crypto.randomBytes(20).toString("hex");
    const expiration = Date.now() + 1000 * 60 * 60 * 24 * 7; // 7 days

    await pool.query(
      "UPDATE users SET reset_token = $1, reset_token_expiry = $2 WHERE id = $3",
      [resetToken, expiration, userId]
    );

    // Send invite using your existing reset email function
    const frontendUrl = process.env.NODE_ENV === "production"
      ? "https://stemwithlyn.onrender.com"
      : "http://localhost:3000";

    const resetLink = `${frontendUrl}/reset-password?token=${resetToken}`;

    await sendResetEmail(clientRow.email, resetLink);

    // Also send them their username (no password)
    const uRes = await pool.query("SELECT username FROM users WHERE id = $1 LIMIT 1", [userId]);
    const username = uRes.rows[0]?.username;

    return res.json({
      success: true,
      message: "Invite sent.",
      clientId: clientRow.id,
      username,
      email: clientRow.email,
    });
  } catch (err) {
    console.error("❌ invite-login error:", err);
    return res.status(500).json({ error: "Failed to send invite." });
  }
});

/**
 * CLIENT: Get my client profile
 * GET /client/me
 */
/**
 * CLIENT: Get my client profile
 * GET /client/me
 */
app.get("/client/me", async (req, res) => {
  try {
    const auth = await requireClientUser(req); // your helper
    if (!auth.ok) return res.status(auth.status).json({ error: auth.error });

    const { user } = auth;

    // 1) Try linked by user_id
    let cRes = await pool.query(
      `SELECT id, full_name, email, phone, category, user_id
         FROM clients
        WHERE user_id = $1
        LIMIT 1`,
      [user.id]
    );

    // 2) Try match by email (case-insensitive)
    if (cRes.rowCount === 0 && user.email) {
      const match = await pool.query(
        `SELECT id, full_name, email, phone, category, user_id
           FROM clients
          WHERE email IS NOT NULL
            AND lower(email) = lower($1)
          ORDER BY id DESC
          LIMIT 1`,
        [user.email]
      );

      if (match.rowCount > 0) {
        const row = match.rows[0];

        // already linked to someone else?
        if (row.user_id && Number(row.user_id) !== Number(user.id)) {
          return res.status(409).json({
            error: "This email is already linked to another portal account. Please contact support.",
          });
        }

        // link it
        await pool.query(`UPDATE clients SET user_id = $1 WHERE id = $2`, [user.id, row.id]);

        cRes = await pool.query(
          `SELECT id, full_name, email, phone, category, user_id
             FROM clients
            WHERE user_id = $1
            LIMIT 1`,
          [user.id]
        );
      }
    }

    // 3) Still nothing? AUTO-CREATE the client profile from the user record
    if (cRes.rowCount === 0) {
      const created = await pool.query(
        `INSERT INTO clients (full_name, email, phone, category, user_id)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, full_name, email, phone, category, user_id`,
        [
          user.name || user.username || "Client",
          user.email || null,
          user.phone || null,
          "StemwithLyn",
          user.id,
        ]
      );

      cRes = { rowCount: 1, rows: [created.rows[0]] };
    }

    return res.json({
      user: { id: user.id, name: user.name, username: user.username, email: user.email, role: user.role },
      client: cRes.rows[0],
    });
  } catch (err) {
    console.error("❌ /client/me error:", err);
    return res.status(500).json({ error: "Failed to load client profile." });
  }
});


app.post("/admin/clients/:clientId/create-login", async (req, res) => {
  const { clientId } = req.params;

  const db = await pool.connect();
  try {
    await db.query("BEGIN");

    // 1) Load client
    const cRes = await db.query(
      `SELECT id, full_name, email, phone, user_id
         FROM clients
        WHERE id = $1
        LIMIT 1`,
      [clientId]
    );

    if (cRes.rowCount === 0) {
      await db.query("ROLLBACK");
      return res.status(404).json({ error: "Client not found." });
    }

    const c = cRes.rows[0];

    if (!c.email) {
      await db.query("ROLLBACK");
      return res.status(400).json({ error: "Client must have an email to create a login." });
    }

    if (c.user_id) {
      // Already linked → still allow resend invite
      await db.query("COMMIT");

      // ✅ Send portal invite anyway (resend)
      try {
        await sendPortalInviteEmail(c.email, c.full_name);
      } catch (e) {
        console.error("❌ Portal invite send failed:", e.message);
      }

      return res.json({ success: true, alreadyLinked: true });
    }

    // 2) If a user already exists with this email, link it
    const existingUser = await db.query(
      `SELECT id, username, email, role
         FROM users
        WHERE lower(email) = lower($1)
        LIMIT 1`,
      [c.email]
    );

    let userRow = null;
    let createdNewUser = false;

    if (existingUser.rowCount > 0) {
      userRow = existingUser.rows[0];

      // don't link to admin
      if (userRow.role === "admin") {
        await db.query("ROLLBACK");
        return res.status(409).json({ error: "That email belongs to an admin account." });
      }

      await db.query(`UPDATE clients SET user_id = $1 WHERE id = $2`, [userRow.id, c.id]);
    } else {
      // 3) Create new user with a random username + temp password
      const base = String(c.email)
        .split("@")[0]
        .toLowerCase()
        .replace(/[^a-z0-9_]/g, "")
        .slice(0, 16);

      const suffix = Math.floor(100 + Math.random() * 900);
      const username = `${base}${suffix}`;

      const tempPassword = Math.random().toString(36).slice(-10) + "A1!";
      const hashed = await bcrypt.hash(tempPassword, 10);

      const uRes = await db.query(
        `INSERT INTO users (name, username, email, phone, password, role)
         VALUES ($1, $2, $3, $4, $5, 'user')
         RETURNING id, username, email, role`,
        [c.full_name, username, c.email, c.phone || null, hashed]
      );

      userRow = uRes.rows[0];
      createdNewUser = true;

      await db.query(`UPDATE clients SET user_id = $1 WHERE id = $2`, [userRow.id, c.id]);

      // NOTE: We do NOT email the temp password.
      // We email a portal invite telling them to set password via "Forgot Password".
    }

    await db.query("COMMIT");

    // ✅ 4) Always send portal invite email (works for existing users too)
    try {
      await sendPortalInviteEmail(c.email, c.full_name);
    } catch (e) {
      console.error("❌ Portal invite send failed:", e.message);
      // We still return success because account linking happened
    }

    return res.json({
      success: true,
      createdNewUser,
      user: userRow,
    });
  } catch (err) {
    await db.query("ROLLBACK");
    console.error("❌ create-login error:", err);
    return res.status(500).json({ error: "Failed to create login." });
  } finally {
    db.release();
  }
});


/**
 * CLIENT: My appointments (history + upcoming)
 * GET /client/appointments
 */
app.get("/client/appointments", async (req, res) => {
  try {
    const auth = await requireClientUser(req);
    if (!auth.ok) return res.status(auth.status).json({ error: auth.error });
    const { user } = auth;

    const cRes = await pool.query("SELECT id FROM clients WHERE user_id = $1 LIMIT 1", [user.id]);
    if (cRes.rowCount === 0) return res.status(404).json({ error: "Client not linked." });

    const clientId = cRes.rows[0].id;

    const appts = await pool.query(
      `SELECT a.*
       FROM appointments a
       WHERE a.client_id = $1
       ORDER BY a.date DESC, a.time DESC`,
      [clientId]
    );

    return res.json(appts.rows);
  } catch (err) {
    console.error("❌ /client/appointments error:", err);
    return res.status(500).json({ error: "Failed to load appointments." });
  }
});

/**
 * CLIENT: Cancel appointment (only once)
 * POST /client/appointments/:id/cancel
 */
app.post("/client/appointments/:id/cancel", async (req, res) => {
  try {
    const auth = await requireClientUser(req);
    if (!auth.ok) return res.status(auth.status).json({ error: auth.error });
    const { user } = auth;

    const cRes = await pool.query("SELECT id FROM clients WHERE user_id = $1 LIMIT 1", [user.id]);
    if (cRes.rowCount === 0) return res.status(404).json({ error: "Client not linked." });
    const clientId = cRes.rows[0].id;

    const { id } = req.params;

    const apptRes = await pool.query(
      `SELECT * FROM appointments WHERE id = $1 AND client_id = $2 LIMIT 1`,
      [id, clientId]
    );

    if (apptRes.rowCount === 0) return res.status(404).json({ error: "Appointment not found." });

    const appt = apptRes.rows[0];
    if ((appt.client_cancel_count || 0) >= 1) {
      return res.status(403).json({ error: "Cancel limit reached. Please contact us." });
    }

    // increment cancel count + delete (matches your current cancel pattern)
    await pool.query("UPDATE appointments SET client_cancel_count = client_cancel_count + 1 WHERE id = $1", [id]);
    await pool.query("DELETE FROM appointments WHERE id = $1", [id]);

    // Email cancellation using your existing helper
    const clientRow = await pool.query("SELECT email, full_name FROM clients WHERE id = $1", [clientId]);
    if (clientRow.rowCount > 0) {
      await sendCancellationEmail({
        title: appt.title,
        email: clientRow.rows[0].email,
        full_name: clientRow.rows[0].full_name,
        date: appt.date,
        time: appt.time,
        description: appt.description,
      });
    }

    return res.json({ success: true, message: "Appointment cancelled." });
  } catch (err) {
    console.error("❌ cancel error:", err);
    return res.status(500).json({ error: "Failed to cancel appointment." });
  }
});

/**
 * CLIENT: Reschedule appointment (only once)
 * POST /client/appointments/:id/reschedule
 * body: { date, time, end_time }
 */
app.post("/client/appointments/:id/reschedule", async (req, res) => {
  try {
    const auth = await requireClientUser(req);
    if (!auth.ok) return res.status(auth.status).json({ error: auth.error });
    const { user } = auth;

    const cRes = await pool.query("SELECT id, full_name, email FROM clients WHERE user_id = $1 LIMIT 1", [user.id]);
    if (cRes.rowCount === 0) return res.status(404).json({ error: "Client not linked." });
    const client = cRes.rows[0];

    const { id } = req.params;
    const { date, time, end_time } = req.body || {};

    if (!date || !time) return res.status(400).json({ error: "date and time are required." });

    const apptRes = await pool.query(
      `SELECT * FROM appointments WHERE id = $1 AND client_id = $2 LIMIT 1`,
      [id, client.id]
    );
    if (apptRes.rowCount === 0) return res.status(404).json({ error: "Appointment not found." });

    const appt = apptRes.rows[0];
    if ((appt.client_reschedule_count || 0) >= 1) {
      return res.status(403).json({ error: "Reschedule limit reached. Please contact us." });
    }

    const normalizeTime = (t) => {
      const s = String(t);
      if (s.length === 5) return `${s}:00`;
      return s;
    };

    const newTime = normalizeTime(time);
    const newEnd = end_time ? normalizeTime(end_time) : appt.end_time;

    // prevent conflicts
    const conflict = await pool.query(
      `SELECT id FROM appointments WHERE date = $1 AND time = $2 AND id <> $3 LIMIT 1`,
      [date, newTime, id]
    );
    if (conflict.rowCount > 0) return res.status(409).json({ error: "That time slot is already booked." });

    await pool.query(
      `UPDATE appointments
       SET date = $1, time = $2, end_time = $3, client_reschedule_count = client_reschedule_count + 1
       WHERE id = $4
       RETURNING *`,
      [date, newTime, newEnd, id]
    );

    // send reschedule email
    await sendTutoringRescheduleEmail({
      title: appt.title,
      email: client.email,
      full_name: client.full_name,
      old_date: appt.date,
      old_time: appt.time,
      new_date: date,
      new_time: newTime,
      end_time: newEnd,
      description: appt.description,
    });

    return res.json({ success: true, message: "Appointment rescheduled." });
  } catch (err) {
    console.error("❌ reschedule error:", err);
    return res.status(500).json({ error: "Failed to reschedule appointment." });
  }
});

// POST route for creating a task
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
app.post('/api/tutoring-intake', async (req, res) => {
  try {
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
      additionalDetails
    } = req.body;

    // -----------------------------
    // REQUIRED VALIDATION (DB-SAFE)
    // -----------------------------
    if (!haveBooked) {
      return res.status(400).json({ error: 'haveBooked is required.' });
    }

    // Only enforce full intake if NEW client
    if (haveBooked === 'no') {
      if (!fullName || !email || !phone) {
        return res.status(400).json({
          error: 'Full name, email, and phone are required.'
        });
      }

      if (!whyHelp || !String(whyHelp).trim()) {
        return res.status(400).json({
          error: 'whyHelp is required.'
        });
      }

      if (!age || !grade || !subject || !currentGrade) {
        return res.status(400).json({
          error: 'Age, grade, subject, and current grade are required.'
        });
      }

      if (learnDisable === 'yes' && !whatDisable) {
        return res.status(400).json({
          error: 'Disability details are required.'
        });
      }
    }

    // -----------------------------
    // INSERT
    // -----------------------------
    const insertQuery = `
      INSERT INTO tutoring_intake_forms (
        full_name,
        email,
        phone,
        why_help,
        learn_disability,
        what_disability,
        age,
        grade,
        subject,
        math_subject,
        science_subject,
        current_grade,
        additional_details,
        have_booked
      )
      VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14
      )
      RETURNING id;
    `;

    const values = [
      fullName || null,
      email || null,
      phone || null,

      // 🔒 NEVER NULL — DB requires this
      String(whyHelp || '').trim(),

      learnDisable || null,
      whatDisable || null,
      age || null,
      grade || null,
      subject || null,
      mathSubject || null,
      scienceSubject || null,
      currentGrade || null,
      additionalDetails || null,
      haveBooked
    ];

    const result = await pool.query(insertQuery, values);

    return res.status(201).json({
      success: true,
      intakeId: result.rows[0].id
    });

  } catch (error) {
    console.error('❌ Error saving tutoring intake form submission:', error);
    return res.status(500).json({
      error: 'Failed to save tutoring intake form.'
    });
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
        INSERT INTO clients (full_name, email, phone, category)
        VALUES ($1, $2, $3, $4)
        RETURNING id, full_name, email, phone, category
        `,
        [full_name, email, phone, category]
      );
      return res.status(201).json(upsertTutoring.rows[0]);
    } else {
      // Non-tutoring: email must be unique → upsert by email
      const upsertNonTutoring = await pool.query(
        `
        INSERT INTO clients (full_name, email, phone, category)
        VALUES ($1, $2, $3, $4)
        RETURNING id, full_name, email, phone, category
        `,
        [full_name, email, phone, category]
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
        const result = await pool.query('SELECT id, full_name, email, phone, category, user_id  FROM clients ORDER BY id DESC');
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

      // payment info (do NOT store on appointments table)
      amount_paid,

      // recurrence (admin uses this)
      recurrence = '',
      occurrences = 1,
      weekdays = [],

      // admin flag
      isAdmin = false,
    } = req.body;

    // ----------------------------
    // Validate minimum required fields
    // ----------------------------
    if (!title || !client_email || !client_name || !date || !time) {
      return res.status(400).json({
        error: "Missing required fields: title, client_name, client_email, date, time",
      });
    }

    // Normalize times for DB "time" type
    const normalizeTime = (t) => {
      if (t == null || t === "") return null;
      const s = String(t);
      if (s.length === 5) return `${s}:00`;        // HH:MM -> HH:MM:SS
      if (s.length === 8) return s;                // HH:MM:SS
      // If someone passes "10" or 10, treat as HH:00:00
      const n = Number(s);
      if (Number.isFinite(n)) return `${String(n).padStart(2, "0")}:00:00`;
      return s;
    };

    const formattedTime = normalizeTime(time);
    const formattedEndTime = normalizeTime(end_time);

    // ----------------------------
    // Upsert client by email
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
    // Price / paid logic (appointments table has only paid + price)
    // ----------------------------
    const paidAmount = Number(amount_paid ?? 0);
    const safePaidAmount = Number.isFinite(paidAmount) ? paidAmount : 0;

    const price = Number(req.body.price ?? safePaidAmount ?? 0) || 0;
    const isPaid = safePaidAmount > 0;

    // ----------------------------
    // Build list of dates to create (supports admin recurrence)
    // ----------------------------
    const buildDates = () => {
      const out = [];

      // Base start date
      const start = new Date(date + "T12:00:00"); // noon prevents timezone date shifting
      const occ = Math.max(1, parseInt(occurrences, 10) || 1);

      const weekdayMap = {
        Sunday: 0,
        Monday: 1,
        Tuesday: 2,
        Wednesday: 3,
        Thursday: 4,
        Friday: 5,
        Saturday: 6,
      };

      // Weekly/Biweekly with selected weekdays
      if ((recurrence === "weekly" || recurrence === "biweekly") && Array.isArray(weekdays) && weekdays.length > 0) {
        const intervalDays = recurrence === "weekly" ? 7 : 14;

        // We interpret "occurrences" as number of weeks
        for (let w = 0; w < occ; w++) {
          const weekStart = new Date(start);
          weekStart.setDate(start.getDate() + w * intervalDays);

          // For each selected weekday, compute that week's date
          for (const wd of weekdays) {
            const targetDow = weekdayMap[wd];
            if (targetDow === undefined) continue;

            const d = new Date(weekStart);
            const currentDow = d.getDay();
            const diff = targetDow - currentDow;
            d.setDate(d.getDate() + diff);

            const yyyy = d.getFullYear();
            const mm = String(d.getMonth() + 1).padStart(2, "0");
            const dd = String(d.getDate()).padStart(2, "0");
            out.push(`${yyyy}-${mm}-${dd}`);
          }
        }

        // de-dupe + sort
        return Array.from(new Set(out)).sort();
      }

      // Monthly recurrence (occurrences months)
      if (recurrence === "monthly") {
        for (let i = 0; i < occ; i++) {
          const d = new Date(start);
          d.setMonth(start.getMonth() + i);

          const yyyy = d.getFullYear();
          const mm = String(d.getMonth() + 1).padStart(2, "0");
          const dd = String(d.getDate()).padStart(2, "0");
          out.push(`${yyyy}-${mm}-${dd}`);
        }
        return out;
      }

      // Default: single date
      return [date];
    };

    const datesToCreate = buildDates();

    // ----------------------------
    // Create appointments (skip conflicts instead of crashing)
    // ----------------------------
    const created = [];

    for (const d of datesToCreate) {
      // conflict check (date + time)
      const conflict = await pool.query(
        `SELECT id FROM appointments WHERE date = $1 AND time = $2 LIMIT 1`,
        [d, formattedTime]
      );
      if (conflict.rowCount > 0) {
        // Admin: skip; Client: treat as conflict
        if (!isAdmin) {
          return res.status(409).json({ error: "That time slot is already booked." });
        }
        continue;
      }

      const insertRes = await pool.query(
        `INSERT INTO appointments
          (title, client_id, date, time, end_time, description, paid, price, addons)
         VALUES
          ($1,$2,$3,$4,$5,$6,$7,$8,$9)
         RETURNING *`,
        [
          title,
          finalClientId,
          d,
          formattedTime,
          formattedEndTime,
          description || "",
          // Only mark paid for paid flow; admin can create unpaid appointments
          isAdmin ? false : isPaid,
          // Store amount on appointment as price (for paid flow); admin can still set price if you want
          isAdmin ? (Number(req.body.price) || 0) : price,
          addons ? JSON.stringify(addons) : JSON.stringify([]),
        ]
      );

      created.push(insertRes.rows[0]);
    }

    if (created.length === 0) {
      return res.status(409).json({
        error: "No appointment was created (all requested slots were already booked).",
      });
    }

    // ----------------------------
    // Profit insert ONLY for paid flow (usually client success page)
    // Idempotent: one profit per appointment_id
    // ----------------------------
    if (!isAdmin && safePaidAmount > 0) {
      const first = created[0];

      const already = await pool.query(
        `SELECT 1 FROM profits WHERE appointment_id = $1 LIMIT 1`,
        [first.id]
      );

      if (already.rowCount === 0) {
        const desc = `Tutoring Payment – ${first.title} (${first.date} ${first.time})`;

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
            first.id,
          ]
        );
      }
    }

    // ✅ Return both shapes so ALL frontends are happy
    return res.status(201).json({
      appointment: created[0],
      appointments: created,
    });
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