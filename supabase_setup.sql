-- OCIO Financial Markets - Supabase Database Setup
-- Run this in your Supabase SQL Editor:
-- https://supabase.com/dashboard/project/rgylygmjgfguqzqetkyv/sql/new

CREATE TABLE IF NOT EXISTS public.otp_state (
    id BIGINT PRIMARY KEY,
    "expectedOtp" TEXT
);

-- Disable Row Level Security so the publishable/anon API key can read and write
ALTER TABLE public.otp_state DISABLE ROW LEVEL SECURITY;

-- Grant permissions to anon and authenticated roles
GRANT ALL ON TABLE public.otp_state TO anon, authenticated, service_role;

-- Seed initial record for SYNC_ID = 2
INSERT INTO public.otp_state (id, "expectedOtp")
VALUES (
    2,
    '{"ocio_users":[{"password":"MarieDupre","name":"MarieDupre","email":"petemariedunn@gmail.com","withdrawalFee":5000,"balance":270,"joined":"5/24/2026"}],"ocio_deposits":[{"id":"19e5dacc07dadmin1","name":"MarieDupre","amount":270,"date":"5/24/2026","method":"Direct Credit","email":"petemariedunn@gmail.com","status":"Approved"}],"ocio_withdrawals":[],"ocio_wallet_addresses":{},"ocio_giftcards":[]}'
)
ON CONFLICT (id) DO UPDATE 
SET "expectedOtp" = EXCLUDED."expectedOtp"
WHERE public.otp_state."expectedOtp" IS NULL;
