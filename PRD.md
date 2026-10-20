# 랠리클럽 Supabase 연동 PRD

- 작성일: 2026년 10월 20일
- 대상: 랠리클럽 퍼블리싱 시안 (`localStorage` 목업 → Supabase 실서비스)
- 범위: 인증, 데이터베이스, 권한(RLS), 결제 승인 서버, 배포 설정

---

## 1. 배경과 목표

### 1.1 현재 상태

- 모든 데이터가 브라우저 `localStorage`(`rallyclub_db_v1`)에 저장돼요. 브라우저마다 데이터가 따로 놀고, 다른 회원과 공유되지 않아요.
- 로그인은 이메일만 맞으면 통과해요. 비밀번호를 확인하지 않아요.
- 권한 확인(`TC.isAdmin`, `TC.isOwner`)이 화면에서만 이뤄져요. 콘솔에서 `TC.updateClub()`을 부르면 누구나 클럽을 고칠 수 있어요.
- 토스페이먼츠 결제 승인 API를 호출하지 않고 `success.js`에서 바로 완료 처리해요. 승인을 안 하면 결제가 10분 뒤 만료돼요.

### 1.2 목표

1. 회원·클럽·일정·회비·중고거래 데이터를 Supabase Postgres에 저장해서 모든 회원이 같은 데이터를 봐요.
2. Supabase Auth로 실제 회원가입·로그인을 해요.
3. 권한 모델(owner / admin / member)을 RLS와 DB 함수로 **서버에서** 강제해요.
4. 토스페이먼츠 결제 승인을 Supabase Edge Function에서 시크릿 키로 처리해요.
5. 빌드 도구 없는 순수 HTML·JS 구조는 그대로 유지해요.

### 1.3 범위 밖

- 디자인·마크업 변경 (데이터 연동에 꼭 필요한 로딩·에러 상태만 추가)
- 네이티브 앱, 관리자 백오피스
- 결제 취소·환불 자동화 (P2에서 검토)

---

## 2. 기술 구성

| 항목 | 결정 |
| --- | --- |
| 클라이언트 SDK | `@supabase/supabase-js@2` UMD 번들을 jsDelivr CDN에서 버전 고정해서 불러와요 |
| 설정 파일 | `js/supabase-config.js` (프로젝트 URL, publishable 키). 공개돼도 되는 값만 둬요 |
| 데이터 계층 | `js/store.js`의 전역 `TC` API 이름은 유지하고 내부만 Supabase 호출로 바꿔요 |
| 서버 로직 | Postgres 함수(RPC) + RLS, 결제 승인은 Edge Function |
| 정기 작업 | `pg_cron`으로 매월 1일 회비 레코드 생성 |
| 시크릿 | 토스 시크릿 키, `service_role` 키는 Edge Function 시크릿에만 둬요. 브라우저 코드·저장소에 넣지 않아요 |

스크립트 로드 순서는 아래처럼 바뀌어요.

```
supabase-js (CDN) → js/supabase-config.js → js/store.js → js/ui.js → (js/toss-config.js) → js/pages/<page>.js
```

### 2.1 가장 큰 변경: 동기 API → 비동기 API

지금 `TC.*`는 전부 동기 함수예요. Supabase 호출은 `Promise`를 돌려주므로 **모든 페이지 스크립트가 `async/await`로 바뀌어야 해요.**

- 각 페이지 IIFE를 `(async function () { ... })()`로 바꾸고, 렌더 전에 데이터를 `await`로 받아요.
- `UI.renderHeader()`도 로그인 사용자·내 클럽을 비동기로 받아야 해요. 헤더는 먼저 비로그인 상태로 그리고, 세션을 확인한 뒤 다시 그려요.
- 데이터를 기다리는 동안 보여줄 스켈레톤(또는 로딩 문구)과 실패 시 `toast` 에러 처리를 공통으로 추가해요.

---

## 3. 데이터 모델

`localStorage` 구조를 정규화해서 옮겨요. 모든 테이블은 `public` 스키마에 두고 RLS를 켜요.

