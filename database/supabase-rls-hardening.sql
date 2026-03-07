-- Supabase/PostgreSQL hardening script
-- Purpose:
-- 1) Enable RLS on all flagged public tables.
-- 2) Revoke direct table privileges from API roles (anon/authenticated).
--
-- Notes:
-- - Run this in the Supabase SQL editor (or psql against your Postgres DB).
-- - Your server-side DB connection (service role / DB owner) continues to work.
-- - If you later want client-side access, add explicit policies per table.

DO $$
DECLARE
  t TEXT;
  tables TEXT[] := ARRAY[
    'workers',
    'worker_bank_details',
    'users',
    'password_resets',
    'fuel_station_bank_details',
    'floating_cash_payments',
    'platform_settings',
    'cod_settlements',
    'service_types',
    'audit_logs',
    'cod_settings',
    'service_prices',
    'fuel_stations',
    'fuel_station_assignments',
    'worker_station_cache',
    'payments',
    'worker_payouts',
    'fuel_station_ledger',
    'fuel_station_stock',
    'connectivity_reports',
    'settlements',
    'service_requests',
    'payout_logs',
    'activity_log'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    IF to_regclass(format('public.%I', t)) IS NOT NULL THEN
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
      EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE public.%I FROM anon', t);
      EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE public.%I FROM authenticated', t);
      RAISE NOTICE 'Hardened table public.%', t;
    ELSE
      RAISE NOTICE 'Skipped missing table public.%', t;
    END IF;
  END LOOP;
END
$$;
