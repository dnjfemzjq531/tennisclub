-- 랠리클럽 서버 로직: 가입 트리거, 클럽·멤버십·회비·주문 RPC, 결제 승인 함수

/* ======================================================================
 * 회원가입 → 프로필 자동 생성
 * ==================================================================== */
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  v_ntrp text := coalesce(new.raw_user_meta_data ->> 'ntrp', '3.0');
begin
  if v_ntrp !~ '^[1-7]\.[05]$' then v_ntrp := '3.0'; end if;
  insert into public.profiles (id, name, email, phone, ntrp)
  values (
    new.id,
    left(coalesce(nullif(trim(new.raw_user_meta_data ->> 'name'), ''), split_part(new.email, '@', 1)), 30),
    coalesce(new.email, ''),
    left(coalesce(new.raw_user_meta_data ->> 'phone', ''), 20),
    v_ntrp
  );
  return new;
end;
$$;
revoke execute on function public.handle_new_user() from public, anon, authenticated;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

/* 내 프로필 전체 (이메일·전화·customerKey 포함) */
create or replace function public.get_my_profile()
returns table (id uuid, name text, email text, phone text, ntrp text, customer_key uuid, created_at timestamptz)
language sql stable security definer
set search_path = ''
as $$
  select p.id, p.name, p.email, p.phone, p.ntrp, p.customer_key, p.created_at
  from public.profiles p where p.id = (select auth.uid())
$$;

/* 운영진 전용: 클럽 회원(대기 포함) 연락처 */
create or replace function public.club_member_contacts(p_club uuid)
returns table (user_id uuid, email text, phone text)
language plpgsql stable security definer
set search_path = ''
as $$
begin
  if not public.is_admin(p_club) then
    raise exception '운영진만 연락처를 볼 수 있어요.' using errcode = '42501';
  end if;
  return query
    select p.id, p.email, p.phone
    from public.memberships m join public.profiles p on p.id = m.user_id
    where m.club_id = p_club;
end;
$$;

/* ======================================================================
 * 회비 생성 (내부 전용)
 * ==================================================================== */
create or replace function public.ensure_dues(p_club uuid)
returns void
language sql security definer
set search_path = ''
as $$
  insert into public.dues (club_id, user_id, period, amount)
  select m.club_id, m.user_id, public.kst_period(0), c.monthly_fee
  from public.memberships m join public.clubs c on c.id = m.club_id
  where m.club_id = p_club and m.status = 'active'
  on conflict (club_id, user_id, period) do nothing
$$;
revoke execute on function public.ensure_dues(uuid) from public, anon, authenticated;

-- pg_cron이 매일 00:05(KST)에 불러요. 이미 있으면 건너뛰어서 여러 번 불러도 안전해요.
create or replace function public.generate_monthly_dues()
returns integer
language plpgsql security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  insert into public.dues (club_id, user_id, period, amount)
  select m.club_id, m.user_id, public.kst_period(0), c.monthly_fee
  from public.memberships m join public.clubs c on c.id = m.club_id
  where m.status = 'active'
  on conflict (club_id, user_id, period) do nothing;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;
revoke execute on function public.generate_monthly_dues() from public, anon, authenticated;

/* ======================================================================
 * 클럽
 * ==================================================================== */
create or replace function public.create_club(
  p_name text, p_region text, p_court text, p_description text,
  p_monthly_fee integer, p_approval text, p_tone text
)
returns public.clubs
language plpgsql security definer
set search_path = ''
as $$
declare
  v_me uuid := auth.uid();
  v_club public.clubs;
begin
  if v_me is null then raise exception '로그인이 필요해요.' using errcode = '42501'; end if;
  insert into public.clubs (name, region, court, description, monthly_fee, approval, tone, owner_id)
  values (trim(p_name), trim(p_region), trim(p_court), coalesce(trim(p_description), ''),
          coalesce(p_monthly_fee, 0), coalesce(p_approval, 'manual'), coalesce(p_tone, 'court'), v_me)
  returning * into v_club;
  insert into public.memberships (club_id, user_id, role, status) values (v_club.id, v_me, 'owner', 'active');
  perform public.ensure_dues(v_club.id);
  return v_club;
end;
$$;

/* ======================================================================
 * 멤버십
 * ==================================================================== */
create or replace function public.join_club(p_club uuid)
returns text
language plpgsql security definer
set search_path = ''
as $$
declare
  v_me uuid := auth.uid();
  v_approval text;
  v_status text;
