-- ─────────────────────────────────────────────────────────────
-- Phase 9 — Per-installment payment channel on customers
-- Adds pay1_channel … pay6_channel so BookingPanel can record
-- the payment method (โอนเข้าบัญชี, บัตรเครดิต, เงินสด, QR Code)
-- per booking installment independently.
-- ─────────────────────────────────────────────────────────────

alter table customers
  add column if not exists pay1_channel text,
  add column if not exists pay2_channel text,
  add column if not exists pay3_channel text,
  add column if not exists pay4_channel text,
  add column if not exists pay5_channel text,
  add column if not exists pay6_channel text;
