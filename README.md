# 랠리클럽 — 테니스 동호회 사이트

HTML · CSS · JavaScript(빌드 없음)로 만든 테니스 동호회 사이트예요. 데이터는 Supabase(Postgres + Auth)에 저장하고, 결제는 토스페이먼츠로 해요.

## 실행

토스페이먼츠 SDK는 `file://`에서 동작하지 않아요. 로컬 서버로 열어 주세요.

```bash
npx -y http-server . -p 5500 -c-1
```

로그인 화면의 **데모 계정으로 둘러보기**를 누르면 `demo@example.com`(김테니스)으로 들어가요. 데모 계정 8명의 비밀번호는 모두 `rallyclub-demo-2026`이에요(`supabase/seed.sql`).

## 페이지

| 파일 | 내용 |
|---|---|
| `index.html` | 홈 · 다음 경기, 미납 회비, 내 클럽 대시보드 |
| `auth.html` | 로그인 · 회원가입 · 비밀번호 재설정 · 내 정보 수정(`?mode=profile`) |
| `clubs.html` | 클럽 목록 · 검색 · 클럽 만들기 · 가입 신청 |
| `members.html?club=ID` | 클럽 홈 · 회원 목록 · 가입 승인 · 역할 변경 · 클럽 설정 |
| `schedule.html` | 캘린더 · 경기 일정 · 참석/미정/불참 · 일정 등록(운영진) |
| `market.html` | 중고거래 · 판매 등록·수정 · 내 거래 · 안전결제 구매 |
| `dues.html` | 회비 납입 · 납부 현황(운영진) |
| `checkout.html` | 토스페이먼츠 주문서형 결제 |
| `success.html` / `fail.html` | 결제 승인 결과 |

## 구조

```
css/style.css                 디자인 토큰과 전체 스타일
js/supabase-config.js         Supabase URL · publishable 키 · 공개 데모 계정
js/store.js                   데이터 계층(전역 TC) — Supabase 호출
js/ui.js                      헤더·푸터·모달·토스트·일러스트 공통 모듈(전역 UI)
js/toss-config.js             토스페이먼츠 클라이언트 키
js/pages/*.js                 페이지별 스크립트
supabase/migrations/*.sql     테이블 · RLS · RPC · 크론
supabase/functions/payments-confirm   결제 승인 Edge Function
supabase/functions/chat       도우미 챗봇(랠리봇) Edge Function — OpenAI
supabase/seed.sql             데모 데이터
PRD.md                        Supabase 연동 요구사항과 진행 상황
```

## 도우미 챗봇

모든 페이지 오른쪽 아래 [도움말] 버튼으로 랠리봇에게 물어봐요. 클럽 만들기·회원 관리, 로그인·비밀번호·화면 오류, 결제 오류·중복 결제·중고거래 문제를 안내하고, 로그인했으면 내 주문 상태를 보고 진단해요. 운영팀 문의가 필요하면 복사할 수 있는 문의 요약을 만들어 줘요.

질문을 Upstage로 임베딩해 Supabase(pgvector) `kb_chunks`에서 관련 안내만 찾고, ChatGPT(OpenAI)가 그 안내로 답해요(RAG). 안내를 더 넣으려면 대시보드 Table Editor → `kb_chunks`에 제목·내용만 추가하면 다음 질문부터 반영돼요. 키는 Edge Function 시크릿 `UPSTAGE_API`, `OPEN_AI_API`로 넣어요(Supabase 대시보드 → Edge Functions → Secrets, 또는 `.env` → `npx supabase secrets set --env-file .env --project-ref fnbwfnamydzuorqetbod`).

## 결제 흐름

1. `dues.js` / `market.js` → RPC `create_order`: 서버가 DB 값으로 금액을 계산해 주문서를 만들어요.
2. `checkout.html`: 토스 위젯 `setAmount()` → `requestPayment()`
3. `success.html` → Edge Function `payments-confirm`: 주문 소유자·금액 확인 → 시크릿 키로 `POST /v1/payments/confirm` → 회비 납부 / 상품 판매완료를 한 트랜잭션으로 반영

시크릿 키는 Edge Function 시크릿 `TOSS_SECRET_KEY`로 넣어요. 없으면 토스 문서용 공개 테스트 시크릿 키를 써요. 라이브 키는 반드시 시크릿으로만 넣고, 브라우저 코드에는 절대 넣지 마세요.
