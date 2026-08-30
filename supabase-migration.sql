-- Run against the existing Vijay Cooperative Bank Supabase project.
-- The page uses the same project URL/key as the previous portal.
alter table public.qualifications
  add column if not exists sslc_cgpa numeric,
  add column if not exists puc_cgpa numeric;

-- Direct applications use Supabase anonymous auth; enable it in
-- Authentication > Providers > Anonymous Sign-Ins before publishing.
