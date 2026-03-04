import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

const notionApiKey = process.env.NOTION_API_KEY;
const studentsDatabaseId = process.env.NOTION_STUDENTS_DATABASE_ID;
const teachersDatabaseId = process.env.NOTION_TEACHERS_DATABASE_ID;

console.log('\n===========================================');
console.log('NOTION DATABASE SCHEMA CHECKER');
console.log('===========================================\n');

async function fetchDatabaseSchema(databaseId, name) {
  try {
    console.log(`\n📋 Fetching ${name} Database Schema...\n`);

    const response = await axios.get(
      `https://api.notion.com/v1/databases/${databaseId}`,
      {
        headers: {
          'Authorization': `Bearer ${notionApiKey}`,
          'Notion-Version': '2022-06-28',
        }
      }
    );

    const properties = response.data.properties;

    console.log(`✅ Found ${Object.keys(properties).length} properties:\n`);
    console.log('===========================================');

    Object.entries(properties).forEach(([name, prop]) => {
      console.log(`\n📌 Property: "${name}"`);
      console.log(`   Type: ${prop.type}`);

      // Show additional details for specific types
      if (prop.type === 'select' && prop.select?.options) {
        console.log(`   Options: ${prop.select.options.map(o => o.name).join(', ')}`);
      }
      if (prop.type === 'multi_select' && prop.multi_select?.options) {
        console.log(`   Options: ${prop.multi_select.options.map(o => o.name).join(', ')}`);
      }
      if (prop.type === 'number' && prop.number?.format) {
        console.log(`   Format: ${prop.number.format}`);
      }
    });

    console.log('\n===========================================\n');

    return properties;

  } catch (error) {
    console.error(`❌ Error fetching ${name} database:`, error.message);
    if (error.response?.data) {
      console.error('Error details:', error.response.data);
    }
  }
}

async function fetchSampleRecord(databaseId, name) {
  try {
    console.log(`\n📄 Fetching Sample Record from ${name}...\n`);

    const response = await axios.post(
      `https://api.notion.com/v1/databases/${databaseId}/query`,
      {
        page_size: 1
      },
      {
        headers: {
          'Authorization': `Bearer ${notionApiKey}`,
          'Notion-Version': '2022-06-28',
          'Content-Type': 'application/json'
        }
      }
    );

    if (response.data.results.length > 0) {
      const record = response.data.results[0];
      console.log('Sample Record Properties:');
      console.log('===========================================\n');

      Object.entries(record.properties).forEach(([name, prop]) => {
        let value = 'N/A';

        // Extract value based on type
        if (prop.type === 'title' && prop.title?.[0]?.plain_text) {
          value = prop.title[0].plain_text;
        } else if (prop.type === 'rich_text' && prop.rich_text?.[0]?.plain_text) {
          value = prop.rich_text[0].plain_text;
        } else if (prop.type === 'select' && prop.select?.name) {
          value = prop.select.name;
        } else if (prop.type === 'multi_select' && prop.multi_select) {
          value = prop.multi_select.map(s => s.name).join(', ');
        } else if (prop.type === 'number' && prop.number !== null) {
          value = prop.number;
        } else if (prop.type === 'checkbox') {
          value = prop.checkbox;
        } else if (prop.type === 'date' && prop.date) {
          value = prop.date.start;
        }

        console.log(`${name}: ${value}`);
      });

      console.log('\n===========================================\n');
    } else {
      console.log('No records found in this database.\n');
    }

  } catch (error) {
    console.error(`❌ Error fetching sample from ${name}:`, error.message);
  }
}

async function main() {
  if (!notionApiKey) {
    console.error('❌ NOTION_API_KEY not found in .env file');
    return;
  }

  if (!studentsDatabaseId || !teachersDatabaseId) {
    console.error('❌ Database IDs not found in .env file');
    return;
  }

  // Fetch Students Database
  await fetchDatabaseSchema(studentsDatabaseId, 'STUDENTS');
  await fetchSampleRecord(studentsDatabaseId, 'STUDENTS');

  // Fetch Teachers Database
  await fetchDatabaseSchema(teachersDatabaseId, 'TEACHERS');
  await fetchSampleRecord(teachersDatabaseId, 'TEACHERS');

  console.log('\n✅ Schema check complete!\n');
}

main();