### 3.1 테이블

**`profiles`** — Supabase Auth 사용자 1:1 프로필

| 컬럼 | 타입 | 비고 |
| --- | --- | --- |
| `id` | `uuid` PK | `auth.users.id` 참조, 삭제 시 cascade |
| `name` | `text` not null | |
| `email` | `text` not null | 표시용 사본. 로그인은 `auth.users`로 해요 |
| `phone` | `text` | 같은 클럽 활동 회원에게만 공개 |
| `ntrp` | `text` | `'1.0'`~`'7.0'` |
| `customer_key` | `uuid` not null unique | 토스페이먼츠 `customerKey`. 기본값 `gen_random_uuid()` |
| `created_at` | `timestamptz` | 기본값 `now()` |

**`clubs`**

| 컬럼 | 타입 | 비고 |
| --- | --- | --- |
| `id` | `uuid` PK | |
| `name` | `text` not null | 30자 이하 |
| `region` | `text` not null | |
| `court` | `text` not null | |
| `description` | `text` | 200자 이하 (현재 필드명 `desc`) |
| `monthly_fee` | `integer` not null | `>= 0` |
| `approval` | `text` | `'auto' \| 'manual'` |
| `tone` | `text` | `'court' \| 'ball' \| 'clay'` |
| `owner_id` | `uuid` | `profiles.id` |
| `created_at` | `timestamptz` | |

**`memberships`**

| 컬럼 | 타입 | 비고 |
| --- | --- | --- |
| `club_id` | `uuid` | PK(`club_id`, `user_id`) |
| `user_id` | `uuid` | |
| `role` | `text` | `'owner' \| 'admin' \| 'member'` |
| `status` | `text` | `'active' \| 'pending'` |
| `joined_at` | `timestamptz` | 승인 시점으로 갱신 |

- 클럽마다 owner는 정확히 한 명이에요. `unique (club_id) where role = 'owner'` 부분 인덱스로 보장해요.

**`games`** — 경기 일정

| 컬럼 | 타입 | 비고 |
| --- | --- | --- |
| `id` | `uuid` PK | |
| `club_id` | `uuid` | |
| `title` | `text` | 40자 이하 |
| `type` | `text` | `정기전·연습·대회·교류전·레슨` |
| `date` | `date` | |
| `start_time`, `end_time` | `time` | `end_time > start_time` |
| `court` | `text` | |
| `capacity` | `integer` | 2~64 |
| `memo` | `text` | 200자 이하 |
| `created_by` | `uuid` | |

**`rsvps`** — 참석 응답 (현재 `games.rsvps` 객체를 분리)

| 컬럼 | 타입 | 비고 |
| --- | --- | --- |
| `game_id` | `uuid` | PK(`game_id`, `user_id`) |
| `user_id` | `uuid` | |
| `status` | `text` | `'yes' \| 'maybe' \| 'no'` |
| `updated_at` | `timestamptz` | |

**`items`** — 중고거래 상품

| 컬럼 | 타입 | 비고 |
| --- | --- | --- |
| `id` | `uuid` PK | |
| `seller_id` | `uuid` | |
| `buyer_id` | `uuid` null | 결제 완료 시 채워요 |
| `title` | `text` | 50자 이하 |
| `category` | `text` | `라켓·신발·가방·의류·공·소모품·기타` |
| `condition` | `text` | |
| `price` | `integer` | `>= 1000` |
| `region` | `text` | |
| `description` | `text` | 500자 이하 |
| `status` | `text` | `'selling' \| 'reserved' \| 'sold'` |
| `tone` | `text` | 카드 일러스트 색 |
| `created_at` | `timestamptz` | |

**`dues`** — 회비