begin
  if v_me is null then raise exception '로그인이 필요해요.' using errcode = '42501'; end if;
  select approval into v_approval from public.clubs where id = p_club;
  if v_approval is null then raise exception '클럽을 찾을 수 없어요.'; end if;

  select status into v_status from public.memberships where club_id = p_club and user_id = v_me;
  if v_status is not null then return v_status; end if;

  v_status := case when v_approval = 'auto' then 'active' else 'pending' end;
  insert into public.memberships (club_id, user_id, role, status) values (p_club, v_me, 'member', v_status);
  if v_status = 'active' then perform public.ensure_dues(p_club); end if;
  return v_status;
end;
$$;

-- 탈퇴 또는 가입 신청 취소. 미납 회비도 함께 정리해요.
create or replace function public.leave_club(p_club uuid)
returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  v_me uuid := auth.uid();
  v_role text;
begin
  if v_me is null then raise exception '로그인이 필요해요.' using errcode = '42501'; end if;
  select role into v_role from public.memberships where club_id = p_club and user_id = v_me;
  if v_role is null then return; end if;
  if v_role = 'owner' then raise exception '클럽장은 탈퇴할 수 없어요.'; end if;
  delete from public.memberships where club_id = p_club and user_id = v_me;
  delete from public.dues where club_id = p_club and user_id = v_me and status = 'unpaid';
end;
$$;

create or replace function public.approve_member(p_club uuid, p_user uuid)
returns void
language plpgsql security definer
set search_path = ''
as $$
begin
  if not public.is_admin(p_club) then raise exception '운영진만 승인할 수 있어요.' using errcode = '42501'; end if;
  update public.memberships set status = 'active', joined_at = now()
  where club_id = p_club and user_id = p_user and status = 'pending';
  if not found then raise exception '대기 중인 신청을 찾을 수 없어요.'; end if;
  perform public.ensure_dues(p_club);
end;
$$;

create or replace function public.reject_member(p_club uuid, p_user uuid)
returns void
language plpgsql security definer
set search_path = ''
as $$
begin
  if not public.is_admin(p_club) then raise exception '운영진만 거절할 수 있어요.' using errcode = '42501'; end if;
  delete from public.memberships where club_id = p_club and user_id = p_user and status = 'pending';
  if not found then raise exception '대기 중인 신청을 찾을 수 없어요.'; end if;
end;
$$;

-- owner만 역할을 바꿀 수 있어요. owner 역할은 주거나 바꿀 수 없어요.
create or replace function public.set_member_role(p_club uuid, p_user uuid, p_role text)
returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  v_me uuid := auth.uid();
begin
  if not exists (select 1 from public.memberships
                 where club_id = p_club and user_id = v_me and status = 'active' and role = 'owner') then
    raise exception '클럽장만 역할을 바꿀 수 있어요.' using errcode = '42501';
  end if;
  if p_role not in ('admin', 'member') then raise exception '바꿀 수 없는 역할이에요.'; end if;
  update public.memberships set role = p_role
  where club_id = p_club and user_id = p_user and status = 'active' and role <> 'owner';
  if not found then raise exception '역할을 바꿀 회원을 찾을 수 없어요.'; end if;
end;
$$;

-- 일반 회원은 운영진 이상이, 운영진은 owner만 내보낼 수 있어요. owner는 내보낼 수 없어요.
create or replace function public.kick_member(p_club uuid, p_user uuid)
returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  v_me uuid := auth.uid();
  v_my_role text;
  v_target_role text;
begin
  select role into v_my_role from public.memberships
  where club_id = p_club and user_id = v_me and status = 'active';
  select role into v_target_role from public.memberships
  where club_id = p_club and user_id = p_user and status = 'active';

  if v_my_role is null or v_my_role = 'member' then
    raise exception '운영진만 회원을 내보낼 수 있어요.' using errcode = '42501';
  end if;
  if v_target_role is null then raise exception '회원을 찾을 수 없어요.'; end if;
  if p_user = v_me then raise exception '자기 자신은 내보낼 수 없어요.'; end if;
  if v_target_role = 'owner' then raise exception '클럽장은 내보낼 수 없어요.'; end if;
  if v_target_role = 'admin' and v_my_role <> 'owner' then
    raise exception '운영진은 클럽장만 내보낼 수 있어요.' using errcode = '42501';
  end if;

  delete from public.memberships where club_id = p_club and user_id = p_user;
  delete from public.dues where club_id = p_club and user_id = p_user and status = 'unpaid';
