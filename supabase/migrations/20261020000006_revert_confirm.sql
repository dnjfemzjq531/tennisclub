-- 승인 요청이 네트워크 오류로 끝났을 때 주문을 다시 승인할 수 있게 ready로 되돌려요. (service_role 전용)
create or replace function public.revert_confirm(p_order_id text)
returns void
language sql security definer
set search_path = ''
as $$
  update public.orders set status = 'ready', updated_at = now()
  where order_id = p_order_id and status = 'confirming'
$$;
revoke execute on function public.revert_confirm(text) from public, anon, authenticated;
grant execute on function public.revert_confirm(text) to service_role;
