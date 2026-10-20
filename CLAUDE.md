# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 프로젝트 개요

랠리클럽 — 테니스 동호회 사이트예요. 빌드 도구, 프레임워크, 패키지 의존성, 테스트, 린터가 없는 순수 HTML·CSS·JavaScript(ES2015+, 모듈 아님)예요. 데이터는 Supabase 프로젝트 `rallyclub`(ref `fnbwfnamydzuorqetbod`, 서울 리전, **무료 플랜만 사용**)에 저장해요. 요구사항과 진행 상황은 `PRD.md`에 있어요. 사용자에게 보이는 문구와 주석은 한국어로 써요.

## 실행·배포

```bash
npx -y http-server . -p 5500 -c-1
```

- 토스페이먼츠 SDK가 `file://`에서는 동작하지 않아서 반드시 로컬 서버로 열어야 해요. `.claude/launch.json`에 같은 설정(`tennisclub`)이 있어요.
- GitHub `dnjfemzjq531/tennisclub`의 `main`에 push하면 Vercel이 자동 배포해요 (https://tennisclub-peach.vercel.app, preset Other, 빌드 없음).
- 데모 계정 8명(`demo@example.com` 등)의 비밀번호는 모두 `rallyclub-demo-2026`이에요. DB를 데모 상태로 되돌리려면 `supabase/seed.sql`을 실행해요(기존 클럽·상품·주문·데모 계정을 지우고 다시 넣어요).

## 아키텍처

모든 페이지가 같은 순서로 스크립트를 불러와요. 이 순서에 의존하므로 바꾸면 안 돼요.

```
supabase-js(CDN, 버전 고정)  →  js/supabase-config.js  →  js/store.js  →  js/ui.js  →  (js/toss-config.js)  →  js/pages/<page>.js
```

- **`js/store.js` → 전역 `TC`**: Supabase 데이터 계층. 데이터를 읽고 쓰는 함수는 모두 `async`예요. `TC.ready`(Promise)가 끝나면 로그인 사용자·내 멤버십·내 클럽이 캐시에 올라와서 `me()`, `user(id)`, `membership()`, `myClubs()`, `isAdmin()`, `isOwner()`, `currentClubId()`는 동기로 써요. `user(id)`는 캐시만 보므로, 목록 함수(`games`, `items`, `members`)가 필요한 프로필을 미리 채워요. DB 컬럼(snake_case)은 매퍼로 화면용 camelCase(`desc`, `monthlyFee`, `start`/`end`, `rsvps: {userId: status}`)로 바꿔요. 실패하면 한국어 메시지를 담은 `Error`를 던져요. `localStorage`에는 현재 선택한 클럽(`rallyclub_club_v1`)만 남아요.
- **`js/ui.js` → 전역 `UI`**: 로드 즉시 `#header`/`#footer`를 그리고, 로그인 영역(`.user-slot`)은 `TC.ready` 뒤에 `renderUserArea()`로 채워요. 포맷터(`won`, `dateLabel`, `periodLabel`, `dday`), `esc`, SVG 일러스트, `<dialog>` 모달, `toast`, `requireLogin`(`TC.ready` 뒤에만 호출), `clubPills`, `reveal()`, 그리고 `loading()`(로딩 표시), `fail(err)`(에러 토스트), `busy(btn, fn)`(요청 중 버튼 잠금)을 제공해요.
- **`js/pages/*.js`**: 페이지마다 `async` IIFE 하나. `await TC.ready` → 데이터를 불러 지역 변수에 두고 → `render()`는 그 값만으로 `innerHTML`을 다시 그려요. 바꾸는 작업 뒤에는 다시 불러와서 그려요. 이벤트는 컨테이너에 위임(`data-*`)하고, 동적 HTML 뒤에는 `UI.reveal()`, 사용자 입력은 항상 `UI.esc()`.

### Supabase (`supabase/`)

- `migrations/*.sql`은 MCP `apply_migration`으로 적용한 순서 그대로예요. 스키마를 바꾸면 새 파일을 추가하고 같은 내용을 적용해요.
- 모든 테이블에 RLS가 켜져 있고, `anon`/`authenticated`의 기본 권한을 거둔 뒤 필요한 **컬럼 단위**로만 다시 줬어요. 그래서 클라이언트는 `select('*')` 대신 허용된 컬럼을 적어야 하는 곳이 있어요(`profiles`는 `id, name, ntrp`만 공개, 이메일·전화는 `get_my_profile`, `club_member_contacts` RPC로만).
- 상태를 바꾸는 작업(클럽 생성, 가입·탈퇴·승인·거절·역할·내보내기, 참석 토글, 수기 납부, 주문 생성)은 `security definer` RPC로만 해요. 권한 확인은 RPC 안에서 하고, RLS 헬퍼 `is_member`/`is_admin`은 API에 노출되지 않는 `private` 스키마에 있어요.
- `pg_cron`: 매일 00:05(KST) `generate_monthly_dues()`, 10분마다 `expire_stale_orders()`.

### 권한 모델

`memberships`(`club_id`, `user_id`, `role: owner|admin|member`, `status: active|pending`)가 클럽별 권한을 결정해요. 가입 방식(`approval: auto|manual`)에 따라 바로 `active`가 되거나 `pending`으로 대기해요. 역할 변경은 owner만, 일반 회원 내보내기는 admin 이상, admin 내보내기는 owner만, owner는 내보낼 수 없어요. 이 규칙은 RPC가 강제하고, 화면의 `TC.isAdmin`/`isOwner`는 UI 표시용이에요.

회비(`dues`)는 클럽·회원·월(`YYYY-MM`)별 레코드예요. 클럽 생성·가입·승인 때와 매일 크론에서 이번 달 회비를 만들어요(클라이언트는 만들지 않아요).

### 결제 흐름 (토스페이먼츠 주문서형 결제 v2)

1. `dues.js` / `market.js` → `TC.createOrder({ type, refs })` → RPC `create_order`가 **DB 값으로 금액·주문명을 계산**하고 `checkout.html?orderId=…`로 이동
2. `checkout.js`: `TossPayments(CLIENT_KEY).widgets({ customerKey })` → `setAmount()` → `renderPaymentMethods` + `renderAgreement` → `requestPayment()` (Redirect 방식)
3. `success.js` → `TC.confirmPayment()` → Edge Function `payments-confirm`(verify_jwt 끔, 함수 안에서 사용자 확인): `begin_confirm`(소유자·금액·대상 검증 후 `confirming` 잠금) → 토스 `POST /v1/payments/confirm`(Idempotency-Key) → `finish_confirm`(주문 `done` + 회비 `paid` / 상품 `sold`를 한 트랜잭션으로). 네트워크 오류면 `revert_confirm`으로 `ready`로 되돌려 재시도할 수 있어요.

- 클라이언트 키는 `js/toss-config.js`(토스 문서용 공개 테스트 키). 시크릿 키는 Edge Function 시크릿 `TOSS_SECRET_KEY`로 넣고, 없으면 문서용 공개 테스트 시크릿 키를 써요. 시크릿 키는 브라우저 코드에 절대 넣지 않아요.
- 토스페이먼츠 연동 문서는 `.mcp.json`에 등록된 `tosspayments-integration-guide` MCP 서버로 찾아볼 수 있어요.

## SEO · AEO · GEO

- 공개 페이지(`index`, `clubs`, `schedule`, `market`, `dues`)는 `<head>`에 description, canonical(`https://tennisclub-peach.vercel.app/...`), OG/Twitter(`assets/og-image.png` 1200×630), JSON-LD를 둬요. 홈은 `WebSite`·`Organization`·`WebApplication`·`FAQPage`, 나머지는 `WebPage` + `BreadcrumbList`예요.
- 로그인·회원 관리·결제 단계 페이지(`auth`, `members`, `checkout`, `success`, `fail`)는 `noindex, follow`예요. `robots.txt`로는 막지 않아요(막으면 noindex를 못 읽어요).
- 홈의 FAQ 섹션(`#faq`)과 `<head>`의 `FAQPage` JSON-LD는 문구가 같아야 해요. 하나를 고치면 둘 다, 그리고 `llms.txt`도 같이 고쳐요.
- 공개 페이지를 추가하면 `sitemap.xml`과 `llms.txt`에도 넣어요. 화면 내용은 JS로 그려지므로, 크롤러가 읽을 핵심 설명은 정적 HTML에 둬요.

## 디자인 시스템

`css/style.css` 한 파일에 전부 있어요. 색은 `:root` 토큰(`--court` 짙은 초록, `--ball` 테니스공 옐로, `--clay` 클레이 오렌지, `--cream` 배경)을 쓰고, 폰트는 디스플레이용 Bricolage Grotesque, 본문 Pretendard, 라벨 JetBrains Mono예요. 서브 페이지는 `.page-hero`(초록 배경 + 코트 라인 SVG + `.display` 큰 영문 제목) 패턴을 따르고, 페이지별 스타일은 파일 안에 `/* ===== PAGE ===== */` 구역으로 나뉘어 있어요. 브레이크포인트는 대략 1000px·900px·720px·600px예요.
