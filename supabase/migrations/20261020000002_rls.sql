-- 랠리클럽 권한: 권한 헬퍼 함수, 테이블·컬럼 권한, RLS 정책

/* ---------- 권한 헬퍼 ---------- */
create or replace function public.is_member(p_club uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.memberships m
    where m.club_id = p_club and m.user_id = (select auth.uid()) and m.status = 'active'
  )
$$;

create or replace function public.is_admin(p_club uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.memberships m
    where m.club_id = p_club and m.user_id = (select auth.uid()) and m.status = 'active'
      and m.role in ('owner', 'admin')
  )
$$;

revoke execute on function public.is_member(uuid) from public, anon;
revoke execute on function public.is_admin(uuid) from public, anon;
grant execute on function public.is_member(uuid) to authenticated;
grant execute on function public.is_admin(uuid) to authenticated;

/* ---------- RLS 켜기 ---------- */
alter table public.profiles enable row level security;
alter table public.clubs enable row level security;
alter table public.memberships enable row level security;
alter table public.games enable row level security;
alter table public.rsvps enable row level security;
alter table public.items enable row level security;
alter table public.dues enable row level security;
alter table public.orders enable row level security;
alter table public.order_refs enable row level security;
alter table public.payment_logs enable row level security;

/* ---------- 테이블·컬럼 권한 ----------
 * 기본으로 열려 있는 권한을 모두 거두고 필요한 것만 다시 줘요.
 * 상태를 바꾸는 작업(가입, 승인, 역할, 회비, 주문)은 security definer 함수로만 해요.
 */
revoke all on public.profiles, public.clubs, public.memberships, public.games, public.rsvps,
  public.items, public.dues, public.orders, public.order_refs, public.payment_logs
  from anon, authenticated;

-- profiles: 이름·NTRP만 공개. 이메일·전화·customerKey는 본인(get_my_profile)과 운영진(club_member_contacts)만.
grant select (id, name, ntrp, created_at) on public.profiles to anon, authenticated;
grant update (name, phone, ntrp) on public.profiles to authenticated;

grant select on public.clubs to anon, authenticated;
grant update (name, region, court, description, monthly_fee, approval, tone) on public.clubs to authenticated;

grant select on public.memberships to anon, authenticated;

grant select on public.games to authenticated;
grant insert (club_id, title, type, date, start_time, end_time, court, capacity, memo) on public.games to authenticated;
grant update (title, type, date, start_time, end_time, court, capacity, memo) on public.games to authenticated;
grant delete on public.games to authenticated;

grant select on public.rsvps to authenticated;
grant insert (game_id, status) on public.rsvps to authenticated;
grant update (status, updated_at) on public.rsvps to authenticated;
grant delete on public.rsvps to authenticated;

grant select on public.items to anon, authenticated;
grant insert (title, category, condition, price, region, description, tone) on public.items to authenticated;
grant update (title, category, condition, price, region, description, status) on public.items to authenticated;
grant delete on public.items to authenticated;

grant select on public.dues to authenticated;
grant select on public.orders to authenticated;
grant select on public.order_refs to authenticated;
-- payment_logs: 권한 없음 (service_role 전용)

/* ---------- profiles ---------- */
create policy "프로필은 누구나 조회" on public.profiles
  for select to anon, authenticated using (true);
create policy "본인 프로필만 수정" on public.profiles
  for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

/* ---------- clubs ---------- */
create policy "클럽은 누구나 조회" on public.clubs
  for select to anon, authenticated using (true);
create policy "운영진만 클럽 수정" on public.clubs
  for update to authenticated
  using ((select public.is_admin(id))) with check ((select public.is_admin(id)));

/* ---------- memberships ---------- */
-- 활동 회원 명단은 공개, 대기 신청은 본인과 운영진만
create policy "활동 회원 명단은 공개" on public.memberships
  for select to anon using (status = 'active');
create policy "대기 신청은 본인과 운영진만" on public.memberships
  for select to authenticated
  using (status = 'active' or user_id = (select auth.uid()) or (select public.is_admin(club_id)));

/* ---------- games ---------- */
create policy "클럽 회원만 일정 조회" on public.games
  for select to authenticated using ((select public.is_member(club_id)));
create policy "운영진만 일정 생성" on public.games
  for insert to authenticated with check ((select public.is_admin(club_id)));
create policy "운영진만 일정 수정" on public.games
  for update to authenticated
  using ((select public.is_admin(club_id))) with check ((select public.is_admin(club_id)));
create policy "운영진만 일정 삭제" on public.games
  for delete to authenticated using ((select public.is_admin(club_id)));

/* ---------- rsvps ---------- */
create policy "클럽 회원만 참석 응답 조회" on public.rsvps
  for select to authenticated
  using (exists (select 1 from public.games g where g.id = game_id and (select public.is_member(g.club_id))));
create policy "본인 응답만 생성" on public.rsvps
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.games g
                where g.id = game_id and g.date >= public.kst_today() and (select public.is_member(g.club_id)))
  );
create policy "본인 응답만 수정" on public.rsvps
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.games g
                where g.id = game_id and g.date >= public.kst_today() and (select public.is_member(g.club_id)))
  );
create policy "본인 응답만 삭제" on public.rsvps
  for delete to authenticated
  using (user_id = (select auth.uid())
    and exists (select 1 from public.games g where g.id = game_id and g.date >= public.kst_today()));

/* ---------- items ---------- */
create policy "상품은 누구나 조회" on public.items
  for select to anon, authenticated using (true);
create policy "본인 이름으로만 상품 등록" on public.items
  for insert to authenticated
  with check (seller_id = (select auth.uid()) and status = 'selling' and buyer_id is null);
-- 판매완료(sold)는 결제로만 바뀌어요.
create policy "판매자만 상품 수정" on public.items
  for update to authenticated
  using (seller_id = (select auth.uid()) and status <> 'sold')
  with check (seller_id = (select auth.uid()) and status in ('selling', 'reserved'));
create policy "판매자만 상품 삭제" on public.items
  for delete to authenticated
  using (seller_id = (select auth.uid()) and status <> 'sold');

/* ---------- dues ---------- */
create policy "본인 회비와 운영진 조회" on public.dues
  for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_admin(club_id)));

/* ---------- orders ---------- */
create policy "본인 주문만 조회" on public.orders
  for select to authenticated using (user_id = (select auth.uid()));
create policy "본인 주문 항목만 조회" on public.order_refs
  for select to authenticated
  using (exists (select 1 from public.orders o where o.order_id = order_refs.order_id and o.user_id = (select auth.uid())));