end;
$$;

/* ======================================================================
 * 일정 참석 응답
 * ==================================================================== */
-- 같은 응답을 다시 누르면 취소돼요. RLS를 그대로 따르도록 security invoker로 둬요.
create or replace function public.toggle_rsvp(p_game uuid, p_status text)
returns text
language plpgsql security invoker
set search_path = ''
as $$
declare
  v_me uuid := auth.uid();
  v_current text;
begin
  if v_me is null then raise exception '로그인이 필요해요.' using errcode = '42501'; end if;
  if p_status not in ('yes', 'maybe', 'no') then raise exception '잘못된 응답이에요.'; end if;
  select status into v_current from public.rsvps where game_id = p_game and user_id = v_me;
  if v_current = p_status then
    delete from public.rsvps where game_id = p_game and user_id = v_me;
    if not found then raise exception '응답을 바꿀 수 없는 일정이에요.'; end if;
    return null;
  end if;
  insert into public.rsvps (game_id, status) values (p_game, p_status)
  on conflict (game_id, user_id) do update set status = excluded.status, updated_at = now();
  return p_status;
end;
$$;

-- 정원 초과 막기
create or replace function public.check_rsvp_capacity()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  v_capacity integer;
  v_yes integer;
begin
  if new.status <> 'yes' then return new; end if;
  select capacity into v_capacity from public.games where id = new.game_id for update;
  select count(*) into v_yes from public.rsvps
  where game_id = new.game_id and status = 'yes' and user_id <> new.user_id;
  if v_yes >= v_capacity then raise exception '정원이 찼어요.'; end if;
  return new;
end;
$$;
revoke execute on function public.check_rsvp_capacity() from public, anon, authenticated;

create trigger rsvps_capacity
  before insert or update of status on public.rsvps
  for each row execute function public.check_rsvp_capacity();

/* ======================================================================
 * 회비 수기 납부 (운영진)
 * ==================================================================== */
create or replace function public.mark_dues_paid(p_ids uuid[])
returns integer
language plpgsql security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  if exists (select 1 from public.dues d where d.id = any (p_ids) and not public.is_admin(d.club_id)) then
    raise exception '운영진만 납부 처리할 수 있어요.' using errcode = '42501';
  end if;
  update public.dues set status = 'paid', paid_at = now(), method = '현금(수기)'
  where id = any (p_ids) and status = 'unpaid';
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

/* ======================================================================
 * 주문서 생성: 금액은 서버가 DB 값으로 계산해요.
 * ==================================================================== */
create or replace function public.create_order(p_type text, p_refs uuid[])
returns public.orders
language plpgsql security definer
set search_path = ''
as $$
declare
  v_me uuid := auth.uid();
  v_order public.orders;
  v_order_id text := 'RC-' || (extract(epoch from clock_timestamp()) * 1000)::bigint || '-' || substr(md5(gen_random_uuid()::text), 1, 8);
  v_amount integer;
  v_name text;
  v_clubs integer;
  v_count integer;
  v_first_period text;
  v_club_name text;
  v_item public.items;
