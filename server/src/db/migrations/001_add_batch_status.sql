-- Migration: Add status column to incoming_student_batches table
-- Date: 2025-01-25
-- Purpose: Enable auto-archiving of batches that have been fulfilled

-- Add status column with ENUM type
DO $$
BEGIN
    -- Create the status type if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'batch_status') THEN
        CREATE TYPE batch_status AS ENUM ('active', 'fulfilled', 'archived');
    END IF;
END $$;

-- Add the status column with default 'active'
ALTER TABLE incoming_student_batches
ADD COLUMN IF NOT EXISTS status batch_status DEFAULT 'active';

-- Create index on status for faster filtering
CREATE INDEX IF NOT EXISTS idx_incoming_batches_status
ON incoming_student_batches(status);

-- Set all existing batches to 'active' status
UPDATE incoming_student_batches
SET status = 'active'
WHERE status IS NULL;

-- Add comment for documentation
COMMENT ON COLUMN incoming_student_batches.status IS
'Batch status: active (counted in predictions), fulfilled (date passed + actual data exists), archived (manually archived)';
