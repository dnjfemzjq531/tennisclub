-- 권한 헬퍼(is_member, is_admin)는 RLS 정책 안에서만 쓰므로 API에 노출되지 않는 private 스키마로 옮겨요.
-- 정책은 함수 OID로 연결돼 있어서 그대로 동작하고, 함수 본문에서 부르는 곳만 다시 만들어요.
create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated, service_role;

alter function public.is_member(uuid) set schema private;
alter function public.is_admin(uuid) set schema private;

create or replace function public.club_member_contacts(p_club uuid)
returns table (user_id uuid, email text, phone text)
language plpgsql stable security definer
set search_path = ''
as $$
begin
  if not private.is_admin(p_club) then
    raise exception '운영진만 연락처를 볼 수 있어요.' using errcode = '42501';
  end if;
  return query
    select p.id, p.email, p.phone
    from public.memberships m join public.profiles p on p.id = m.user_id
    where m.club_id = p_club;
end;
$$;

create or replace function public.approve_member(p_club uuid, p_user uuid)
returns void
language plpgsql security definer
set search_path = ''
as $$
begin
  if not private.is_admin(p_club) then raise exception '운영진만 승인할 수 있어요.' using errcode = '42501'; end if;
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
  if not private.is_admin(p_club) then raise exception '운영진만 거절할 수 있어요.' using errcode = '42501'; end if;
  delete from public.memberships where club_id = p_club and user_id = p_user and status = 'pending';
  if not found then raise exception '대기 중인 신청을 찾을 수 없어요.'; end if;
end;
$$;

create or replace function public.mark_dues_paid(p_ids uuid[])
returns integer
language plpgsql security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  if exists (select 1 from public.dues d where d.id = any (p_ids) and not private.is_admin(d.club_id)) then
    raise exception '운영진만 납부 처리할 수 있어요.' using errcode = '42501';
  end if;
  update public.dues set status = 'paid', paid_at = now(), method = '현금(수기)'
  where id = any (p_ids) and status = 'unpaid';
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;
