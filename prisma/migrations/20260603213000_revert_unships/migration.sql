-- Revert ship now UNSHIPS: the submission moves to a terminal 'reverted' status
-- instead of returning to the queue. Not an open status, so the project
-- (external_id) becomes shippable again; the program is notified via the
-- review.reverted outbound webhook carrying the internal audit reason.

-- AlterEnum
ALTER TYPE "SubmissionStatus" ADD VALUE 'reverted';