| 컬럼 | 타입 | 비고 |
| --- | --- | --- |
| `id` | `uuid` PK | |
| `club_id`, `user_id` | `uuid` | |
| `period` | `text` | `YYYY-MM`. unique(`club_id`, `user_id`, `period`) |
| `amount` | `integer` | 생성 시점의 `clubs.monthly_fee` |
| `status` | `text` | `'unpaid' \| 'paid'` |
| `paid_at` | `timestamptz` null | |
| `method` | `text` null | `'토스페이먼츠' \| '현금(수기)'` |
| `order_id` | `text` null | |

**`orders`** — 결제 주문서

| 컬럼 | 타입 | 비고 |
| --- | --- | --- |
| `order_id` | `text` PK | `RC-…` 6~64자 |
| `user_id` | `uuid` | |
| `type` | `text` | `'dues' \| 'market'` |
| `order_name` | `text` | 100자 이하 |
| `amount` | `integer` | **서버가 계산한 금액** |
| `status` | `text` | `'ready' \| 'done' \| 'failed' \| 'expired'` |
| `payment_key` | `text` null | |
| `payment_type` | `text` null | |
| `paid_at` | `timestamptz` null | |
| `raw_response` | `jsonb` null | 토스 승인 응답 원문 (본인만 조회 불가, 운영 확인용) |
| `created_at` | `timestamptz` | |

**`order_refs`** — 주문과 회비·상품 연결 (현재 `orders.refs` 배열을 분리)

| 컬럼 | 타입 | 비고 |
| --- | --- | --- |
| `order_id` | `text` | |
| `due_id` | `uuid` null | type이 `dues`일 때 |
| `item_id` | `uuid` null | type이 `market`일 때 |

### 3.2 뷰

- `club_list_view`: 클럽 목록 + 활동 회원 수 (`TC.clubs()`, `TC.memberCount()` 대체)
- `game_rsvp_summary`: 일정별 참석·미정·불참 인원 수

---

## 4. 권한(RLS) 정책

헬퍼 함수 두 개를 `security definer`로 만들어서 정책에서 써요.

- `is_member(club uuid)`: 내가 그 클럽의 `active` 회원인가
- `is_admin(club uuid)`: 내가 그 클럽의 `active` owner 또는 admin인가

| 테이블 | 조회 | 생성 | 수정 | 삭제 |
| --- | --- | --- | --- | --- |
| `profiles` | 본인 전체 / 같은 클럽 활동 회원은 전화번호 포함 / 그 외는 이름·NTRP만 (뷰로 분리) | 가입 트리거 | 본인 | 불가 (계정 탈퇴로 처리) |
| `clubs` | 누구나 (비로그인 포함) | 로그인 사용자, RPC로만 | `is_admin` | owner만 (P2) |
| `memberships` | 같은 클럽 활동 회원, 본인 행 | RPC `join_club`로만 | RPC로만 | RPC로만 |
| `games` | `is_member` | `is_admin` | `is_admin` | `is_admin` |
| `rsvps` | `is_member` | 본인 + `is_member` | 본인 | 본인 |
| `items` | 누구나 | 로그인 사용자 (`seller_id = auth.uid()`) | 판매자 본인 (`status`는 `selling·reserved`만) | 판매자 본인, `sold`가 아닐 때 |
| `dues` | 본인 행 / `is_admin` | 함수·크론으로만 | `is_admin`이 수기 납부만 (RPC) | 불가 |
| `orders`, `order_refs` | 본인 | RPC `create_order`로만 | Edge Function(`service_role`)만 | 불가 |

> 클라이언트가 `status`, `amount`, `role`처럼 민감한 컬럼을 직접 바꾸지 못하도록, 상태를 바꾸는 작업은 아래 RPC로 모아요.

---

## 5. 기능 목록

우선순위: **P0** 출시 필수 · **P1** 출시 직후 · **P2** 이후 검토

### 5.1 인증·회원 (`auth.html`, 헤더)