begin
  if v_me is null then raise exception '로그인이 필요해요.' using errcode = '42501'; end if;
  if p_refs is null or cardinality(p_refs) = 0 then raise exception '결제할 항목을 선택해 주세요.'; end if;

  if p_type = 'dues' then
    select count(*), count(distinct d.club_id), sum(d.amount), min(d.period)
      into v_count, v_clubs, v_amount, v_first_period
    from public.dues d
    where d.id = any (p_refs) and d.user_id = v_me and d.status = 'unpaid';
    if v_count <> cardinality(p_refs) then raise exception '이미 납부했거나 내 회비가 아닌 항목이 있어요.'; end if;
    if v_clubs <> 1 then raise exception '한 번에 한 클럽의 회비만 결제할 수 있어요.'; end if;
    if v_amount <= 0 then raise exception '결제할 금액이 없어요.'; end if;
    select c.name into v_club_name from public.dues d join public.clubs c on c.id = d.club_id where d.id = p_refs[1];
    v_name := v_club_name || ' ' || split_part(v_first_period, '-', 1) || '년 '
      || split_part(v_first_period, '-', 2)::integer || '월 회비'
      || case when v_count > 1 then ' 외 ' || (v_count - 1) || '건' else '' end;

  elsif p_type = 'market' then
    if cardinality(p_refs) <> 1 then raise exception '상품은 하나씩 결제할 수 있어요.'; end if;
    select * into v_item from public.items where id = p_refs[1];
    if v_item.id is null then raise exception '상품을 찾을 수 없어요.'; end if;
    if v_item.status <> 'selling' then raise exception '지금은 구매할 수 없는 상품이에요.'; end if;
    if v_item.seller_id = v_me then raise exception '내 상품은 구매할 수 없어요.'; end if;
    v_amount := v_item.price;
    v_name := v_item.title;
  else
    raise exception '알 수 없는 주문 유형이에요.';
  end if;

  insert into public.orders (order_id, user_id, type, order_name, amount)
  values (v_order_id, v_me, p_type, left(v_name, 100), v_amount)
  returning * into v_order;

  insert into public.order_refs (order_id, due_id, item_id)
  select v_order_id,
         case when p_type = 'dues' then r end,
         case when p_type = 'market' then r end
  from unnest(p_refs) as r;

  return v_order;
end;
$$;

-- 결제창에서 실패·취소하고 돌아왔을 때 사유를 남겨요. 상태는 ready로 두어 다시 결제할 수 있어요.
create or replace function public.record_order_failure(p_order_id text, p_code text, p_message text)
returns void
language sql security definer
set search_path = ''
as $$
  update public.orders
  set fail_code = left(p_code, 100), fail_message = left(p_message, 500), updated_at = now()
  where order_id = p_order_id and user_id = (select auth.uid()) and status = 'ready'
$$;

/* ======================================================================
 * 결제 승인 (Edge Function payments-confirm 전용, service_role만 실행)
 * ==================================================================== */
-- 1단계: 주문·대상 행을 잠그고 검증한 뒤 confirming으로 바꿔요.
create or replace function public.begin_confirm(p_order_id text, p_amount integer, p_user uuid)
returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  v_order public.orders;
  v_item public.items;
  v_bad integer;
begin
  select * into v_order from public.orders where order_id = p_order_id for update;
  if v_order.order_id is null then
    return jsonb_build_object('ok', false, 'code', 'NOT_FOUND_ORDER', 'message', '주문을 찾을 수 없어요.');
  end if;
  if v_order.user_id <> p_user then
    return jsonb_build_object('ok', false, 'code', 'FORBIDDEN', 'message', '내 주문이 아니에요.');
  end if;
  if v_order.status = 'done' then
    return jsonb_build_object('ok', true, 'state', 'done');
  end if;
  if v_order.status = 'confirming' then
    return jsonb_build_object('ok', false, 'state', 'confirming', 'code', 'IN_PROGRESS', 'message', '결제를 확인하고 있어요.');
  end if;
  if v_order.status <> 'ready' then
    return jsonb_build_object('ok', false, 'code', 'INVALID_ORDER_STATUS', 'message', '결제할 수 없는 주문이에요. 처음부터 다시 시도해 주세요.');
  end if;
  if v_order.amount <> p_amount then
    return jsonb_build_object('ok', false, 'code', 'AMOUNT_MISMATCH',
      'message', '주문 금액과 결제 금액이 달라서 결제를 승인하지 않았어요.', 'orderAmount', v_order.amount);
  end if;

  if v_order.type = 'market' then
    -- 상품 행을 잠가서 동시에 두 명이 승인하지 못하게 해요.
    select i.* into v_item from public.items i
    join public.order_refs r on r.item_id = i.id
    where r.order_id = p_order_id
    for update of i;
    if v_item.id is null or v_item.status <> 'selling' or v_item.seller_id = p_user
       or exists (select 1 from public.order_refs r2 join public.orders o2 on o2.order_id = r2.order_id
                  where r2.item_id = v_item.id and o2.order_id <> p_order_id and o2.status in ('confirming', 'done')) then
      update public.orders set status = 'failed', fail_code = 'ITEM_UNAVAILABLE', updated_at = now() where order_id = p_order_id;
      return jsonb_build_object('ok', false, 'code', 'ITEM_UNAVAILABLE', 'message', '이미 판매됐거나 구매할 수 없는 상품이에요. 결제는 승인되지 않았어요.');
    end if;
  else
    perform 1 from public.dues d join public.order_refs r on r.due_id = d.id
    where r.order_id = p_order_id for update of d;
    select count(*) into v_bad
    from public.order_refs r left join public.dues d on d.id = r.due_id
    where r.order_id = p_order_id and (d.id is null or d.status <> 'unpaid' or d.user_id <> p_user);
    if v_bad > 0 then
      update public.orders set status = 'failed', fail_code = 'DUES_UNAVAILABLE', updated_at = now() where order_id = p_order_id;
      return jsonb_build_object('ok', false, 'code', 'DUES_UNAVAILABLE', 'message', '이미 납부했거나 정리된 회비가 있어요. 결제는 승인되지 않았어요.');
    end if;
  end if;

  update public.orders set status = 'confirming', updated_at = now() where order_id = p_order_id;
  return jsonb_build_object('ok', true, 'state', 'confirming');
