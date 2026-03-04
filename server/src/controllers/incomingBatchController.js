import IncomingStudentBatch from '../models/IncomingStudentBatch.js';
import Teacher from '../models/Teacher.js';
import Student from '../models/Student.js';
import Assignment from '../models/Assignment.js';
import pool from '../db/connection.js';

// Get all batches
export const getAllBatches = async (req, res) => {
  try {
    const batches = await IncomingStudentBatch.getAll();
    res.json(batches);
  } catch (error) {
    console.error('Error fetching batches:', error);
    res.status(500).json({ error: 'Failed to fetch batches' });
  }
};

// Get batches by entry date
export const getBatchesByEntryDate = async (req, res) => {
  try {
    const { entryDate } = req.query;
    if (!entryDate) {
      return res.status(400).json({ error: 'Entry date is required' });
    }

    const batches = await IncomingStudentBatch.getByEntryDate(entryDate);
    res.json(batches);
  } catch (error) {
    console.error('Error fetching batches by entry date:', error);
    res.status(500).json({ error: 'Failed to fetch batches' });
  }
};

// Get a single batch
export const getBatchById = async (req, res) => {
  try {
    const { id } = req.params;
    const batch = await IncomingStudentBatch.getById(id);

    if (!batch) {
      return res.status(404).json({ error: 'Batch not found' });
    }

    res.json(batch);
  } catch (error) {
    console.error('Error fetching batch:', error);
    res.status(500).json({ error: 'Failed to fetch batch' });
  }
};

// Create a new batch
export const createBatch = async (req, res) => {
  try {
    const {
      entry_date,
      start_date,
      duration_weeks,
      student_count,
      teacher_count,
      time_schedule,
      time_slots,
      notes
    } = req.body;

    // Validate required fields
    if (!entry_date || !start_date || !duration_weeks || !time_schedule || !time_slots) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Validate that at least student_count or teacher_count is provided and > 0
    if ((student_count === undefined || student_count === null) && (teacher_count === undefined || teacher_count === null)) {
      return res.status(400).json({ error: 'Either student_count or teacher_count must be provided' });
    }

    if ((student_count || 0) === 0 && (teacher_count || 0) === 0) {
      return res.status(400).json({ error: 'At least one of student_count or teacher_count must be greater than 0' });
    }

    // Calculate end_date based on start_date + duration_weeks
    const startDate = new Date(start_date + 'T00:00:00');
    const endDate = new Date(startDate);
    endDate.setDate(startDate.getDate() + (duration_weeks * 7));

    const batchData = {
      entry_date,
      start_date,
      duration_weeks,
      end_date: endDate.toISOString().split('T')[0],
      student_count,
      teacher_count: teacher_count || 0,
      time_schedule,
      time_slots: JSON.stringify(time_slots),
      notes: notes || null
    };

    const newBatch = await IncomingStudentBatch.create(batchData);
    res.status(201).json(newBatch);
  } catch (error) {
    console.error('Error creating batch:', error);
    res.status(500).json({ error: 'Failed to create batch' });
  }
};

// Update a batch
export const updateBatch = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      entry_date,
      start_date,
      duration_weeks,
      student_count,
      teacher_count,
      time_schedule,
      time_slots,
      notes
    } = req.body;

    // Validate required fields
    if (!entry_date || !start_date || !duration_weeks || !time_schedule || !time_slots) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Validate that at least student_count or teacher_count is provided and > 0
    if ((student_count === undefined || student_count === null) && (teacher_count === undefined || teacher_count === null)) {
      return res.status(400).json({ error: 'Either student_count or teacher_count must be provided' });
    }

    if ((student_count || 0) === 0 && (teacher_count || 0) === 0) {
      return res.status(400).json({ error: 'At least one of student_count or teacher_count must be greater than 0' });
    }

    // Calculate end_date
    const startDate = new Date(start_date + 'T00:00:00');
    const endDate = new Date(startDate);
    endDate.setDate(startDate.getDate() + (duration_weeks * 7));

    const batchData = {
      entry_date,
      start_date,
      duration_weeks,
      end_date: endDate.toISOString().split('T')[0],
      student_count,
      teacher_count: teacher_count || 0,
      time_schedule,
      time_slots: JSON.stringify(time_slots),
      notes: notes || null
    };

    const updatedBatch = await IncomingStudentBatch.update(id, batchData);

    if (!updatedBatch) {
      return res.status(404).json({ error: 'Batch not found' });
    }

    res.json(updatedBatch);
  } catch (error) {
    console.error('Error updating batch:', error);
    res.status(500).json({ error: 'Failed to update batch' });
  }
};

