import pool from '../db/connection.js';

const IncomingStudentBatch = {
  // Get all batches
  async getAll() {
    const result = await pool.query(
      'SELECT * FROM incoming_student_batches ORDER BY start_date ASC, created_at DESC'
    );
    return result.rows;
  },

  // Get batches by entry date (reference date)
  async getByEntryDate(entryDate) {
    const result = await pool.query(
      'SELECT * FROM incoming_student_batches WHERE entry_date = $1 ORDER BY start_date ASC',
      [entryDate]
    );
    return result.rows;
  },

  // Get batches that overlap with a specific date (only active status)
  async getActiveOnDate(date) {
    const result = await pool.query(
      `SELECT * FROM incoming_student_batches
       WHERE start_date <= $1 AND end_date >= $1 AND status = 'active'
       ORDER BY start_date ASC`,
      [date]
    );
    return result.rows;
  },

  // Get batches within a date range
  async getByDateRange(startDate, endDate) {
    const result = await pool.query(
      `SELECT * FROM incoming_student_batches
       WHERE (start_date <= $2 AND end_date >= $1)
       ORDER BY start_date ASC`,
      [startDate, endDate]
    );
    return result.rows;
  },

  // Get a single batch by ID
  async getById(id) {
    const result = await pool.query(
      'SELECT * FROM incoming_student_batches WHERE id = $1',
      [id]
    );
    return result.rows[0];
  },

  // Create a new batch
  async create(data) {
    const {
      entry_date,
      start_date,
      duration_weeks,
      end_date,
      student_count,
      teacher_count,
      time_schedule,
      time_slots,
      notes
    } = data;

    const result = await pool.query(
      `INSERT INTO incoming_student_batches
       (entry_date, start_date, duration_weeks, end_date, student_count, teacher_count, time_schedule, time_slots, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [entry_date, start_date, duration_weeks, end_date, student_count, teacher_count || 0, time_schedule, time_slots, notes]
    );

    return result.rows[0];
  },

  // Update a batch
  async update(id, data) {
    const {
      entry_date,
      start_date,
      duration_weeks,
      end_date,
      student_count,
      teacher_count,
      time_schedule,
      time_slots,
      notes
    } = data;

    const result = await pool.query(
      `UPDATE incoming_student_batches
       SET entry_date = $1, start_date = $2, duration_weeks = $3, end_date = $4,
           student_count = $5, teacher_count = $6, time_schedule = $7, time_slots = $8, notes = $9,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $10
       RETURNING *`,
      [entry_date, start_date, duration_weeks, end_date, student_count, teacher_count || 0, time_schedule, time_slots, notes, id]
    );

    return result.rows[0];
  },

  // Delete a batch
  async delete(id) {
    await pool.query('DELETE FROM incoming_student_batches WHERE id = $1', [id]);
  },

  // Get batches filtered by status
  async getAllByStatus(status) {
    const result = await pool.query(
      'SELECT * FROM incoming_student_batches WHERE status = $1 ORDER BY start_date ASC, created_at DESC',
      [status]
    );
    return result.rows;
  },

  // Mark a batch as fulfilled
  async markAsFulfilled(id) {
    const result = await pool.query(
      `UPDATE incoming_student_batches
       SET status = 'fulfilled', updated_at = CURRENT_TIMESTAMP
       WHERE id = $1
       RETURNING *`,
      [id]
    );
    return result.rows[0];
  },

  // Mark a batch as archived
  async markAsArchived(id) {
    const result = await pool.query(
      `UPDATE incoming_student_batches
       SET status = 'archived', updated_at = CURRENT_TIMESTAMP
       WHERE id = $1
       RETURNING *`,
      [id]
    );
    return result.rows[0];
  },

  // Reactivate a batch (set status back to active)
  async reactivate(id) {
    const result = await pool.query(
      `UPDATE incoming_student_batches
       SET status = 'active', updated_at = CURRENT_TIMESTAMP
       WHERE id = $1
       RETURNING *`,
      [id]
    );
    return result.rows[0];
  },

  // Bulk archive multiple batches
  async bulkArchive(ids) {
    const result = await pool.query(
      `UPDATE incoming_student_batches
       SET status = 'archived', updated_at = CURRENT_TIMESTAMP
       WHERE id = ANY($1)
       RETURNING *`,
      [ids]
    );
    return result.rows;
  },

  // Get batches that should be reviewed (active batches where start_date has passed)
  async getPendingReview(currentDate) {
    const result = await pool.query(
      `SELECT * FROM incoming_student_batches
       WHERE status = 'active' AND start_date <= $1
       ORDER BY start_date ASC`,
      [currentDate]
    );
    return result.rows;
  },

  // Auto-detect and mark batches as fulfilled
  // Returns array of batch IDs that were marked as fulfilled
  async autoDetectFulfilled(targetDate, hasActualData) {
    if (!hasActualData) {
      return []; // Don't mark as fulfilled if no actual data exists
    }

    // Only auto-fulfill batches where:
    // 1. start_date has passed (start_date <= targetDate)
    // 2. targetDate has actual data (meaning people actually showed up)
    // 3. The targetDate is >= start_date (we're looking at a date on or after the batch started)
    //
    // This ensures batches are only fulfilled when you actually have data for dates
    // on or after their start date, not just when viewing future dates on the calendar
    const result = await pool.query(
      `UPDATE incoming_student_batches
       SET status = 'fulfilled', updated_at = CURRENT_TIMESTAMP
       WHERE status = 'active'
         AND start_date <= $1
         AND start_date <= CURRENT_DATE
       RETURNING id`,
      [targetDate]
    );

    return result.rows.map(row => row.id);
  },

  // Calculate predictions for a target date based on entry date
  async calculatePrediction(entryDate, targetDate) {
    // Get batches that will be active on the target date
    const activeBatches = await this.getActiveOnDate(targetDate);

    // Calculate total students and teachers by time slot
    const studentsBySlot = {};
    const teachersBySlot = {};

    activeBatches.forEach(batch => {
      const timeSlots = batch.time_slots || [];
      timeSlots.forEach(slotId => {
        studentsBySlot[slotId] = (studentsBySlot[slotId] || 0) + batch.student_count;
        teachersBySlot[slotId] = (teachersBySlot[slotId] || 0) + (batch.teacher_count || 0);
      });
    });

    return {
      activeBatches,
      studentsBySlot,
      teachersBySlot,
      totalIncomingStudents: activeBatches.reduce((sum, b) => sum + b.student_count, 0),
      totalIncomingTeachers: activeBatches.reduce((sum, b) => sum + (b.teacher_count || 0), 0)
    };
  }
};

export default IncomingStudentBatch;
