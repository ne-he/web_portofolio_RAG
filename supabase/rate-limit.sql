-- Daily usage cap for /api/chat (Supabase-backed).
-- Run this ONCE in the Supabase SQL Editor (Dashboard → SQL → New query → Run).
-- It survives serverless cold starts, unlike the in-memory burst limiter.
--
-- The "day" is computed in UTC, so counters reset at 00:00 UTC (07:00 WIB).

create table if not exists public.usage_counter (
  key   text    not null,
  day   date    not null default (now() at time zone 'utc')::date,
  count integer not null default 0,
  primary key (key, day)
);

-- Atomically bumps the per-IP counter (and a shared __global__ counter), then
-- reports whether this request is within the limits.
--   p_ip_key       : opaque per-visitor key (hashed IP) — caller supplies it
--   p_ip_limit     : max questions per visitor per day
--   p_global_limit : max questions across ALL visitors per day (<= 0 disables it)
create or replace function public.check_and_bump_usage(
  p_ip_key       text,
  p_ip_limit     integer,
  p_global_limit integer
)
returns table (allowed boolean, ip_count integer, global_count integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_day          date := (now() at time zone 'utc')::date;
  v_ip_count     integer;
  v_global_count integer;
begin
  -- Bump the per-visitor counter first.
  insert into usage_counter (key, day, count) values (p_ip_key, v_day, 1)
  on conflict (key, day) do update set count = usage_counter.count + 1
  returning count into v_ip_count;

  -- Over the per-visitor cap → block now; don't touch the global counter
  -- (a blocked request never calls Gemini, so it shouldn't burn global budget).
  if v_ip_count > p_ip_limit then
    allowed := false; ip_count := v_ip_count; global_count := -1;
    return next; return;
  end if;

  -- Within the per-visitor cap → count it against the global budget too.
  insert into usage_counter (key, day, count) values ('__global__', v_day, 1)
  on conflict (key, day) do update set count = usage_counter.count + 1
  returning count into v_global_count;

  allowed      := (p_global_limit <= 0) or (v_global_count <= p_global_limit);
  ip_count     := v_ip_count;
  global_count := v_global_count;
  return next;
end;
$$;
