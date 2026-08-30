-- Vijay Co-op Bank, Vijayapur
-- Direct application schema (no registration or password-login tables).
-- Run this in Supabase Dashboard -> SQL Editor.

create extension if not exists pgcrypto;

-- Anonymous Sign-Ins must be enabled in Authentication -> Providers.

create table if not exists public.candidates (
  id uuid primary key references auth.users(id) on delete cascade,
  registration_id text unique not null default ('VCB' || floor(random() * 900000000 + 100000000)::bigint),
  full_name text not null,
  father_name text not null,
  mother_name text not null,
  spouse_name text,
  date_of_birth date not null,
  gender text not null,
  aadhaar_number text not null,
  mobile_number text not null,
  email text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint candidates_aadhaar_digits check (aadhaar_number ~ '^[0-9]{12}$'),
  constraint candidates_mobile_digits check (mobile_number ~ '^[0-9]{10}$')
);

create table if not exists public.applications (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid not null references public.candidates(id) on delete cascade,
  post_name text not null default 'Second Division Assistant',
  application_status text not null default 'draft' check (application_status in ('draft','submitted','under_review')),
  flat_house_building text, area_street_village text, taluk text, state text,
  district text, pincode text, permanent_address_same boolean,
  kannada_knowledge boolean, nationality text, religion text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.qualifications (
  id uuid primary key default gen_random_uuid(),
  application_id uuid unique not null references public.applications(id) on delete cascade,
  prescribed_qualification text, date_of_passing date,
  board_institute_university text, register_number text, class_secured text,
  grade_points boolean, maximum_marks numeric, secured_marks numeric, percentage numeric,
  computer_knowledge boolean,
  sslc_board text, sslc_other_board text, sslc_total_marks numeric,
  sslc_obtained_marks numeric, sslc_percentage numeric, sslc_cgpa numeric,
  puc_board text, puc_other_board text, puc_total_marks numeric,
  puc_obtained_marks numeric, puc_percentage numeric, puc_cgpa numeric,
  degree_name text, degree_board text, degree_score_type text,
  degree_percentage numeric, degree_cgpa numeric
);

create table if not exists public.reservations (
  id uuid primary key default gen_random_uuid(),
  application_id uuid unique not null references public.applications(id) on delete cascade,
  category text not null check (category in ('GM','SC','ST','CAT1','2A','2B','3A','3B')),
  issue_date date, sub_caste text, rd_number text
);

create table if not exists public.documents (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.applications(id) on delete cascade,
  document_type text not null check (document_type in ('photo','signature','sslc','puc_diploma','degree','computer','caste')),
  storage_path text not null, original_file_name text,
  uploaded_at timestamptz not null default now(),
  unique(application_id, document_type)
);

-- Make the script safe to run against the earlier schema already used by the site.
alter table public.qualifications add column if not exists sslc_board text;
alter table public.qualifications add column if not exists sslc_other_board text;
alter table public.qualifications add column if not exists sslc_total_marks numeric;
alter table public.qualifications add column if not exists sslc_obtained_marks numeric;
alter table public.qualifications add column if not exists sslc_percentage numeric;
alter table public.qualifications add column if not exists sslc_cgpa numeric;
alter table public.qualifications add column if not exists puc_board text;
alter table public.qualifications add column if not exists puc_other_board text;
alter table public.qualifications add column if not exists puc_total_marks numeric;
alter table public.qualifications add column if not exists puc_obtained_marks numeric;
alter table public.qualifications add column if not exists puc_percentage numeric;
alter table public.qualifications add column if not exists puc_cgpa numeric;
alter table public.qualifications add column if not exists degree_name text;
alter table public.qualifications add column if not exists degree_board text;
alter table public.qualifications add column if not exists degree_score_type text;
alter table public.qualifications add column if not exists degree_percentage numeric;
alter table public.qualifications add column if not exists degree_cgpa numeric;
alter table public.documents drop constraint if exists documents_document_type_check;
alter table public.documents add constraint documents_document_type_check
  check (document_type in ('photo','signature','sslc','puc_diploma','degree','computer','caste'));

-- Enforce the same age rules in the database as in the form UI.
create or replace function public.validate_candidate_age_for_category()
returns trigger language plpgsql as $$
declare
  dob date;
  age integer;
  max_age integer;
begin
  select c.date_of_birth into dob
  from public.applications a join public.candidates c on c.id = a.candidate_id
  where a.id = new.application_id;
  age := extract(year from age(current_date, dob));
  max_age := case when new.category = 'GM' then 35
                  when new.category in ('SC','ST','CAT1') then 40
                  else 38 end;
  if age < 18 or age > max_age then
    raise exception 'Age must be between 18 and % years for category %', max_age, new.category;
  end if;
  return new;
end $$;

drop trigger if exists reservations_age_check on public.reservations;
create trigger reservations_age_check
before insert or update of category, application_id on public.reservations
for each row execute function public.validate_candidate_age_for_category();

alter table public.candidates enable row level security;
alter table public.applications enable row level security;
alter table public.qualifications enable row level security;
alter table public.reservations enable row level security;
alter table public.documents enable row level security;

drop policy if exists candidates_select_own on public.candidates;
drop policy if exists candidates_insert_own on public.candidates;
drop policy if exists candidates_update_own on public.candidates;
create policy candidates_select_own on public.candidates for select using (auth.uid() = id);
create policy candidates_insert_own on public.candidates for insert with check (auth.uid() = id);
create policy candidates_update_own on public.candidates for update using (auth.uid() = id) with check (auth.uid() = id);

drop policy if exists applications_select_own on public.applications;
drop policy if exists applications_insert_own on public.applications;
drop policy if exists applications_update_own on public.applications;
create policy applications_select_own on public.applications for select using (auth.uid() = candidate_id);
create policy applications_insert_own on public.applications for insert with check (auth.uid() = candidate_id);
create policy applications_update_own on public.applications for update using (auth.uid() = candidate_id) with check (auth.uid() = candidate_id);

drop policy if exists qualifications_manage_own on public.qualifications;
create policy qualifications_manage_own on public.qualifications for all using
  (exists (select 1 from public.applications a where a.id = application_id and a.candidate_id = auth.uid()))
  with check (exists (select 1 from public.applications a where a.id = application_id and a.candidate_id = auth.uid()));

drop policy if exists reservations_manage_own on public.reservations;
create policy reservations_manage_own on public.reservations for all using
  (exists (select 1 from public.applications a where a.id = application_id and a.candidate_id = auth.uid()))
  with check (exists (select 1 from public.applications a where a.id = application_id and a.candidate_id = auth.uid()));

drop policy if exists documents_manage_own on public.documents;
create policy documents_manage_own on public.documents for all using
  (exists (select 1 from public.applications a where a.id = application_id and a.candidate_id = auth.uid()))
  with check (exists (select 1 from public.applications a where a.id = application_id and a.candidate_id = auth.uid()));

-- Create the bucket in Storage if it does not already exist.
insert into storage.buckets (id, name, public)
values ('application-documents', 'application-documents', false)
on conflict (id) do nothing;

drop policy if exists application_documents_read_own on storage.objects;
drop policy if exists application_documents_insert_own on storage.objects;
create policy application_documents_read_own on storage.objects for select using
  (bucket_id = 'application-documents' and (storage.foldername(name))[1] = auth.uid()::text);
create policy application_documents_insert_own on storage.objects for insert with check
  (bucket_id = 'application-documents' and (storage.foldername(name))[1] = auth.uid()::text);