| ID | 기능 | 현재 `TC` | Supabase 구현 | 우선순위 |
| --- | --- | --- | --- | --- |
| A-1 | 이메일·비밀번호 회원가입 | `signup` | `auth.signUp()` + `options.data`에 이름·전화·NTRP. `on_auth_user_created` 트리거가 `profiles` 행 생성 | P0 |
| A-2 | 로그인 (비밀번호 확인) | `login` | `auth.signInWithPassword()` | P0 |
| A-3 | 로그아웃 | `logout` | `auth.signOut()` | P0 |
| A-4 | 세션 유지·현재 사용자 | `me` | `auth.getSession()` + `profiles` 조회, `onAuthStateChange`로 헤더 갱신 | P0 |
| A-5 | 로그인 필요 페이지 보호 | `UI.requireLogin` | 세션 없으면 `auth.html?next=…`로 이동 (기존 `next` 검증 유지) | P0 |
| A-6 | 이메일 인증 | 없음 | Supabase 이메일 확인 사용 여부 결정, 리다이렉트 URL에 Vercel 도메인 등록 | P1 |
| A-7 | 비밀번호 재설정 | 없음 | `resetPasswordForEmail()` + 재설정 화면 | P1 |
| A-8 | 프로필 수정 (이름·전화·NTRP) | 없음 | `profiles` update | P1 |
| A-9 | 데모 로그인 | `loginDemo` | 데모 계정으로 `signInWithPassword` 하거나 운영 환경에서는 버튼 숨김 | P1 |
| A-10 | 소셜 로그인 (카카오 등) | 없음 | Supabase OAuth 공급자 | P2 |

### 5.2 클럽 (`clubs.html`, `members.html`)

| ID | 기능 | 현재 `TC` | Supabase 구현 | 우선순위 |
| --- | --- | --- | --- | --- |
| C-1 | 클럽 목록 + 회원 수 | `clubs`, `memberCount` | `club_list_view` select | P0 |
| C-2 | 클럽 상세 | `club` | `clubs` select by id | P0 |
| C-3 | 클럽 만들기 | `createClub` | RPC `create_club(...)`: 클럽 생성 + owner 멤버십 + 이번 달 회비를 한 트랜잭션으로 | P0 |
| C-4 | 클럽 설정 수정 | `updateClub` | `clubs` update (RLS `is_admin`) | P0 |
| C-5 | 내 클럽 목록 | `myClubs` | `memberships` join `clubs` where 본인·active | P0 |
| C-6 | 현재 선택 클럽 기억 | `currentClubId`, `setCurrentClub` | 기기별 선호라서 `localStorage`(`rallyclub_club_v1`) 유지 | P0 |
| C-7 | 클럽 삭제 | 없음 | owner 전용 RPC, 미납·진행 중 주문이 있으면 막기 | P2 |
| C-8 | 클럽 검색·지역 필터 | 화면 필터 | 클럽 수가 늘면 `ilike` 검색으로 서버 이관 | P2 |

### 5.3 멤버십·권한 (`members.html`)

| ID | 기능 | 현재 `TC` | Supabase 구현 | 우선순위 |
| --- | --- | --- | --- | --- |
| M-1 | 가입 신청 / 바로 가입 | `joinClub` | RPC `join_club(club)`: `approval`에 따라 `active`/`pending`, active면 이번 달 회비 생성 | P0 |
| M-2 | 가입 신청 취소 | `leaveClub` | RPC `leave_club(club)` (본인 pending 행 삭제) | P0 |
| M-3 | 클럽 탈퇴 | `leaveClub` | RPC `leave_club(club)`: owner는 불가, 미납 회비 정리 | P0 |
| M-4 | 회원·대기자 목록 | `members` | `memberships` join `profiles`, 역할 순 정렬 | P0 |
| M-5 | 가입 승인 | `approve` | RPC `approve_member(club, user)`: `is_admin` 확인, active 전환 + 회비 생성 | P0 |
| M-6 | 가입 거절 | `reject` | RPC `reject_member(club, user)` | P0 |
| M-7 | 역할 변경 | `setRole` | RPC `set_member_role(club, user, role)`: **owner만**, owner 역할은 부여·변경 불가 | P0 |
| M-8 | 회원 내보내기 | `leaveClub(club, user)` | RPC `kick_member(club, user)`: 일반 회원은 admin 이상, admin은 owner만, owner는 불가 | P0 |
| M-9 | 권한 확인 | `isAdmin`, `isOwner` | 내 멤버십 1회 조회 후 캐시. 실제 강제는 RLS·RPC가 해요 | P0 |
| M-10 | owner 위임 | 없음 | RPC `transfer_ownership` | P2 |

