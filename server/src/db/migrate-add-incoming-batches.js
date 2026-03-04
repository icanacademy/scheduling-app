import pkg from 'pg';
const { Pool } = pkg;
import dotenv from 'dotenv';

dotenv.config();

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'scheduling_db',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
});

async function migrate() {
  const client = await pool.connect();

  try {
    console.log('Starting migration: Add incoming_student_batches table...');

    // Create incoming_student_batches table
    await client.query(`
      CREATE TABLE IF NOT EXISTS incoming_student_batches (
        id SERIAL PRIMARY KEY,
        entry_date DATE NOT NULL,
        start_date DATE NOT NULL,
        duration_weeks INTEGER NOT NULL CHECK (duration_weeks > 0),
        end_date DATE NOT NULL,
        student_count INTEGER NOT NULL CHECK (student_count > 0),
        time_schedule VARCHAR(50) NOT NULL,
        time_slots JSONB NOT NULL DEFAULT '[]',
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    console.log('✓ Created incoming_student_batches table');

    // Create index on dates for faster queries
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_incoming_batches_entry_date
      ON incoming_student_batches(entry_date);
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_incoming_batches_start_date
      ON incoming_student_batches(start_date);
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_incoming_batches_date_range
      ON incoming_student_batches(start_date, end_date);
    `);

    console.log('✓ Created indexes on incoming_student_batches');

    console.log('Migration completed successfully!');
  } catch (error) {
    console.error('Migration failed:', error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

migrate();
