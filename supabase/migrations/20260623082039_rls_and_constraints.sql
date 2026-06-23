-- Enable Row Level Security
alter table device_data enable row level security;

-- Each authenticated user can only read/write their own row.
-- auth.uid() is null for unauthenticated requests, so the policy
-- evaluates to false and blocks all access without a valid session.
create policy "owner_access" on device_data
  for all
  using  (device_id = auth.uid()::text)
  with check (device_id = auth.uid()::text);

-- Prevent a single device from storing an unreasonably large payload.
alter table device_data
  add constraint cards_size_limit
  check (length(cards::text) <= 102400);