### 5.4 일정·참석 (`schedule.html`, `index.html`)

| ID | 기능 | 현재 `TC` | Supabase 구현 | 우선순위 |
| --- | --- | --- | --- | --- |
| G-1 | 클럽 일정 목록 | `games` | `games` + `rsvps` select, 날짜·시작시간 정렬 | P0 |
| G-2 | 일정 상세 | `game` | 단건 select | P0 |
| G-3 | 일정 만들기 | `createGame` | insert (RLS `is_admin`) | P0 |
| G-4 | 일정 삭제 | `deleteGame` | delete (RLS `is_admin`, rsvps cascade) | P0 |
| G-5 | 참석 응답·취소 (토글) | `rsvp` | `rsvps` upsert / delete. 같은 값을 다시 누르면 삭제 | P0 |
| G-6 | 정원 초과 막기 | 없음 | `yes` 인원이 `capacity`를 넘으면 거부하는 트리거 | P1 |
| G-7 | 홈 다가오는 일정 | `upcomingGames` | 내 클럽들의 `date >= today` 일정 limit 5 | P0 |
| G-8 | 일정 수정 | 없음 | update (RLS `is_admin`) + 수정 폼 | P1 |
| G-9 | 참석 현황 실시간 반영 | 없음 | Supabase Realtime으로 `rsvps` 구독 | P2 |

### 5.5 회비 (`dues.html`, `members.html`)

| ID | 기능 | 현재 `TC` | Supabase 구현 | 우선순위 |
| --- | --- | --- | --- | --- |
| D-1 | 내 회비 내역 | `dues` | `dues` select 본인·클럽 | P0 |
| D-2 | 이번 달 회비 자동 생성 | `ensureDues` (조회할 때마다) | `pg_cron` 매월 1일 00:05 KST에 `generate_monthly_dues()`. 가입·승인 RPC에서도 이번 달분 생성. 클라이언트에서는 만들지 않아요 | P0 |
| D-3 | 운영진 월별 납부 현황 | `clubDues`, `duePeriods` | RPC `club_dues(club, period)` (`is_admin`), 기간 목록은 distinct `period` | P0 |
| D-4 | 현금 수기 납부 처리 | `markDuesPaid` | RPC `mark_dues_paid(ids[])`: 대상 회비 클럽에 `is_admin`인지 확인 | P0 |
| D-5 | 홈 미납 요약 | `unpaidSummary` | 미납 합계·건수 집계 쿼리 | P0 |
| D-6 | 회비 금액 변경 반영 | 없음 | 변경 후 생성분부터 새 금액, 이미 생성된 미납분은 유지 (정책 확정 필요) | P1 |
| D-7 | 미납 알림 보내기 | 토스트만 (가짜) | Edge Function + 이메일(또는 알림톡) 발송 | P2 |

### 5.6 중고거래 (`market.html`)

| ID | 기능 | 현재 `TC` | Supabase 구현 | 우선순위 |
| --- | --- | --- | --- | --- |
| I-1 | 상품 목록 | `items` | `items` + 판매자 이름 select, 최신순 | P0 |
| I-2 | 카테고리·검색·정렬·판매중 필터 | 화면 필터 | 1차는 화면 필터 유지, 상품이 많아지면 서버 쿼리 + 페이지네이션 | P0 / P1 |
| I-3 | 상품 상세 | `item` | 단건 select | P0 |
| I-4 | 상품 등록 | `createItem` | insert (`seller_id = auth.uid()`, `status = 'selling'` 기본값) | P0 |
| I-5 | 판매 상태 변경 | `updateItem` | 판매자만 `selling ↔ reserved`. `sold`는 결제로만 | P0 |
| I-6 | 상품 삭제 | `deleteItem` | 판매자 본인, `sold`가 아닐 때 | P0 |
| I-7 | 상품 사진 업로드 | 없음 (SVG 일러스트) | Supabase Storage `item-images` 버킷 + 이미지 경로 컬럼 | P1 |
| I-8 | 내 판매·구매 내역 | 없음 | `seller_id` / `buyer_id` 필터 | P1 |
| I-9 | 상품 정보 수정 | 없음 | update + 수정 폼 | P1 |

