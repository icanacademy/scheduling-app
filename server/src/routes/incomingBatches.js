import express from 'express';
import {
  getAllBatches,
  getBatchesByEntryDate,
  getBatchById,
  createBatch,
  updateBatch,
  deleteBatch,
  getPrediction,
  fulfillBatch,
  archiveBatch,
  reactivateBatch,
  bulkArchiveBatches,
  getPendingReviewBatches,
  getBatchesByStatus
} from '../controllers/incomingBatchController.js';

const router = express.Router();

// Get all batches
router.get('/', getAllBatches);

// Get batches by entry date
router.get('/by-entry-date', getBatchesByEntryDate);

// Get batches by status
router.get('/by-status', getBatchesByStatus);

// Get batches pending review
router.get('/pending-review', getPendingReviewBatches);

// Get prediction for a target date
router.get('/prediction', getPrediction);

// Bulk archive batches
router.post('/bulk-archive', bulkArchiveBatches);

// Get a single batch
router.get('/:id', getBatchById);

// Create a new batch
router.post('/', createBatch);

// Update a batch
router.put('/:id', updateBatch);

// Mark batch as fulfilled
router.put('/:id/fulfill', fulfillBatch);

// Mark batch as archived
router.put('/:id/archive', archiveBatch);

// Reactivate a batch
router.put('/:id/reactivate', reactivateBatch);

// Delete a batch
router.delete('/:id', deleteBatch);

export default router;