// Delete a batch
export const deleteBatch = async (req, res) => {
  try {
    const { id } = req.params;
    await IncomingStudentBatch.delete(id);
    res.json({ message: 'Batch deleted successfully' });
  } catch (error) {
    console.error('Error deleting batch:', error);
    res.status(500).json({ error: 'Failed to delete batch' });
  }
};

// Get prediction for a target date based on entry date
export const getPrediction = async (req, res) => {
  try {
    const { entryDate, targetDate } = req.query;

    if (!entryDate || !targetDate) {
      return res.status(400).json({ error: 'Entry date and target date are required' });
    }

    // Check if target date is before entry date (reference date)
    const isBeforeReference = targetDate < entryDate;

    // Get today's date for comparison
    const today = new Date().toISOString().split('T')[0];
    const isFutureDate = targetDate > today;

    // Get entry date data (reference)
    const entryTeachers = await Teacher.getAll(entryDate);
    const entryStudents = await Student.getAll(entryDate);
    const entryAssignments = await Assignment.getByDate(entryDate);

    // Get target date data
    let targetStudents = await Student.getAll(targetDate);
    let targetTeachers = await Teacher.getAll(targetDate);
    let targetAssignments = await Assignment.getByDate(targetDate);

    // For future dates, ignore actual data and always use prediction mode
    // For past/current dates, use actual data if it exists
    const targetHasData = isFutureDate ? false : (targetStudents.length > 0 || targetTeachers.length > 0 || targetAssignments.length > 0);
    let actualDataDate = targetDate;

    console.log(`[${targetDate}] targetHasData:`, targetHasData, `(students: ${targetStudents.length}, teachers: ${targetTeachers.length}, assignments: ${targetAssignments.length})`);

    // AUTO-DETECT FULFILLED BATCHES
    // If target date has actual data, check if any active batches should be marked as fulfilled
    if (targetHasData) {
      const fulfilledBatchIds = await IncomingStudentBatch.autoDetectFulfilled(targetDate, true);
      if (fulfilledBatchIds.length > 0) {
        console.log(`[${targetDate}] Auto-fulfilled ${fulfilledBatchIds.length} batches:`, fulfilledBatchIds);
      }
    }

    if (!targetHasData) {
      // Find most recent date with data before target date
      const recentDataQuery = await pool.query(
        `SELECT DISTINCT date
         FROM students
         WHERE date <= $1 AND date >= $2 AND is_active = true
         ORDER BY date DESC
         LIMIT 1`,
        [targetDate, entryDate]
      );

      if (recentDataQuery.rows.length > 0) {
        actualDataDate = recentDataQuery.rows[0].date;
        targetStudents = await Student.getAll(actualDataDate);
        targetTeachers = await Teacher.getAll(actualDataDate);
        targetAssignments = await Assignment.getByDate(actualDataDate);
      } else {
        // No data found between entry and target, use entry date
        actualDataDate = entryDate;
        targetStudents = entryStudents;
        targetTeachers = entryTeachers;
        targetAssignments = entryAssignments;
      }
    }

    // Get incoming batches active on actual data date (use fallback date if target has no data)
    // Don't calculate incoming batches for dates before reference
    const prediction = isBeforeReference
      ? { studentsBySlot: {}, teachersBySlot: {}, activeBatches: [], totalIncomingStudents: 0, totalIncomingTeachers: 0 }
      : await IncomingStudentBatch.calculatePrediction(entryDate, actualDataDate);

    // Calculate actual hiring need for a time slot (works for both past and future dates)
    const calculateActualStatsForSlot = (timeSlotId, students, teachers, assignments) => {
      const slotAssignments = assignments.filter(a => a.time_slot_id === timeSlotId);

      const assignedTeacherIds = new Set();
      slotAssignments.forEach(assignment => {
        assignment.teachers?.forEach(t => assignedTeacherIds.add(t.id));
      });

      const teachersWithAvailability = teachers.filter(t =>
        t.availability && t.availability.includes(timeSlotId)
      );

      const availableTeachers = teachersWithAvailability.filter(
        t => !assignedTeacherIds.has(t.id)
      ).length;

      const studentsPaired = new Set();
      slotAssignments.forEach(assignment => {
        const hasValidTeacher = assignment.teachers && assignment.teachers.length > 0;
        if (hasValidTeacher) {
          assignment.students?.forEach(s => studentsPaired.add(s.id));
        }
      });

      const studentsWithAvailability = students.filter(s =>
        s.availability && s.availability.includes(timeSlotId)
      );

      const studentsUnpaired = studentsWithAvailability.filter(
        s => !studentsPaired.has(s.id)
      ).length;

      const buffer = timeSlotId >= 9 ? 1 : 4;
      const need = studentsUnpaired - availableTeachers + buffer;

      return {
        totalStudents: studentsWithAvailability.length,
        availableTeachers,
        buffer,
        need,
        studentsWithoutTeachers: studentsUnpaired,
        incomingStudents: 0,
        incomingTeachers: 0,
        alreadyArrived: {
          students: 0,
          teachers: 0
        }
      };
    };

    // PROJECT from ENTRY DATE with incoming students/teachers
    const calculateProjectedStatsForSlot = (timeSlotId) => {
      // --- ENTRY DATE BASELINE ---
      const entrySlotAssignments = entryAssignments.filter(a => a.time_slot_id === timeSlotId);

      const entryAssignedTeacherIds = new Set();
      entrySlotAssignments.forEach(assignment => {
        assignment.teachers?.forEach(t => entryAssignedTeacherIds.add(t.id));
      });

      const entryTeachersWithAvailability = entryTeachers.filter(t =>
        t.availability && t.availability.includes(timeSlotId)
      );

      // Available teachers on entry date (baseline)
      const entryAvailableTeachers = entryTeachersWithAvailability.filter(
        t => !entryAssignedTeacherIds.has(t.id)
      ).length;

      const entryStudentsPaired = new Set();
      entrySlotAssignments.forEach(assignment => {
        const hasValidTeacher = assignment.teachers && assignment.teachers.length > 0;
        if (hasValidTeacher) {
          assignment.students?.forEach(s => entryStudentsPaired.add(s.id));
        }
      });

      const entryStudentsWithAvailability = entryStudents.filter(s =>
        s.availability && s.availability.includes(timeSlotId)
      );

      const entryStudentsUnpaired = entryStudentsWithAvailability.filter(
        s => !entryStudentsPaired.has(s.id)
      ).length;

      // --- CHECK TARGET DATE ACTUAL DATA ---
      // If target date already has data, use actual counts instead of projection
      const targetStudentsWithAvailability = targetStudents.filter(s =>
        s.availability && s.availability.includes(timeSlotId)
      );

      const targetTeachersWithAvailability = targetTeachers.filter(t =>
        t.availability && t.availability.includes(timeSlotId)
      );

      const targetSlotAssignments = targetAssignments.filter(a => a.time_slot_id === timeSlotId);

      const targetAssignedTeacherIds = new Set();
      targetSlotAssignments.forEach(assignment => {
        assignment.teachers?.forEach(t => targetAssignedTeacherIds.add(t.id));
      });

      const targetAvailableTeachers = targetTeachersWithAvailability.filter(
        t => !targetAssignedTeacherIds.has(t.id)
      ).length;

      const targetStudentsPaired = new Set();
      targetSlotAssignments.forEach(assignment => {
        const hasValidTeacher = assignment.teachers && assignment.teachers.length > 0;
        if (hasValidTeacher) {
          assignment.students?.forEach(s => targetStudentsPaired.add(s.id));
        }
      });

      const targetStudentsUnpaired = targetStudentsWithAvailability.filter(
        s => !targetStudentsPaired.has(s.id)
      ).length;

      // --- CALCULATE INCOMING (what's not yet in target) ---
      const incomingStudentsFromBatch = prediction.studentsBySlot[timeSlotId] || 0;
      const incomingTeachersFromBatch = prediction.teachersBySlot[timeSlotId] || 0;

      // Calculate how many students/teachers have actually arrived
      const actualNewStudents = Math.max(0, targetStudentsWithAvailability.length - entryStudentsWithAvailability.length);
      const actualNewTeachers = Math.max(0, targetTeachersWithAvailability.length - entryTeachersWithAvailability.length);

      // Incoming that haven't arrived yet = predicted incoming - actual new arrivals
      const pendingIncomingStudents = Math.max(0, incomingStudentsFromBatch - actualNewStudents);
      const pendingIncomingTeachers = Math.max(0, incomingTeachersFromBatch - actualNewTeachers);

      // --- FINAL PROJECTION ---
      // Use target date actuals + pending incoming
      const projectedAvailableTeachers = targetAvailableTeachers + pendingIncomingTeachers;
      const projectedStudentsUnpaired = targetStudentsUnpaired + pendingIncomingStudents;
      const totalStudents = targetStudentsWithAvailability.length + pendingIncomingStudents;

      // Buffer
      const buffer = timeSlotId >= 9 ? 1 : 4;

      // Projected need (absolute)
      const projectedHiringNeed = projectedStudentsUnpaired - projectedAvailableTeachers + buffer;

      // Baseline need (from entry date) - kept for comparison
      const baselineHiringNeed = entryStudentsUnpaired - entryAvailableTeachers + buffer;

      return {
        totalStudents,
        availableTeachers: projectedAvailableTeachers,
        buffer,
        need: projectedHiringNeed, // ABSOLUTE need (not clamped to 0, can be negative)
        baselineNeed: baselineHiringNeed, // For reference
        studentsWithoutTeachers: projectedStudentsUnpaired,
        incomingStudents: pendingIncomingStudents,
        incomingTeachers: pendingIncomingTeachers,
        alreadyArrived: {
          students: actualNewStudents,
          teachers: actualNewTeachers
        }
      };
    };

    // Calculate baseline (entry date) hiring needs using same logic
    const calculateBaselineStatsForSlot = (timeSlotId) => {
      const entrySlotAssignments = entryAssignments.filter(a => a.time_slot_id === timeSlotId);

      const entryAssignedTeacherIds = new Set();
      entrySlotAssignments.forEach(assignment => {
        assignment.teachers?.forEach(t => entryAssignedTeacherIds.add(t.id));
      });

      const entryTeachersWithAvailability = entryTeachers.filter(t =>
        t.availability && t.availability.includes(timeSlotId)
      );

      const entryAvailableTeachers = entryTeachersWithAvailability.filter(
        t => !entryAssignedTeacherIds.has(t.id)
      ).length;

      // Get entry date students (already loaded above)
      const entryStudentsWithAvailability = entryStudents.filter(s =>
        s.availability && s.availability.includes(timeSlotId)
      );

      const entryStudentsPaired = new Set();
      entrySlotAssignments.forEach(assignment => {
        const hasValidTeacher = assignment.teachers && assignment.teachers.length > 0;
        if (hasValidTeacher) {
          assignment.students?.forEach(s => entryStudentsPaired.add(s.id));
        }
      });

      const entryStudentsUnpaired = entryStudentsWithAvailability.filter(
        s => !entryStudentsPaired.has(s.id)
      ).length;

      const buffer = timeSlotId >= 9 ? 1 : 4;
      const entryHiringNeed = entryStudentsUnpaired - entryAvailableTeachers + buffer;

      return entryHiringNeed;
    };

    // Calculate for all relevant time slots
    const allSlots = new Set([
      ...Object.keys(prediction.studentsBySlot).map(Number),
      ...[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] // All time slots
    ]);

    const hiringNeedsBySlot = {};
    allSlots.forEach(slotId => {
      let projectedStats;

      if (targetHasData) {
        // If target date has actual data, just calculate based on actual data (no projection needed)
        projectedStats = calculateActualStatsForSlot(slotId, targetStudents, targetTeachers, targetAssignments);
      } else {
        // If target date has no data, use projection logic with incoming batches
        projectedStats = calculateProjectedStatsForSlot(slotId);
      }

      const baselineNeed = calculateBaselineStatsForSlot(slotId);

      hiringNeedsBySlot[slotId] = {
        ...projectedStats,
        baselineNeed
      };
    });

    // Calculate summary using absolute need
    // maxNeed can be negative (surplus), zero (balanced), or positive (deficit)
    const needValues = Object.values(hiringNeedsBySlot).map(s => s.need);
    const maxNeed = Math.max(...needValues);
    const minNeed = Math.min(...needValues);
    const avgNeed = needValues.reduce((sum, n) => sum + n, 0) / allSlots.size;

    res.json({
      entryDate,
      targetDate,
      actualDataDate, // The date whose data is actually being used
      targetHasData, // Flag to indicate if target date has actual data or is using fallback
      entryData: {
        teachers: entryTeachers.length,
        students: entryStudents.length
      },
      targetData: {
        currentStudents: targetStudents.length,
        incomingStudents: prediction.totalIncomingStudents,
        totalStudents: targetStudents.length + prediction.totalIncomingStudents,
        usingFallbackData: !targetHasData, // Explicit flag for UI
        fallbackDate: !targetHasData ? actualDataDate : null // Show which date we fell back to
      },
      activeBatches: prediction.activeBatches,
      hiringNeedsBySlot,
      summary: {
        maxNeed,
        minNeed,
        avgNeed: parseFloat(avgNeed.toFixed(1)),
        recommendedHireDate: calculateHireDate(targetDate)
      }
    });
  } catch (error) {
    console.error('Error calculating prediction:', error);
    res.status(500).json({ error: 'Failed to calculate prediction' });
  }
};

