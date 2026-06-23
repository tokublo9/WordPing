create table device_data (
  device_id text primary key,
  cards     jsonb not null default '[]'::jsonb,
  settings  jsonb not null default '{}'::jsonb,
  synced_at timestamptz not null default now()
);
