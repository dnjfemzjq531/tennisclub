-- 랠리클럽 데모 데이터
-- 데모 계정 8명은 모두 비밀번호가 'rallyclub-demo-2026'이에요. (공개 데모용 테스트 값)
-- 날짜는 실행한 날(한국 시간) 기준 상대값으로 들어가요. 다시 넣으려면 아래 정리 구문부터 실행해요.

delete from public.orders;
delete from public.items;
delete from public.clubs;
delete from auth.users where email like '%@example.com';

/* ---------- 회원 (auth.users → 트리거가 profiles 생성) ---------- */
with u (id, name, email, phone, ntrp) as (values
  ('00000000-0000-4000-a000-000000000001'::uuid, '김테니스', 'demo@example.com',   '010-1234-5678', '3.5'),
  ('00000000-0000-4000-a000-000000000002'::uuid, '이서브',   'serve@example.com',  '010-2222-1111', '4.0'),
  ('00000000-0000-4000-a000-000000000003'::uuid, '박발리',   'volley@example.com', '010-3333-2222', '3.0'),
  ('00000000-0000-4000-a000-000000000004'::uuid, '최스매시', 'smash@example.com',  '010-4444-3333', '4.5'),
  ('00000000-0000-4000-a000-000000000005'::uuid, '정로브',   'lob@example.com',    '010-5555-4444', '2.5'),
  ('00000000-0000-4000-a000-000000000006'::uuid, '한드롭',   'drop@example.com',   '010-6666-5555', '3.0'),
  ('00000000-0000-4000-a000-000000000007'::uuid, '윤에이스', 'ace@example.com',    '010-7777-6666', '3.5'),
  ('00000000-0000-4000-a000-000000000008'::uuid, '강듀스',   'deuce@example.com',  '010-8888-7777', '2.0')
), ins as (
  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change, email_change_token_new
  )
  select '00000000-0000-0000-0000-000000000000', id, 'authenticated', 'authenticated', email,
    extensions.crypt('rallyclub-demo-2026', extensions.gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    jsonb_build_object('name', name, 'phone', phone, 'ntrp', ntrp),
    now() - interval '300 days', now(), '', '', '', ''
  from u
  returning id, email
)
insert into auth.identities (id, user_id, provider_id, provider, identity_data, last_sign_in_at, created_at, updated_at)
select gen_random_uuid(), id, id::text, 'email',
  jsonb_build_object('sub', id::text, 'email', email, 'email_verified', true), now(), now(), now()
from ins;

/* ---------- 클럽 ---------- */
insert into public.clubs (id, name, region, court, description, monthly_fee, approval, tone, owner_id, created_at) values
  ('00000000-0000-4000-b000-000000000001', '그린코트 테니스클럽', '서울 송파', '올림픽공원 테니스장',
   '매주 토요일 오전, 하드코트에서 즐기는 복식 중심 클럽이에요. NTRP 2.5 이상이면 누구나 환영해요.',
   30000, 'manual', 'court', '00000000-0000-4000-a000-000000000001', now() - interval '400 days'),
  ('00000000-0000-4000-b000-000000000002', '새벽발리 TC', '경기 성남', '분당 탄천 테니스장',
   '출근 전 6시, 새벽 공기 마시며 랠리하는 직장인 클럽. 한 시간 빡세게 치고 출근해요.',
   20000, 'auto', 'ball', '00000000-0000-4000-a000-000000000002', now() - interval '300 days'),
  ('00000000-0000-4000-b000-000000000003', '클레이 크루', '서울 마포', '망원한강공원 테니스장',
   '클레이코트를 사랑하는 사람들. 매달 첫째 주는 초보자 레슨 데이로 운영해요.',
   25000, 'manual', 'clay', '00000000-0000-4000-a000-000000000003', now() - interval '150 days');

/* ---------- 멤버십 ---------- */
insert into public.memberships (club_id, user_id, role, status, joined_at)
select ('00000000-0000-4000-b000-00000000000' || c)::uuid, ('00000000-0000-4000-a000-00000000000' || u)::uuid,
       role, status, now() - make_interval(days => d)
from (values
  (1, 1, 'owner', 'active', 400), (1, 4, 'admin', 'active', 380), (1, 2, 'member', 'active', 120),
  (1, 5, 'member', 'active', 120), (1, 6, 'member', 'active', 60), (1, 7, 'member', 'active', 30),
  (1, 8, 'member', 'pending', 2),
  (2, 2, 'owner', 'active', 300), (2, 3, 'admin', 'active', 280), (2, 1, 'member', 'active', 200),
  (2, 7, 'member', 'active', 90),
  (3, 3, 'owner', 'active', 150), (3, 4, 'member', 'active', 120), (3, 6, 'member', 'active', 120),
  (3, 5, 'member', 'pending', 1)
) as m (c, u, role, status, d);