// Helper function to calculate recommended hire date (2 weeks before target)
function calculateHireDate(targetDateStr) {
  const targetDate = new Date(targetDateStr + 'T00:00:00');
  const hireDate = new Date(targetDate);
  hireDate.setDate(targetDate.getDate() - 14); // 2 weeks before
  return hireDate.toISOString().split('T')[0];
}

// Mark a batch as fulfilled
export const fulfillBatch = async (req, res) => {
  try {
    const { id } = req.params;
    const batch = await IncomingStudentBatch.markAsFulfilled(id);

    if (!batch) {
      return res.status(404).json({ error: 'Batch not found' });
    }

    res.json(batch);
  } catch (error) {
    console.error('Error fulfilling batch:', error);
    res.status(500).json({ error: 'Failed to fulfill batch' });
  }
};

// Mark a batch as archived
export const archiveBatch = async (req, res) => {
  try {
    const { id } = req.params;
    const batch = await IncomingStudentBatch.markAsArchived(id);

    if (!batch) {
      return res.status(404).json({ error: 'Batch not found' });
    }

    res.json(batch);
  } catch (error) {
    console.error('Error archiving batch:', error);
    res.status(500).json({ error: 'Failed to archive batch' });
  }
};

// Reactivate a batch
export const reactivateBatch = async (req, res) => {
  try {
    const { id } = req.params;
    const batch = await IncomingStudentBatch.reactivate(id);

    if (!batch) {
      return res.status(404).json({ error: 'Batch not found' });
    }

    res.json(batch);
  } catch (error) {
    console.error('Error reactivating batch:', error);
    res.status(500).json({ error: 'Failed to reactivate batch' });
  }
};

