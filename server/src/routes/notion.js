import express from 'express';
import {
  importTeachersFromNotion,
  importStudentsFromNotion,
  previewTeachersFromNotion,
  previewStudentsFromNotion,
  getAllNotionStudents,
  getNotionStudentById,
  updateNotionStudent
} from '../controllers/notionController.js';

const router = express.Router();

router.get('/preview-teachers', previewTeachersFromNotion);
router.get('/preview-students', previewStudentsFromNotion);
router.post('/import-teachers', importTeachersFromNotion);
router.post('/import-students', importStudentsFromNotion);

// New endpoints for Student Schedule Sheet
router.get('/students', getAllNotionStudents);
router.get('/students/:notionId', getNotionStudentById);
router.patch('/students/:notionId', updateNotionStudent);

export default router;
