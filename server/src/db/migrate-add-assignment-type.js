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
    console.log('Starting migration: Add assignment_type to assignments table...');

    // Add assignment_type column with default 'class'
    // This allows teachers to be assigned as ONLINE CLASS or TASK instead of having students
    await client.query(`
      ALTER TABLE assignments
      ADD COLUMN IF NOT EXISTS assignment_type VARCHAR(20) DEFAULT 'class'
    `);

    console.log('✅ Added assignment_type column to assignments table');
    console.log('   Values: class (default), online, task');
    console.log('   All existing assignments default to "class"');

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