/* ---------- 경기 일정 + 참석 응답 ---------- */
with g (n, c, title, type, off, s, e, court, cap, memo) as (values
  (1, 1, '토요 정기 복식', '정기전', 3, '07:00', '10:00', '올림픽공원 3·4번 코트', 12, '공은 클럽에서 준비해요. 늦으면 첫 게임 대기!'),
  (2, 1, '화요 야간 랠리', '연습', 7, '19:30', '21:30', '올림픽공원 7번 코트 (조명)', 8, '포핸드 크로스 랠리 위주 연습'),
  (3, 1, '월례 클럽 대회', '대회', 10, '08:00', '13:00', '올림픽공원 1~4번 코트', 16, '복식 리그전 후 시상식이 있어요. 참가비는 회비에 포함!'),
  (4, 1, '클레이 크루 교류전', '교류전', 17, '09:00', '12:00', '망원한강공원 테니스장', 12, ''),
  (5, 1, '토요 정기 복식', '정기전', -4, '07:00', '10:00', '올림픽공원 3·4번 코트', 12, ''),
  (6, 2, '새벽 랠리', '정기전', 1, '06:00', '07:30', '탄천 2번 코트', 8, ''),
  (7, 2, '새벽 랠리 + 서브 클리닉', '레슨', 8, '06:00', '07:30', '탄천 2번 코트', 8, ''),
  (8, 3, '초보자 레슨 데이', '레슨', 4, '10:00', '12:00', '망원 클레이 A코트', 10, '')
)
insert into public.games (id, club_id, title, type, date, start_time, end_time, court, capacity, memo, created_by)
select ('00000000-0000-4000-c000-00000000000' || n)::uuid, ('00000000-0000-4000-b000-00000000000' || c)::uuid,
       title, type, public.kst_today() + off, s::time, e::time, court, cap, memo, null
from g;

insert into public.rsvps (game_id, user_id, status)
select ('00000000-0000-4000-c000-00000000000' || g)::uuid, ('00000000-0000-4000-a000-00000000000' || u)::uuid, s
from (values
  (1, 1, 'yes'), (1, 4, 'yes'), (1, 2, 'yes'), (1, 5, 'maybe'), (1, 6, 'yes'), (1, 7, 'no'),
  (2, 4, 'yes'), (2, 6, 'yes'),
  (3, 1, 'yes'), (3, 2, 'yes'), (3, 4, 'yes'), (3, 5, 'yes'), (3, 7, 'maybe'),
  (4, 1, 'maybe'), (4, 4, 'yes'),
  (5, 1, 'yes'), (5, 4, 'yes'), (5, 2, 'yes'), (5, 5, 'yes'), (5, 6, 'yes'), (5, 7, 'yes'),
  (6, 2, 'yes'), (6, 3, 'yes'), (6, 7, 'maybe'),
  (7, 2, 'yes'),
  (8, 3, 'yes'), (8, 6, 'yes')
) as r (g, u, s);

/* ---------- 중고거래 상품 ---------- */
insert into public.items (seller_id, title, category, price, condition, status, created_at, tone, region, description)
select ('00000000-0000-4000-a000-00000000000' || s)::uuid, title, cat, price, cond, status,
       now() - make_interval(days => d), tone, region, descr
from (values
  (4, '윌슨 블레이드 98 v8 (16x19, G2)', '라켓', 180000, '사용감 적음', 'selling', 1, 'court', '서울 송파',
   '3개월 사용했어요. 스트링은 RPM 블라스트 48파운드로 새로 맸어요. 오버그립 새 걸로 감아서 드려요.'),
  (2, '바볼랏 퓨어드라이브 2021', '라켓', 150000, '사용감 있음', 'selling', 2, 'ball', '경기 성남',
   '프레임 상단에 생활 기스 조금 있어요. 성능에는 문제없어요. 직거래는 분당 탄천에서 가능해요.'),
  (6, '아식스 젤 레졸루션 9 (270mm)', '신발', 85000, '거의 새것', 'selling', 3, 'clay', '서울 송파',
   '사이즈 미스로 두 번 신었어요. 올코트용이에요. 박스 있어요.'),
  (3, '헤드 투어 팀 6R 라켓백', '가방', 60000, '사용감 적음', 'selling', 4, 'paper', '서울 마포',
   '라켓 6자루 수납되고 신발 칸 따로 있어요. 내부 깨끗해요.'),
  (1, '던롭 포트 투어 볼 4캔 (미개봉)', '공·소모품', 24000, '새상품', 'selling', 5, 'ball', '서울 송파',
   '대회 기념품으로 받은 미개봉 공이에요. 4캔 일괄 판매해요.'),
  (7, '나이키 코트 드라이핏 폴로 (L)', '의류', 25000, '거의 새것', 'selling', 6, 'court', '서울 송파',
   '한 번 입고 세탁했어요. 정사이즈 L이에요.'),
  (5, '요넥스 이존 100 2022', '라켓', 140000, '사용감 적음', 'reserved', 7, 'clay', '서울 송파',
   '예약 중이에요. 거래가 취소되면 다시 올릴게요.'),
  (4, '테크니파이버 블랙코드 4S 릴 (200m)', '공·소모품', 45000, '새상품', 'sold', 9, 'paper', '서울 송파',
   '판매 완료된 상품이에요.')
) as i (s, title, cat, price, cond, status, d, tone, region, descr);

/* ---------- 회비: 지난 두 달 + 이번 달 ---------- */
insert into public.dues (club_id, user_id, period, amount, status, paid_at, method)
select m.club_id, m.user_id, public.kst_period(o), c.monthly_fee,
       case when unpaid.k is null then 'paid' else 'unpaid' end,
       case when unpaid.k is null then now() + make_interval(days => o * 30 - 2) end,
       case when unpaid.k is null then '토스페이먼츠' end
from public.memberships m
join public.clubs c on c.id = m.club_id
cross join (values (-2), (-1), (0)) as p (o)
left join (values
  ('1:1:-1'), ('1:1:0'), ('1:5:-1'), ('1:5:0'), ('1:2:0'), ('1:7:0'),
  ('2:1:0'), ('2:7:0'), ('3:6:0')
) as unpaid (k)
  on unpaid.k = right(m.club_id::text, 1) || ':' || right(m.user_id::text, 1) || ':' || o
where m.status = 'active';