// Bulk archive batches
export const bulkArchiveBatches = async (req, res) => {
  try {
    const { ids } = req.body;

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: 'Batch IDs array is required' });
    }

    const batches = await IncomingStudentBatch.bulkArchive(ids);
    res.json(batches);
  } catch (error) {
    console.error('Error bulk archiving batches:', error);
    res.status(500).json({ error: 'Failed to bulk archive batches' });
  }
};

// Get batches pending review (active batches where start_date has passed)
export const getPendingReviewBatches = async (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    const batches = await IncomingStudentBatch.getPendingReview(today);
    res.json(batches);
  } catch (error) {
    console.error('Error fetching pending review batches:', error);
    res.status(500).json({ error: 'Failed to fetch pending review batches' });
  }
};

// Get batches by status
export const getBatchesByStatus = async (req, res) => {
  try {
    const { status } = req.query;

    if (!status) {
      return res.status(400).json({ error: 'Status parameter is required' });
    }

    if (!['active', 'fulfilled', 'archived'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status. Must be active, fulfilled, or archived' });
    }

    const batches = await IncomingStudentBatch.getAllByStatus(status);
    res.json(batches);
  } catch (error) {
    console.error('Error fetching batches by status:', error);
    res.status(500).json({ error: 'Failed to fetch batches by status' });
  }
};
