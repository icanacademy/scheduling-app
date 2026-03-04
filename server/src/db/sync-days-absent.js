import pkg from 'pg';
const { Pool } = pkg;
import dotenv from 'dotenv';
import axios from 'axios';

dotenv.config();

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'scheduling_db',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
});

async function syncDaysAbsent() {
  const notionApiKey = process.env.NOTION_API_KEY;
  const notionDatabaseId = process.env.NOTION_STUDENTS_DATABASE_ID;

  if (!notionApiKey || !notionDatabaseId) {
    console.error('❌ Notion API credentials not configured in .env');
    process.exit(1);
  }

  console.log('🔄 Syncing Days Absent from Notion to scheduling database...\n');

  // Query all active students from Notion
  const response = await axios.post(
    `https://api.notion.com/v1/databases/${notionDatabaseId}/query`,
    {
      filter: {
        property: 'Status',
        select: { equals: 'Active' }
      }
    },
    {
      headers: {
        'Authorization': `Bearer ${notionApiKey}`,
        'Notion-Version': '2022-06-28',
        'Content-Type': 'application/json'
      }
    }
  );

  const notionStudents = response.data.results;
  console.log(`📋 Found ${notionStudents.length} active students in Notion\n`);

  let updated = 0;
  let skipped = 0;

  for (const page of notionStudents) {
    const fullName = (page.properties['Full Name']?.title?.[0]?.plain_text || '').trim();
    if (!fullName) continue;

    // Extract Days Absent multi-select
    const daysAbsent = (page.properties['Days Absent']?.multi_select || []).map(opt => opt.name);

    // Update ALL matching student records in DB (across all dates) - ONLY the days_absent field
    const result = await pool.query(
      `UPDATE students
       SET days_absent = $1, updated_at = CURRENT_TIMESTAMP
       WHERE LOWER(name) = LOWER($2) AND is_active = true`,
      [JSON.stringify(daysAbsent), fullName]
    );

    if (result.rowCount > 0) {
      const label = daysAbsent.length > 0 ? daysAbsent.join(', ') : '(none)';
      console.log(`  ✅ ${fullName} → Days Absent: ${label} (${result.rowCount} record(s) updated)`);
      updated += result.rowCount;
    } else {
      skipped++;
    }
  }

  console.log(`\n✅ Sync complete: ${updated} student record(s) updated, ${skipped} Notion students not found in DB`);
}

syncDaysAbsent()
  .then(() => {
    pool.end();
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Sync failed:', error.message);
    pool.end();
    process.exit(1);
  });
