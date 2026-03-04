import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Health check
export const checkHealth = () => api.get('/health');

// Teachers
export const getTeachers = (date) => api.get('/teachers', { params: { date } });
export const getTeacherById = (id) => api.get(`/teachers/${id}`);
export const createTeacher = (data) => api.post('/teachers', data);
export const updateTeacher = (id, data) => api.put(`/teachers/${id}`, data);
export const deleteTeacher = (id) => api.delete(`/teachers/${id}`);
export const deleteAllTeachers = (date) => api.delete('/teachers/all', { data: { date } });

// Students
export const getStudents = (date) => api.get('/students', { params: { date } });
export const getAllUniqueStudents = () => api.get('/students/all-unique');
export const getStudentById = (id) => api.get(`/students/${id}`);
export const createStudent = (data) => api.post('/students', data);
export const updateStudent = (id, data) => api.put(`/students/${id}`, data);
export const deleteStudent = (id) => api.delete(`/students/${id}`);
export const deleteAllStudents = (date) => api.delete('/students/all', { data: { date } });

// Time Slots
export const getTimeSlots = () => api.get('/timeslots');

// Rooms
export const getRooms = () => api.get('/rooms');

// Assignments
export const getAssignments = (date) => api.get('/assignments', { params: { date } });
export const getAssignmentsByDateRange = (startDate, daysCount) => api.get('/assignments/date-range', { params: { startDate, daysCount } });
export const getAssignmentsByStudentId = (studentId) => api.get(`/assignments/student/${studentId}`);
export const createAssignment = (data) => api.post('/assignments', data);
export const updateAssignment = (id, data) => api.put(`/assignments/${id}`, data);
export const deleteAssignment = (id) => api.delete(`/assignments/${id}`);
export const deleteAllAssignments = (date) => api.delete('/assignments/all', { data: { date } });
export const validateAssignment = (data) => api.post('/assignments/validate', data);
export const copyDay = (data) => api.post('/assignments/copy-day', data);
export const copyWeek = (data) => api.post('/assignments/copy-week', data);

// Notion
export const previewTeachersFromNotion = (date) => api.get('/notion/preview-teachers', { params: { date } });
export const previewStudentsFromNotion = (date) => api.get('/notion/preview-students', { params: { date } });
export const importTeachersFromNotion = (data) => api.post('/notion/import-teachers', data);
export const importStudentsFromNotion = (data) => api.post('/notion/import-students', data);
export const getAllNotionStudents = () => api.get('/notion/students');
export const getNotionStudentById = (notionId) => api.get(`/notion/students/${notionId}`);
export const updateNotionStudent = (notionId, field, value) => api.patch(`/notion/students/${notionId}`, { field, value });

// Backups
export const getBackups = () => api.get('/backups');
export const createBackup = (description) => api.post('/backups/create', { description });
export const syncBackups = () => api.post('/backups/sync');
export const previewBackup = (filename) => api.get(`/backups/${filename}/preview`);
export const restoreBackup = (filename, options) => api.post(`/backups/${filename}/restore`, options);
export const downloadBackup = (filename) => api.get(`/backups/${filename}/download`, { responseType: 'blob' });
export const deleteBackup = (filename) => api.delete(`/backups/${filename}`);

// Incoming Student Batches
export const getAllIncomingBatches = () => api.get('/incoming-batches');
export const getIncomingBatchesByEntryDate = (entryDate) => api.get('/incoming-batches/by-entry-date', { params: { entryDate } });
export const getIncomingBatchesByStatus = (status) => api.get('/incoming-batches/by-status', { params: { status } });
export const getPendingReviewBatches = () => api.get('/incoming-batches/pending-review');
export const getIncomingBatchById = (id) => api.get(`/incoming-batches/${id}`);
export const createIncomingBatch = (data) => api.post('/incoming-batches', data);
export const updateIncomingBatch = (id, data) => api.put(`/incoming-batches/${id}`, data);
export const deleteIncomingBatch = (id) => api.delete(`/incoming-batches/${id}`);
export const fulfillIncomingBatch = (id) => api.put(`/incoming-batches/${id}/fulfill`);
export const archiveIncomingBatch = (id) => api.put(`/incoming-batches/${id}/archive`);
export const reactivateIncomingBatch = (id) => api.put(`/incoming-batches/${id}/reactivate`);
export const bulkArchiveIncomingBatches = (ids) => api.post('/incoming-batches/bulk-archive', { ids });
export const getIncomingBatchPrediction = (entryDate, targetDate) => api.get('/incoming-batches/prediction', { params: { entryDate, targetDate } });

export default api;
