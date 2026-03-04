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
    console.log('Starting migration: Add days_absent to students table...');

    // Add days_absent column - JSONB array of day names when student is absent
    // e.g., ["Monday", "Wednesday"] means student doesn't come on Mon/Wed
    await client.query(`
      ALTER TABLE students
      ADD COLUMN IF NOT EXISTS days_absent JSONB DEFAULT '[]'
    `);

    console.log('✅ Added days_absent column to students table');
    console.log('   Format: ["Monday", "Wednesday", "Friday"]');
    console.log('   Synced from Notion "Days Absent" multi-select');
    console.log('   All existing students default to [] (no absent days)');

  } catch (error) {
    console.error('Migration failed:', error.message);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

migrate()
  .then(() => {
    console.log('\n✅ Migration completed successfully!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Migration failed:', error);
    process.exit(1);
  });
