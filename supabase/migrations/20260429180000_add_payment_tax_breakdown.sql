alter table public.payment_records
  add column if not exists subtotal numeric default 0,
  add column if not exists iva numeric default 0,
  add column if not exists retefuente numeric default 0,
  add column if not exists "fechaPagoReal" text;
