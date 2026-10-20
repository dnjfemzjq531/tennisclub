-- 랠리클럽 기본 스키마: 테이블, 제약조건, 인덱스

/* ---------- 날짜 헬퍼 (한국 시간 기준) ---------- */
create or replace function public.kst_today()
returns date
language sql stable
set search_path = ''
as $$ select (now() at time zone 'Asia/Seoul')::date $$;

create or replace function public.kst_period(offset_months integer default 0)
returns text
language sql stable
set search_path = ''
as $$
  select to_char(date_trunc('month', now() at time zone 'Asia/Seoul') + make_interval(months => offset_months), 'YYYY-MM')
$$;

/* ---------- 회원 프로필 ---------- */
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 30),
  email text not null,
  phone text not null default '',
  ntrp text not null default '3.0' check (ntrp ~ '^[1-7]\.[05]$'),
  customer_key uuid not null unique default gen_random_uuid(),
  created_at timestamptz not null default now()
);

/* ---------- 클럽 ---------- */
create table public.clubs (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 30),
  region text not null check (char_length(region) between 1 and 40),
  court text not null check (char_length(court) between 1 and 60),
  description text not null default '' check (char_length(description) <= 200),
  monthly_fee integer not null default 0 check (monthly_fee between 0 and 1000000),
  approval text not null default 'manual' check (approval in ('auto', 'manual')),
  tone text not null default 'court' check (tone in ('court', 'ball', 'clay', 'paper')),
  owner_id uuid not null references public.profiles (id),
  created_at timestamptz not null default now()
);
create index clubs_owner_id_idx on public.clubs (owner_id);

/* ---------- 멤버십 ---------- */
create table public.memberships (
  club_id uuid not null references public.clubs (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'admin', 'member')),
  status text not null default 'pending' check (status in ('active', 'pending')),
  joined_at timestamptz not null default now(),
  primary key (club_id, user_id)
);
create index memberships_user_id_idx on public.memberships (user_id);
-- 클럽마다 owner는 정확히 한 명
create unique index memberships_one_owner on public.memberships (club_id) where role = 'owner';

/* ---------- 경기 일정 ---------- */
create table public.games (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 40),
  type text not null default '정기전' check (type in ('정기전', '연습', '대회', '교류전', '레슨')),
  date date not null,
  start_time time not null,
  end_time time not null,
  court text not null check (char_length(court) between 1 and 60),
  capacity integer not null default 12 check (capacity between 2 and 64),
  memo text not null default '' check (char_length(memo) <= 200),
  created_by uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  check (end_time > start_time)
);
create index games_club_date_idx on public.games (club_id, date);
create index games_created_by_idx on public.games (created_by);

/* ---------- 참석 응답 ---------- */
create table public.rsvps (
  game_id uuid not null references public.games (id) on delete cascade,
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  status text not null check (status in ('yes', 'maybe', 'no')),
  updated_at timestamptz not null default now(),
  primary key (game_id, user_id)
);
create index rsvps_user_id_idx on public.rsvps (user_id);

/* ---------- 중고거래 상품 ---------- */
create table public.items (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  buyer_id uuid references public.profiles (id) on delete set null,
  title text not null check (char_length(title) between 1 and 50),
  category text not null check (category in ('라켓', '신발', '가방', '의류', '공·소모품', '기타')),
  condition text not null check (condition in ('새상품', '거의 새것', '사용감 적음', '사용감 있음')),
  price integer not null check (price between 1000 and 100000000),
  region text not null check (char_length(region) between 1 and 40),
  description text not null default '' check (char_length(description) <= 500),
  status text not null default 'selling' check (status in ('selling', 'reserved', 'sold')),
  tone text not null default 'court' check (tone in ('court', 'ball', 'clay', 'paper')),
  created_at timestamptz not null default now()
);
create index items_seller_id_idx on public.items (seller_id);
create index items_buyer_id_idx on public.items (buyer_id);
create index items_created_at_idx on public.items (created_at desc);

/* ---------- 회비 ---------- */
create table public.dues (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  period text not null check (period ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  amount integer not null check (amount >= 0),
  status text not null default 'unpaid' check (status in ('unpaid', 'paid')),
  paid_at timestamptz,
  method text,
  order_id text,
  created_at timestamptz not null default now(),
  unique (club_id, user_id, period)
);
create index dues_user_id_idx on public.dues (user_id);

/* ---------- 결제 주문서 ---------- */
create table public.orders (
  order_id text primary key check (order_id ~ '^[A-Za-z0-9_-]{6,64}$'),
  user_id uuid not null references public.profiles (id) on delete cascade,
  type text not null check (type in ('dues', 'market')),
  order_name text not null check (char_length(order_name) between 1 and 100),
  amount integer not null check (amount > 0),
  status text not null default 'ready' check (status in ('ready', 'confirming', 'done', 'failed', 'expired')),
  payment_key text,
  payment_type text,
  fail_code text,
  fail_message text,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index orders_user_id_idx on public.orders (user_id);
create index orders_status_created_idx on public.orders (status, created_at);

alter table public.dues
  add constraint dues_order_id_fkey foreign key (order_id) references public.orders (order_id) on delete set null;
create index dues_order_id_idx on public.dues (order_id);

create table public.order_refs (
  id bigint generated always as identity primary key,
  order_id text not null references public.orders (order_id) on delete cascade,
  due_id uuid references public.dues (id) on delete set null,
  item_id uuid references public.items (id) on delete set null,
  check (num_nonnulls(due_id, item_id) <= 1)
);
create index order_refs_order_id_idx on public.order_refs (order_id);
create index order_refs_due_id_idx on public.order_refs (due_id);
create index order_refs_item_id_idx on public.order_refs (item_id);

-- 토스페이먼츠 승인 응답 원문. 클라이언트에서는 볼 수 없어요(서비스 롤 전용).
create table public.payment_logs (
  id bigint generated always as identity primary key,
  order_id text not null references public.orders (order_id) on delete cascade,
  success boolean not null,
  response jsonb,
  created_at timestamptz not null default now()
);
create index payment_logs_order_id_idx on public.payment_logs (order_id);
