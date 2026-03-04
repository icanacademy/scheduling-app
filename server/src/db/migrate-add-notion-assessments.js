import pkg from 'pg';
const { Pool } = pkg;
import dotenv from 'dotenv';

dotenv.config();

const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
});

async function migrate() {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    console.log('Adding Notion assessment fields to students table...');

    // Add new columns for Notion assessment data
    await client.query(`
      ALTER TABLE students
      ADD COLUMN IF NOT EXISTS interview_score INTEGER,
      ADD COLUMN IF NOT EXISTS level_test_total TEXT,
      ADD COLUMN IF NOT EXISTS grammar_score TEXT,
      ADD COLUMN IF NOT EXISTS reading_score TEXT,
      ADD COLUMN IF NOT EXISTS writing_score TEXT,
      ADD COLUMN IF NOT EXISTS listening_score TEXT,
      ADD COLUMN IF NOT EXISTS wpm_initial TEXT,
      ADD COLUMN IF NOT EXISTS gbwt_initial TEXT,
      ADD COLUMN IF NOT EXISTS reading_level_initial TEXT,
      ADD COLUMN IF NOT EXISTS grade INTEGER,
      ADD COLUMN IF NOT EXISTS gender TEXT,
      ADD COLUMN IF NOT EXISTS student_type TEXT
    `);

    await client.query('COMMIT');
    console.log('✅ Migration completed successfully!');
    console.log('Added columns: interview_score, level_test_total, grammar_score, reading_score, writing_score, listening_score, wpm_initial, gbwt_initial, reading_level_initial, grade, gender, student_type');

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Migration failed:', error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

migrate().catch(console.error);
