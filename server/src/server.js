import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import axios from 'axios';
import pool from './db/connection.js';

// Import routes
import teacherRoutes from './routes/teachers.js';
import studentRoutes from './routes/students.js';
import assignmentRoutes from './routes/assignments.js';
import timeslotRoutes from './routes/timeslots.js';
import roomRoutes from './routes/rooms.js';
import notionRoutes from './routes/notion.js';
import backupRoutes from './routes/backups.js';
import incomingBatchRoutes from './routes/incomingBatches.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Health check route
app.get('/api/health', async (req, res) => {
  try {
    await pool.query('SELECT NOW()');
    res.json({
      status: 'ok',
      message: 'Server and database are running',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: 'Database connection failed',
      error: error.message
    });
  }
});

// API Routes
app.use('/api/teachers', teacherRoutes);
app.use('/api/students', studentRoutes);
app.use('/api/assignments', assignmentRoutes);
app.use('/api/timeslots', timeslotRoutes);
app.use('/api/rooms', roomRoutes);
app.use('/api/notion', notionRoutes);
app.use('/api/backups', backupRoutes);
app.use('/api/incoming-batches', incomingBatchRoutes);

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({
    error: 'Something went wrong!',
    message: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// --- Auto-sync Days Absent from Notion ---
const SYNC_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

async function syncDaysAbsent() {
  const notionApiKey = process.env.NOTION_API_KEY;
  const notionDatabaseId = process.env.NOTION_STUDENTS_DATABASE_ID;

  if (!notionApiKey || !notionDatabaseId) return;

  try {
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

    let updated = 0;
    for (const page of response.data.results) {
      const fullName = (page.properties['Full Name']?.title?.[0]?.plain_text || '').trim();
      if (!fullName) continue;

      const daysAbsent = (page.properties['Days Absent']?.multi_select || []).map(opt => opt.name);

      const result = await pool.query(
        `UPDATE students
         SET days_absent = $1, updated_at = CURRENT_TIMESTAMP
         WHERE LOWER(name) = LOWER($2) AND is_active = true`,
        [JSON.stringify(daysAbsent), fullName]
      );
      updated += result.rowCount;
    }

    console.log(`🔄 Days Absent auto-sync: ${updated} record(s) updated from ${response.data.results.length} Notion students`);
  } catch (error) {
    console.error('⚠️ Days Absent auto-sync failed:', error.message);
  }
}

app.listen(PORT, '0.0.0.0', () => {
  const localIP = '192.168.68.106';
  console.log(`\n🚀 Server running on port ${PORT}`);
  console.log(`📍 Local: http://localhost:${PORT}/api/health`);
  console.log(`📍 Network: http://${localIP}:${PORT}/api/health\n`);

  // Run initial sync, then every 5 minutes
  syncDaysAbsent();
  setInterval(syncDaysAbsent, SYNC_INTERVAL_MS);
  console.log(`🔄 Days Absent auto-sync enabled (every ${SYNC_INTERVAL_MS / 60000} minutes)\n`);
});