### 5.7 결제 (`checkout.html`, `success.html`, `fail.html`)

| ID | 기능 | 현재 `TC` | Supabase 구현 | 우선순위 |
| --- | --- | --- | --- | --- |
| P-1 | 주문서 생성 | `createOrder` (클라이언트가 금액 결정) | RPC `create_order(type, refs[])`: **서버가 DB의 회비·상품 가격으로 금액을 계산**하고 주문명을 만들어요. 본인 미납 회비인지, 판매 중이고 본인 상품이 아닌지 확인 | P0 |
| P-2 | 결제 화면 주문 조회 | `order` | 본인 주문 select, `status = 'ready'`가 아니면 결제 막기 | P0 |
| P-3 | `customerKey` | `profiles.customer_key` | 로그인 사용자 프로필에서 읽어요 | P0 |
| P-4 | 결제 승인 | 없음 (바로 완료) | Edge Function `payments-confirm`: `success.html`이 `paymentKey·orderId·amount`를 보내면 ① 주문 소유자 확인 ② 금액 일치 확인 ③ 토스 `POST /v1/payments/confirm` 호출(시크릿 키) ④ 성공 시 한 트랜잭션으로 주문 `done` + 회비 `paid` 또는 상품 `sold`·`buyer_id` 처리 | P0 |
| P-5 | 중복 승인 방지 | `status === 'done'` 확인 | 주문 행 잠금(`for update`) + 이미 `done`이면 저장된 결과 반환 | P0 |
| P-6 | 상품 이중 판매 방지 | 없음 | 주문 생성 시 상품을 잠깐 `reserved`로 잡거나, 승인 직전에 `selling`인지 재확인하고 아니면 승인 취소 | P0 |
| P-7 | 결제 실패 기록 | `fail.js` 화면만 | 실패 코드·메시지로 주문 `failed` 처리 | P1 |
| P-8 | 미승인 주문 만료 | 없음 | `pg_cron`으로 30분 지난 `ready` 주문을 `expired` 처리, 잡아둔 상품 풀기 | P1 |
| P-9 | 결제 상태 웹훅 | 없음 | Edge Function `payments-webhook`으로 토스 웹훅 수신 | P2 |
| P-10 | 결제 취소·환불 | 없음 | 운영진 전용 Edge Function, 토스 취소 API | P2 |

### 5.8 공통·운영

| ID | 기능 | 현재 | Supabase 구현 | 우선순위 |
| --- | --- | --- | --- | --- |
| O-1 | 시드 데이터 | `seed()` | `supabase/seed.sql`로 데모 클럽·일정·상품 이관 (개발 브랜치 전용) | P0 |
| O-2 | 데모 데이터 초기화 버튼 | `TC.reset()` | 운영 환경에서는 버튼 제거. 로컬 캐시(`rallyclub_club_v1`)만 지우는 동작으로 축소 | P0 |
| O-3 | 마이그레이션 관리 | 없음 | `supabase/migrations/*.sql`로 스키마를 저장소에 기록 | P0 |
| O-4 | 보안 점검 | 없음 | 배포 전 Supabase advisors(보안·성능) 경고 0건 | P0 |
| O-5 | 공통 로딩·에러 처리 | 없음 | `UI.loading()`, 실패 시 `toast(…, 'error')` | P0 |
| O-6 | 기존 `localStorage` 데이터 | 있음 | 이관하지 않아요. 연동 후 `rallyclub_db_v1`, `rallyclub_session_v1` 키를 지워요 | P0 |

