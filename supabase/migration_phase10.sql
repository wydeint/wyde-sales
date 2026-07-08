-- Phase 10: schema changes from session (jobs fields, condo_leads, payment_followups RLS)

-- jobs: add contract_date and plan_transfer_month
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS contract_date date;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS plan_transfer_month text;
-- note: work_start_date was already added in a prior migration

-- condo_leads: add status default, job_id column, unique constraint
ALTER TABLE condo_leads ALTER COLUMN status SET DEFAULT 'prospect';
ALTER TABLE condo_leads ADD COLUMN IF NOT EXISTS job_id text;
ALTER TABLE condo_leads ADD CONSTRAINT IF NOT EXISTS condo_leads_project_room_unique UNIQUE (project_id, room_no);

-- payment_followups: enable RLS and create auth policies
ALTER TABLE payment_followups ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'payment_followups' AND policyname = 'payment_followups_auth_read'
  ) THEN
    CREATE POLICY "payment_followups_auth_read" ON payment_followups
      FOR SELECT TO authenticated USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'payment_followups' AND policyname = 'payment_followups_auth_write'
  ) THEN
    CREATE POLICY "payment_followups_auth_write" ON payment_followups
      FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;