end;
$$;

-- 2단계: 토스페이먼츠 승인 결과를 반영해요.
create or replace function public.finish_confirm(
  p_order_id text, p_success boolean, p_payment_key text, p_payment_type text,
  p_fail_code text, p_fail_message text, p_response jsonb
)
returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  v_order public.orders;
begin
  select * into v_order from public.orders where order_id = p_order_id for update;
  if v_order.order_id is null or v_order.status <> 'confirming' then return; end if;

  insert into public.payment_logs (order_id, success, response) values (p_order_id, p_success, p_response);

  if not p_success then
    update public.orders
    set status = 'failed', fail_code = left(p_fail_code, 100), fail_message = left(p_fail_message, 500), updated_at = now()
    where order_id = p_order_id;
    return;
  end if;

  update public.orders
  set status = 'done', payment_key = p_payment_key, payment_type = p_payment_type, paid_at = now(),
      fail_code = null, fail_message = null, updated_at = now()
  where order_id = p_order_id;

  if v_order.type = 'dues' then
    update public.dues d set status = 'paid', paid_at = now(), method = '토스페이먼츠', order_id = p_order_id
    from public.order_refs r where r.order_id = p_order_id and r.due_id = d.id;
  else
    update public.items i set status = 'sold', buyer_id = v_order.user_id
    from public.order_refs r where r.order_id = p_order_id and r.item_id = i.id;
  end if;
end;
$$;

revoke execute on function public.begin_confirm(text, integer, uuid) from public, anon, authenticated;
revoke execute on function public.finish_confirm(text, boolean, text, text, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.begin_confirm(text, integer, uuid) to service_role;
grant execute on function public.finish_confirm(text, boolean, text, text, text, text, jsonb) to service_role;

/* 오래된 주문 정리 (pg_cron) */
create or replace function public.expire_stale_orders()
returns void
language sql security definer
set search_path = ''
as $$
  update public.orders set status = 'expired', updated_at = now()
  where status = 'ready' and created_at < now() - interval '1 hour';
  update public.orders set status = 'failed', fail_code = coalesce(fail_code, 'CONFIRM_TIMEOUT'), updated_at = now()
  where status = 'confirming' and updated_at < now() - interval '15 minutes';
$$;
revoke execute on function public.expire_stale_orders() from public, anon, authenticated;

/* ======================================================================
 * 클라이언트 RPC 실행 권한: 로그인 사용자만
 * ==================================================================== */
revoke execute on function
  public.get_my_profile(), public.club_member_contacts(uuid),
  public.create_club(text, text, text, text, integer, text, text),
  public.join_club(uuid), public.leave_club(uuid),
  public.approve_member(uuid, uuid), public.reject_member(uuid, uuid),
  public.set_member_role(uuid, uuid, text), public.kick_member(uuid, uuid),
  public.toggle_rsvp(uuid, text), public.mark_dues_paid(uuid[]),
  public.create_order(text, uuid[]), public.record_order_failure(text, text, text)
  from public, anon;
grant execute on function
  public.get_my_profile(), public.club_member_contacts(uuid),
  public.create_club(text, text, text, text, integer, text, text),
  public.join_club(uuid), public.leave_club(uuid),
  public.approve_member(uuid, uuid), public.reject_member(uuid, uuid),
  public.set_member_role(uuid, uuid, text), public.kick_member(uuid, uuid),
  public.toggle_rsvp(uuid, text), public.mark_dues_paid(uuid[]),
  public.create_order(text, uuid[]), public.record_order_failure(text, text, text)
  to authenticated;
