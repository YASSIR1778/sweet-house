-- Refunded items: remove their purchase cost from the cost of goods sold.
create or replace function public.report(p_from timestamptz, p_to timestamptz)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_profit boolean := public.has_perm('reports.profit');
  v_res jsonb;
  v_revenue bigint; v_cogs bigint; v_refunds bigint; v_exp bigint; v_sal bigint; v_comm bigint;
begin
  if not public.has_perm('reports.sales') then raise exception 'forbidden'; end if;
  select coalesce(sum(total), 0) into v_revenue from sales where status = 'completed' and created_at >= p_from and created_at < p_to;
  select coalesce(sum(total), 0) into v_refunds from refunds where created_at >= p_from and created_at < p_to;
  select coalesce(sum(i.unit_cost * i.qty), 0)::bigint into v_cogs from sale_items i join sales s on s.id = i.sale_id
   where s.status = 'completed' and s.created_at >= p_from and s.created_at < p_to;
  -- returned goods go back to stock, so their cost is not a cost of sale
  v_cogs := v_cogs - (select coalesce(sum(ri.qty * si.unit_cost), 0)::bigint
                        from refund_items ri join refunds r on r.id = ri.refund_id join sale_items si on si.id = ri.sale_item_id
                       where r.created_at >= p_from and r.created_at < p_to);

  v_res := jsonb_build_object(
    'revenue', v_revenue,
    'refunds', v_refunds,
    'net_revenue', v_revenue - v_refunds,
    'sales_count', (select count(*) from sales where status = 'completed' and created_at >= p_from and created_at < p_to),
    'payments', (select jsonb_build_object('cash', coalesce(sum(paid_cash), 0), 'card', coalesce(sum(paid_card), 0), 'credit', coalesce(sum(paid_credit), 0))
                   from sales where status = 'completed' and created_at >= p_from and created_at < p_to),
    'tax', (select coalesce(sum(tax_total), 0) from sales where status = 'completed' and created_at >= p_from and created_at < p_to),
    'discounts', (select coalesce(sum(discount_total), 0) from sales where status = 'completed' and created_at >= p_from and created_at < p_to),
    'by_day', (select coalesce(jsonb_agg(jsonb_build_object('day', d, 'revenue', r, 'count', c) order by d), '[]') from (
        select (created_at at time zone 'Africa/Casablanca')::date d, sum(total) r, count(*) c from sales
         where status = 'completed' and created_at >= p_from and created_at < p_to group by 1) t),
    'by_hour', (select coalesce(jsonb_agg(jsonb_build_object('hour', h, 'revenue', r) order by h), '[]') from (
        select extract(hour from created_at at time zone 'Africa/Casablanca')::int h, sum(total) r from sales
         where status = 'completed' and created_at >= p_from and created_at < p_to group by 1) t),
    'by_category', (select coalesce(jsonb_agg(t order by t.revenue desc), '[]') from (
        select coalesce(c.name_ar, case when i.item_type = 'service' then 'الخدمات' else 'بدون فئة' end) name_ar,
               coalesce(c.name_fr, case when i.item_type = 'service' then 'Services' else 'Sans catégorie' end) name_fr,
               coalesce(c.color, '#475569') color, sum(i.total) revenue, sum(i.qty) qty
          from sale_items i join sales s on s.id = i.sale_id left join products p on p.id = i.product_id left join categories c on c.id = p.category_id
         where s.status = 'completed' and s.created_at >= p_from and s.created_at < p_to
         group by 1, 2, 3) t),
    'top_items', (select coalesce(jsonb_agg(t order by t.revenue desc), '[]') from (
        select i.name_ar, i.name_fr, sum(i.qty) qty, sum(i.total) revenue,
               case when v_profit then sum(i.total - i.unit_cost * i.qty) end profit
          from sale_items i join sales s on s.id = i.sale_id
         where s.status = 'completed' and s.created_at >= p_from and s.created_at < p_to
         group by i.name_ar, i.name_fr order by sum(i.total) desc limit 20) t),
    'by_employee', (select coalesce(jsonb_agg(t order by t.revenue desc), '[]') from (
        select e.full_name, e.color, count(*) count, sum(s.total) revenue
          from sales s join employees e on e.id = s.employee_id
         where s.status = 'completed' and s.created_at >= p_from and s.created_at < p_to group by e.full_name, e.color) t),
    'riyad_fees', (select coalesce(sum(i.total), 0) from sale_items i join sales s on s.id = i.sale_id join services sv on sv.id = i.service_id
                    where sv.system_key = 'riyad_fee' and s.status = 'completed' and s.created_at >= p_from and s.created_at < p_to),
    'shifts', (select jsonb_build_object('count', count(*), 'difference', coalesce(sum(difference), 0))
                 from shifts where status = 'closed' and closed_at >= p_from and closed_at < p_to)
  );

  if v_profit then
    select coalesce(sum(amount), 0) into v_exp from expenses where deleted_at is null and spent_on >= (p_from at time zone 'Africa/Casablanca')::date and spent_on < (p_to at time zone 'Africa/Casablanca')::date;
    select coalesce(sum(net + advances), 0) into v_sal from payroll_runs where paid_at >= p_from and paid_at < p_to;
    select coalesce(sum(amount), 0) into v_comm from riyad_ledger where type = 'commission' and created_at >= p_from and created_at < p_to;
    v_res := v_res || jsonb_build_object(
      'cogs', v_cogs,
      'gross_profit', v_revenue - v_refunds - v_cogs,
      'expenses', v_exp,
      'salaries', v_sal,
      'riyad_commissions', v_comm,
      'net_profit', v_revenue - v_refunds - v_cogs - v_exp - v_sal + v_comm,
      'expenses_by_category', (select coalesce(jsonb_agg(t order by t.amount desc), '[]') from (
          select coalesce(c.name_ar, 'أخرى') name_ar, coalesce(c.name_fr, 'Autres') name_fr, coalesce(c.color, '#475569') color, sum(x.amount) amount
            from expenses x left join expense_categories c on c.id = x.category_id
           where x.deleted_at is null and x.spent_on >= (p_from at time zone 'Africa/Casablanca')::date and x.spent_on < (p_to at time zone 'Africa/Casablanca')::date
           group by 1, 2, 3) t));
  end if;

  return v_res || jsonb_build_object(
    'debts_total', (select coalesce(sum(amount), 0) from customer_ledger),
    'suppliers_total', (select coalesce(sum(amount), 0) from supplier_ledger),
    'riyad_balance', case when public.has_perm('riyad.view_balance') then public.riyad_balance() end);
end $$;

