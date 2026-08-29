import pkg from "pg";
import dotenv from "dotenv";

dotenv.config();

const { Pool } = pkg;

const isProduction = process.env.NODE_ENV === "production";
const useSsl = isProduction || String(process.env.DB_SSL).toLowerCase() === "true";

const pool = isProduction
  ? new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: useSsl ? { rejectUnauthorized: false } : false,
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
      keepAlive: true,
      keepAliveInitialDelayMillis: 10000,
      options: "-c timezone=America/New_York",
    })
  : new Pool({
      user: process.env.DB_USER,
      host: process.env.DB_HOST,
      database: process.env.DB_NAME,
      password: process.env.DB_PASSWORD,
      port: Number(process.env.DB_PORT || 5432),
      ssl: useSsl ? { rejectUnauthorized: false } : false,
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
      keepAlive: true,
      keepAliveInitialDelayMillis: 10000,
      options: "-c timezone=America/New_York",
    });

// 🔥 THIS IS THE FIX YOU WERE MISSING
pool.on("error", (err) => {
  console.error("Unexpected PostgreSQL pool connection error:", {
    code: err?.code,
    message: err?.message,
  });
});

export default pool;