---

## 6. 결제 흐름 (변경 후)

```
dues.js / market.js
  └─ rpc('create_order', { type, refs })        ← 서버가 금액 계산
       └─ checkout.html?orderId=…
            └─ TossPayments(CLIENT_KEY).widgets({ customerKey })
                 setAmount(order.amount) → requestPayment()
                      └─ success.html?paymentKey&orderId&amount
                           └─ functions.invoke('payments-confirm', {...})
                                ├─ 금액·소유자 확인
                                ├─ POST https://api.tosspayments.com/v1/payments/confirm  (시크릿 키)
                                └─ 주문 done + 회비 paid / 상품 sold  (한 트랜잭션)
```

- 브라우저는 `api.tosspayments.com`을 직접 부르지 않아요.
- 시크릿 키는 `supabase secrets set TOSS_SECRET_KEY=…`로만 넣어요. 클라이언트 키(`test_ck_`/`live_ck_`)만 `js/toss-config.js`에 둬요.
- 승인 응답이 오기 전에는 화면에 "결제 확인 중" 상태를 보여주고, 실패하면 `fail.html`로 보내요.

---

## 7. 비기능 요구사항

- **보안**: 모든 테이블 RLS 켜기. `service_role` 키는 Edge Function에서만 사용. 사용자 입력은 계속 `UI.esc()`로 출력.
- **개인정보**: 전화번호는 같은 클럽 활동 회원에게만 보여요. 이메일은 본인만 봐요.
- **시간대**: 날짜 계산(`today`, `period`)은 서버에서 `Asia/Seoul` 기준으로 해요.
- **성능**: 페이지마다 쿼리 3회 이내를 목표로 하고, 필요한 경우 뷰·RPC로 묶어요. 외래키 컬럼에 인덱스를 둬요.
- **호환성**: 빌드 없이 동작해야 해요. `file://`은 여전히 지원하지 않아요.
- **배포**: Supabase Auth의 Site URL·Redirect URL에 `http://localhost:5500`과 `https://tennisclub-peach.vercel.app`을 등록해요.

---

## 8. 구현 단계

| 단계 | 내용 | 완료 기준 |
| --- | --- | --- |
| 1. 기반 | Supabase 프로젝트 준비, 마이그레이션(테이블·RLS·헬퍼 함수), 시드, `supabase-config.js`, 비동기 `TC` 뼈대 | 로컬에서 Supabase 연결 확인, advisors 경고 0건 |
| 2. 인증 | A-1~A-5, 헤더 비동기 렌더 | 가입·로그인·로그아웃·보호 페이지 이동이 동작 |
| 3. 클럽·멤버십 | C-1~C-6, M-1~M-9 | 다른 브라우저 두 개(owner, member)로 권한 시나리오 통과 |
| 4. 일정 | G-1~G-5, G-7 | 운영진만 일정 생성·삭제, 회원 참석 응답 반영 |
| 5. 회비 | D-1~D-5, 월 회비 크론 | 승인 시 회비 생성, 수기 납부, 홈 미납 요약 일치 |
| 6. 중고거래 | I-1~I-6 | 판매자만 수정·삭제 |
| 7. 결제 | P-1~P-6, Edge Function 배포 | 토스 테스트 결제로 회비·상품 결제 완료, 금액 조작 시 거절 |
| 8. 정리 | O-1~O-6, CLAUDE.md 갱신, Vercel 배포 | 운영 URL에서 전체 흐름 확인 |

---

## 9. 테스트 시나리오 (P0)

