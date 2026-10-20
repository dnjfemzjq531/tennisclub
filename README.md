# 랠리클럽 — 테니스 동호회 사이트 (퍼블리싱)

HTML · CSS · JavaScript만으로 만든 퍼블리싱 시안이에요. 서버 없이 `localStorage`에 데모 데이터를 저장해서 모든 화면을 직접 눌러 볼 수 있어요.

## 실행

토스페이먼츠 SDK는 `file://`에서 동작하지 않아요. 로컬 서버로 열어 주세요.

```bash
npx -y http-server . -p 5500 -c-1
```

`http://localhost:5500` 으로 접속하면 데모 계정(김테니스)으로 로그인된 상태로 시작해요. 푸터의 **데모 데이터 초기화**로 처음 상태로 되돌릴 수 있어요.

## 페이지

| 파일 | 내용 |
|---|---|
| `index.html` | 홈 · 다음 경기, 미납 회비, 내 클럽 대시보드 |
| `auth.html` | 로그인 · 회원가입 |
| `clubs.html` | 클럽 목록 · 검색 · 클럽 만들기 · 가입 신청 |
| `members.html?club=ID` | 클럽 홈 · 회원 목록 · 가입 승인 · 역할 변경 · 클럽 설정 (클럽별 관리자) |
| `schedule.html` | 캘린더 · 경기 일정 · 참석/미정/불참 등록 · 일정 등록(운영진) |
| `market.html` | 테니스 용품 중고거래 · 판매 등록 · 안전결제 구매 |
| `dues.html` | 회비 납입 · 납부 현황(운영진) |
| `checkout.html` | 토스페이먼츠 주문서형 결제(결제위젯) |
| `success.html` / `fail.html` | 결제 성공 · 실패 |

## 구조

```
css/style.css        디자인 토큰(코트 그린 · 테니스공 옐로 · 클레이)과 전체 스타일
js/store.js          목업 데이터 저장소 → 실제 개발 때 API 호출로 바꾸면 돼요
js/ui.js             헤더·푸터·모달·토스트·일러스트 공통 모듈
js/toss-config.js    토스페이먼츠 클라이언트 키
js/pages/*.js        페이지별 스크립트
```

## 토스페이먼츠 연동

- SDK: `https://js.tosspayments.com/v2/standard` (주문서형 결제)
- 흐름: 주문서 생성 → `widgets.setAmount()` → `renderPaymentMethods()` · `renderAgreement()` → `requestPayment()` → `success.html`
- `success.html`에서 결제 요청 때 저장한 금액과 `amount` 쿼리가 같은지 확인해요. 다르면 승인하지 않아요.
- 지금 키는 토스페이먼츠 문서용 **테스트 키**예요. 실제 출금은 없어요. `js/toss-config.js`에서 내 키(`test_gck_…` / `live_gck_…`)로 바꿔 주세요.

### 실제 서비스 전에 꼭 해야 할 일

**결제 승인 API는 반드시 서버에서 호출해야 해요.** 퍼블리싱 시안이라 `success.html`에서 바로 완료 처리하고 있어요. 실제로는 서버가 시크릿 키(`test_gsk_…`)로 `POST https://api.tosspayments.com/v1/payments/confirm`을 호출해야 결제가 끝나요. 승인 요청이 없으면 10분 뒤 결제가 만료돼요. 시크릿 키는 브라우저 코드에 절대 넣지 마세요.
