# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 프로젝트 개요

랠리클럽 — 테니스 동호회 사이트의 **퍼블리싱 시안**이에요. 빌드 도구, 프레임워크, 패키지 의존성, 테스트, 린터가 없는 순수 HTML·CSS·JavaScript(ES2015+, 모듈 아님)예요. 서버도 없어서 모든 데이터는 브라우저 `localStorage`에 저장돼요. 사용자에게 보이는 문구와 주석은 한국어로 써요.

## 실행·배포

```bash
npx -y http-server . -p 5500 -c-1
```

- 토스페이먼츠 SDK가 `file://`에서는 동작하지 않아서 반드시 로컬 서버로 열어야 해요. `.claude/launch.json`에 같은 설정(`tennisclub`)이 있어요.
- GitHub `dnjfemzjq531/tennisclub`의 `main`에 push하면 Vercel이 자동 배포해요 (https://tennisclub-peach.vercel.app, preset Other, 빌드 없음).
- 데모 데이터를 처음 상태로 돌리려면 푸터의 "데모 데이터 초기화" 버튼을 누르거나 콘솔에서 `TC.reset()`을 실행해요.

## 아키텍처

모든 페이지가 같은 순서로 스크립트를 불러와요. 이 순서에 의존하므로 바꾸면 안 돼요.

```
js/store.js  →  js/ui.js  →  (js/toss-config.js)  →  js/pages/<page>.js
```

- **`js/store.js` → 전역 `TC`**: 목업 데이터 계층. `localStorage` 키 `rallyclub_db_v1`(DB), `rallyclub_session_v1`(로그인 사용자 id), `rallyclub_club_v1`(현재 선택한 클럽). 처음 로드할 때 `seed()`가 날짜를 오늘 기준 상대값으로 만들고, 데모 계정 `u1`로 자동 로그인해요. 실제 백엔드를 붙일 때는 이 파일의 API를 서버 호출로 바꾸는 게 의도된 구조예요. 데이터 모양을 바꾸면 `version`을 올리거나 `seed()`를 같이 고쳐야 기존 브라우저 데이터와 충돌하지 않아요.
- **`js/ui.js` → 전역 `UI`**: 로드되는 즉시 `#header`/`#footer` 자리표시자를 헤더·푸터로 바꿔요(`body[data-page]`로 현재 메뉴 표시). 포맷터(`won`, `dateLabel`, `periodLabel`, `dday`), `esc`(HTML 이스케이프), SVG 일러스트(`ballSVG`, `courtSVG`, `itemArt`), `<dialog>` 모달(`openModal`, `[data-close]`), `toast`, `requireLogin`, `clubPills`, 스크롤 등장 애니메이션 `reveal()`을 제공해요.
- **`js/pages/*.js`**: 페이지마다 IIFE 하나. 템플릿 리터럴로 `innerHTML`을 다시 그리고, 이벤트는 컨테이너에 위임(`data-*` 속성)해요. 동적으로 HTML을 만든 뒤에는 `UI.reveal()`을 불러야 `.reveal` 요소가 보여요. 사용자 입력은 항상 `UI.esc()`로 감싸요.

### 권한 모델

`memberships` 레코드(`clubId`, `userId`, `role: owner|admin|member`, `status: active|pending`)가 클럽별 권한을 결정해요. 클럽 가입 방식(`approval: auto|manual`)에 따라 바로 `active`가 되거나 `pending`으로 대기해요. 화면에서는 `TC.isAdmin(clubId)` / `TC.isOwner(clubId)`로 관리 UI를 보여줄지 정해요. 역할 변경은 owner만 할 수 있어요. 일반 회원 내보내기는 admin도 되지만, admin을 내보내는 건 owner만 돼요. owner는 내보낼 수 없어요.

회비(`dues`)는 클럽·회원·월(`YYYY-MM`)별 레코드예요. `ensureDues()`가 활동 회원의 이번 달 회비를 필요할 때 만들어요.

### 결제 흐름 (토스페이먼츠 주문서형 결제 v2)

1. `dues.js` / `market.js`가 `TC.createOrder()`로 주문(금액 포함)을 저장하고 `checkout.html?orderId=…`로 이동
2. `checkout.js`: `TossPayments(CLIENT_KEY).widgets({ customerKey })` → `setAmount()` → `renderPaymentMethods('#payment-method')` + `renderAgreement('#agreement')` → `requestPayment()` (Redirect 방식, `successUrl`/`failUrl`은 현재 폴더 기준 절대 URL)
3. `success.js`: 쿼리 `amount`가 저장된 주문 금액과 다르면 거절. 같으면 `TC.completeOrder()`가 회비를 납부 처리하거나 상품을 판매완료로 바꿔요.

- 클라이언트 키는 `js/toss-config.js`에 있어요(현재 토스 문서용 공개 테스트 키). `customerKey`는 회원마다 저장된 UUID예요.
- **결제 승인 API(`POST /v1/payments/confirm`)는 서버가 없어서 호출하지 않아요.** 지금은 `success.js`에서 바로 완료 처리해요. 실서비스에서는 서버가 시크릿 키로 승인한 뒤 완료 처리해야 하고, 시크릿 키(`test_gsk_`/`live_gsk_`)는 브라우저 코드에 넣으면 안 돼요.
- 토스페이먼츠 연동 문서는 `.mcp.json`에 등록된 `tosspayments-integration-guide` MCP 서버로 찾아볼 수 있어요.

## 디자인 시스템

`css/style.css` 한 파일에 전부 있어요. 색은 `:root` 토큰(`--court` 짙은 초록, `--ball` 테니스공 옐로, `--clay` 클레이 오렌지, `--cream` 배경)을 쓰고, 폰트는 디스플레이용 Bricolage Grotesque, 본문 Pretendard, 라벨 JetBrains Mono예요. 서브 페이지는 `.page-hero`(초록 배경 + 코트 라인 SVG + `.display` 큰 영문 제목) 패턴을 따르고, 페이지별 스타일은 파일 안에 `/* ===== PAGE ===== */` 구역으로 나뉘어 있어요. 브레이크포인트는 대략 1000px·900px·720px·600px예요.
