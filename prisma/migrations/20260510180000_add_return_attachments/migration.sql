-- Add attachment columns for return verifications
-- requisition_header: BORROW return flow (submit by requester, verify by warehouse staff)
ALTER TABLE "inventory"."requisition_header"
  ADD COLUMN "return_submit_attachments" JSONB,
  ADD COLUMN "return_verify_attachments" JSONB;

-- reusable_return_requests: Department return flow (submit by department, process by warehouse staff)
ALTER TABLE "inventory"."reusable_return_requests"
  ADD COLUMN "submit_attachments" JSONB,
  ADD COLUMN "process_attachments" JSONB;
