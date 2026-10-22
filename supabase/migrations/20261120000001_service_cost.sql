-- Service costs (paper + ink per printed page, official fees of an admin
-- service…) so profit reports show the real margin of services too.
-- The cost is copied onto each sale line / paid request at that moment:
-- changing it later does not rewrite past profits.

alter table public.services add column if not exists unit_cost bigint not null default 0 check (unit_cost >= 0);
alter table public.service_requests add column if not exists unit_cost bigint;

-- POS sales: a service line costs its service's unit cost
do $$
declare
  v_def text := pg_get_functiondef('public.create_sale(jsonb)'::regprocedure);
  v_new text;
begin
  v_new := replace(v_def, $q$v_rate := v_sv.tax_rate; v_cost := 0;$q$, $q$v_rate := v_sv.tax_rate; v_cost := coalesce(v_sv.unit_cost, 0);$q$);
  if v_new = v_def then raise exception 'create_sale(): pattern not found'; end if;
  execute v_new;
end $$;

-- Requests paid online (not through a POS sale): keep the cost when they become paid
create or replace function public.request_cost_snapshot()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.payment_status = 'paid' and (old.payment_status is distinct from 'paid') and new.unit_cost is null then
    new.unit_cost := coalesce((select unit_cost from services where id = new.service_id), 0);
  end if;
  return new;
end $$;

drop trigger if exists request_cost_snapshot on public.service_requests;
create trigger request_cost_snapshot before update of payment_status on public.service_requests
  for each row execute function public.request_cost_snapshot();

do $$
declare
  v_def text := pg_get_functiondef('public.online_summary(timestamptz,timestamptz)'::regprocedure);
  v_new text;
begin
  v_new := replace(v_def,
    $q$'requests_paid', (select coalesce(sum(price), 0) from service_requests where payment_status = 'paid' and paid_via_sale is null and paid_at >= p_from and paid_at < p_to),$q$,
    $q$'requests_paid', (select coalesce(sum(price), 0) from service_requests where payment_status = 'paid' and paid_via_sale is null and paid_at >= p_from and paid_at < p_to),
    'requests_cogs', (select coalesce(sum(unit_cost), 0) from service_requests where payment_status = 'paid' and paid_via_sale is null and paid_at >= p_from and paid_at < p_to),$q$);
  if v_new = v_def then raise exception 'online_summary(): pattern not found'; end if;
  execute v_new;

  v_def := pg_get_functiondef('public.report_full(timestamptz,timestamptz)'::regprocedure);
  v_new := replace(v_def,
    $q$v_ocogs bigint := coalesce((o->>'orders_cogs')::bigint, 0);$q$,
    $q$v_ocogs bigint := coalesce((o->>'orders_cogs')::bigint, 0) + coalesce((o->>'requests_cogs')::bigint, 0);$q$);
  if v_new = v_def then raise exception 'report_full(): pattern not found'; end if;
  execute v_new;
end $$;
