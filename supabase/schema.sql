-- CAPITAL AUTOPILOT — esquema Supabase
-- Ejecutar en el SQL editor del proyecto. Tablas con prefijo ap_ para aislar.

create table if not exists ap_config (
  id int primary key default 1,
  data jsonb not null,
  updated_at timestamptz default now(),
  constraint ap_config_singleton check (id = 1)
);

create table if not exists ap_state (
  id int primary key default 1,
  data jsonb not null,
  updated_at timestamptz default now(),
  constraint ap_state_singleton check (id = 1)
);

-- Cache del token de sesion de Capital.com (CST + X-SECURITY-TOKEN),
-- compartido entre invocaciones serverless para no re-loguear en cada arranque
-- en frio (evita el rate-limit error.too-many.requests de Capital).
create table if not exists ap_session (
  id int primary key default 1,
  cst text,
  xst text,
  created_at timestamptz default now(),
  constraint ap_session_singleton check (id = 1)
);

create table if not exists ap_trades (
  id text primary key,
  ts timestamptz not null,
  closed_ts timestamptz,
  epic text not null,
  direction text not null,
  size numeric not null,
  entry numeric not null,
  exit numeric,
  pnl numeric,
  status text not null default 'open',
  deal_id text,
  dry_run boolean not null default false,
  reason text
);
create index if not exists ap_trades_ts_idx on ap_trades (ts desc);
create index if not exists ap_trades_status_idx on ap_trades (status);

create table if not exists ap_equity (
  id bigint generated always as identity primary key,
  ts timestamptz not null,
  equity numeric not null
);
create index if not exists ap_equity_ts_idx on ap_equity (ts desc);

create table if not exists ap_logs (
  id bigint generated always as identity primary key,
  ts timestamptz not null,
  level text not null,
  epic text,
  message text not null
);
create index if not exists ap_logs_ts_idx on ap_logs (ts desc);

-- El backend usa la service role key (acceso completo). RLS activado y sin
-- politicas publicas: nadie con anon key puede leer/escribir.
alter table ap_config  enable row level security;
alter table ap_state   enable row level security;
alter table ap_session enable row level security;
alter table ap_trades enable row level security;
alter table ap_equity enable row level security;
alter table ap_logs   enable row level security;
