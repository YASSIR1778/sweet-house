-- Security review 2026-10-21: internal helpers that had no permission check
-- were callable by anyone (e.g. the Riyad balance and the safe amount).
-- They are only used inside other (checked) functions, so close them.
revoke execute on function public.riyad_balance() from public, anon, authenticated;
revoke execute on function public.shift_carryover(uuid) from public, anon, authenticated;
revoke execute on function public.shift_totals(uuid) from public, anon, authenticated;
revoke execute on function public.current_shift(uuid) from public, anon, authenticated;
revoke execute on function public.require_open_shift(uuid) from public, anon, authenticated;
revoke execute on function public.service_unit_price(uuid, numeric) from public, anon;
revoke execute on function public.employee_commission(uuid, timestamptz, timestamptz) from public, anon, authenticated;
revoke execute on function public.generate_barcode() from public, anon;