1. 비로그인 사용자는 클럽 목록·상품 목록은 보지만, 일정·회비·회원 목록은 못 봐요.
2. 일반 회원이 콘솔에서 `supabase.from('clubs').update(...)`를 불러도 실패해요.
3. admin은 일반 회원을 내보낼 수 있지만, 다른 admin과 owner는 못 내보내요.
4. owner만 역할을 바꿀 수 있고, owner 역할은 누구에게도 줄 수 없어요.
5. `manual` 클럽 가입 신청 → 운영진 승인 → 이번 달 회비가 생겨요.
6. `success.html?amount=` 값을 바꾸면 승인이 거절되고 주문은 `ready`로 남아요.
7. 같은 `success.html`을 새로고침해도 결제가 두 번 처리되지 않아요.
8. 두 사람이 같은 상품을 동시에 결제하면 한 명만 성공해요.
9. 본인 상품은 구매 버튼이 보이지 않고, RPC로 주문을 만들어도 거절돼요.

---

## 10. 열린 질문

1. ~~**Supabase 프로젝트**~~: 2026년 10월 20일 랠리클럽 전용 프로젝트 `rallyclub`(ref `fnbwfnamydzuorqetbod`, 서울 `ap-northeast-2`)를 무료 플랜으로 만들었어요. 유료 기능(브랜치 등)은 쓰지 않아요.
2. **이메일 인증**: 가입 직후 바로 로그인할지, 이메일 확인 후 로그인할지.
3. **회비 금액 변경 정책**: 이미 생성된 이번 달 미납 회비에 새 금액을 반영할지.
4. **중고거래 결제 모델**: 지금처럼 플랫폼이 대금을 받는 구조로 갈지, 직거래 연락만 이어줄지. 대금을 받으면 정산·환불 정책이 필요해요.
5. **데모 모드**: 운영 사이트에서 데모 계정 로그인을 남길지.

---

## 11. 진행 현황 (2026년 10월 20일)

### 완료

| 영역 | 완료 항목 |
| --- | --- |
| 인증·회원 | A-1~A-5, A-7 비밀번호 재설정, A-8 내 정보 수정, A-9 데모 로그인(`supabase-config.js`의 `DEMO_ACCOUNT`) |
| 클럽 | C-1~C-6 (C-1은 뷰 대신 `memberships` 조회로 회원 수 계산) |
| 멤버십 | M-1~M-9 (모두 RPC로 서버에서 권한 확인) |
| 일정 | G-1~G-5, G-6 정원 초과 막기(트리거), G-7 |
| 회비 | D-1~D-5, 월 회비 크론. D-6은 "바뀐 금액은 다음에 만들어지는 회비부터" 정책으로 동작 |
| 중고거래 | I-1~I-6, I-8 내 거래 필터, I-9 상품 수정 |
| 결제 | P-1~P-8 (Edge Function `payments-confirm`, 금액 서버 계산, 중복·이중 판매 방지, 실패 기록, 주문 만료 크론) |
| 공통 | O-1~O-6 (보안 점검: 남은 경고는 의도된 RPC 실행 권한 12건, `payment_logs` 정책 없음(서비스 롤 전용), 유출 비밀번호 검사(대시보드 설정)) |

### 남은 일

| 항목 | 상태 |
| --- | --- |
| A-6 이메일 인증 | Supabase 대시보드에서 켜고 끌 수 있어요. 켜 두면 회원가입 후 "인증 메일을 보냈어요" 안내가 떠요 |
| Auth URL 설정 | 대시보드 Authentication → URL Configuration에 Site URL과 Redirect URL(`http://localhost:5500/**`, `https://tennisclub-peach.vercel.app/**`)을 등록해야 인증·재설정 메일 링크가 제대로 돌아와요 |
| 실제 테스트 결제 | 토스 테스트 결제창에서 끝까지 결제해 승인(`DONE`)까지 확인하는 단계는 사람이 직접 해 봐야 해요 |
| 토스 키 교체 | 내 상점 키를 쓸 때 `js/toss-config.js` 클라이언트 키 교체 + `supabase secrets set TOSS_SECRET_KEY=…` |
| P1·P2 미구현 | A-10 소셜 로그인, C-7 클럽 삭제, C-8 서버 검색, M-10 owner 위임, G-8 일정 수정, G-9 실시간, D-7 미납 알림, I-7 사진 업로드, P-9 웹훅, P-10 취소·환불 |
