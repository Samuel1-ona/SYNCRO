-- Create user_preferences table
create table if not exists public.user_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  notification_channels text[] not null default '{"email"}',
  reminder_timing integer[] not null default '{7, 3, 1}',
  email_opt_ins jsonb not null default '{"marketing": false, "reminders": true, "updates": true}',
  automation_flags jsonb not null default '{"auto_renew": false, "auto_retry": true}',
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Enable RLS
alter table public.user_preferences enable row level security;

-- RLS Policies
create policy "user_preferences_select_own"
  on public.user_preferences for select
  using (auth.uid() = user_id);

create policy "user_preferences_insert_own"
  on public.user_preferences for insert
  with check (auth.uid() = user_id);

create policy "user_preferences_update_own"
  on public.user_preferences for update
  using (auth.uid() = user_id);

-- Trigger for updated_at
create or replace function public.handle_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger set_updated_at
  before update on public.user_preferences
  for each row
  execute function public.handle_updated_at();

-- Add default preferences for existing users (optional, but good for backward compatibility)
insert into public.user_preferences (user_id)
select id from auth.users
on conflict (user_id) do nothing;
