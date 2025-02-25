import pkg from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const { Pool } = pkg; // Using Pool for PostgreSQL

// Load environment variables based on the environment
if (process.env.NODE_ENV === 'production') {
    dotenv.config({ path: '.env.production' }); // Load production env variables
} else {
    dotenv.config(); // Load default .env file for development
}

const isProduction = process.env.NODE_ENV === 'production';

const pool = isProduction
  ? new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false },
    })
  : new Pool({
      user: process.env.DB_USER,
      host: process.env.DB_HOST,
      database: process.env.DB_NAME,
      password: process.env.DB_PASSWORD,
      port: process.env.DB_PORT,
    });

    export default pool; // Export the pool instance