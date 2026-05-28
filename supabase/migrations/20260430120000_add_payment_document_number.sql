alter table public.payment_records
  add column if not exists "numeroDocumento" text;
