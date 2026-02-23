-- Create merchants table
create table if not exists public.merchants (
  merchant_id uuid primary key default gen_random_uuid(),
  name text not null,
  logo_url text,
  category text,
  cancellation_url text,
  gift_card_supported boolean default false,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

-- Enable RLS for merchants
alter table public.merchants enable row level security;

-- RLS Policies for merchants
-- Anyone can view merchants
create policy "merchants_select_all"
  on public.merchants for select
  to authenticated
  using (true);

-- Only admins (or service role) can modify merchants
-- Assuming admin modifications are done through service role in backend for now,
-- but adding basic policies for completeness.
-- (Backend uses service key to bypass RLS for admin operations)

-- Indexes
create index if not exists merchants_name_idx on public.merchants(name);

-- Alter subscriptions table to reference merchants
alter table public.subscriptions 
add column if not exists merchant_id uuid references public.merchants(merchant_id) on delete set null;

create index if not exists subscriptions_merchant_id_idx on public.subscriptions(merchant_id);
