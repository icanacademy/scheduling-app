import pool from './connection.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function runMigration(migrationFile) {
  try {
    console.log(`\n📋 Running migration: ${migrationFile}...`);

    const migrationPath = path.join(__dirname, 'migrations', migrationFile);
    const sql = fs.readFileSync(migrationPath, 'utf8');

    await pool.query(sql);

    console.log(`✅ Migration completed successfully: ${migrationFile}\n`);
  } catch (error) {
    console.error(`❌ Migration failed: ${migrationFile}`);
    console.error(error);
    throw error;
  }
}

// Run the migration
runMigration('001_add_batch_status.sql')
  .then(() => {
    console.log('🎉 All migrations completed!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('💥 Migration failed!', error);
    process.exit(1);
  });
