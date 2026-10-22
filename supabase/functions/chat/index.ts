/*
 * 랠리클럽 도우미 챗봇 (RAG: Upstage 임베딩으로 안내 검색 → ChatGPT로 답변)
 *
 * 브라우저(js/ui.js 챗봇 위젯)가 대화 기록과 현재 페이지를 보내면
 *   1) 안내 자료(kb_chunks)를 맞추고: KNOWLEDGE를 조각내 builtin 행으로 넣고, 임베딩이 빈 행은 Upstage로 채워요
 *   2) 질문을 Upstage로 임베딩해 match_kb로 가까운 안내 조각만 찾고
 *   3) 로그인했으면 그 사용자의 클럽·회비·최근 주문을 서비스 롤로 읽어 상황 정보로 붙여
 *   4) OpenAI(실패하면 Upstage Solar)로 답을 만들어 돌려줘요.
 * Upstage 임베딩이 안 되면(키 없음·오류) KNOWLEDGE 전체를 보내는 방식으로 답해요.
 *
 * - 키는 Edge Function 시크릿 UPSTAGE_API, OPEN_AI_API로만 넣어요. 브라우저 코드에 넣지 않아요.
 * - 모델은 OPENAI_MODEL(기본 gpt-4o-mini), UPSTAGE_MODEL(기본 solar-pro2) 시크릿으로 바꿀 수 있어요.
 * - 안내를 더 넣으려면 대시보드 Table Editor에서 kb_chunks에 title·content만 넣어요(source는 manual).
 * - 챗봇은 데이터를 읽기만 하고 바꾸지 않아요. 결제 취소·환불 같은 처리는 안내만 해요.
 */
import { createClient } from 'npm:@supabase/supabase-js@2.49.4';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

const UPSTAGE_KEY = Deno.env.get('UPSTAGE_API');

// 답변 모델. 앞에서부터 시도하고, 실패하면(키 없음·오류·한도 초과) 다음으로 넘어가요.
// 둘 다 OpenAI 호환 Chat Completions 형식이에요.
const PROVIDERS = [
  {
    name: 'openai',
    url: 'https://api.openai.com/v1/chat/completions',
    key: Deno.env.get('OPEN_AI_API'),
    model: Deno.env.get('OPENAI_MODEL') || 'gpt-4o-mini',
    maxField: 'max_completion_tokens',
  },
  {
    name: 'upstage',
    url: 'https://api.upstage.ai/v1/chat/completions',
    key: UPSTAGE_KEY,
    model: Deno.env.get('UPSTAGE_MODEL') || 'solar-pro2',
    maxField: 'max_tokens',
  },
];
const MATCH_COUNT = 6; // 질문마다 붙이는 안내 조각 수

const MAX_TURNS = 12; // 최근 대화만 보내요
const MAX_CHARS = 800; // 메시지 하나의 최대 길이
const RATE = { limit: 20, windowMs: 10 * 60 * 1000 }; // 10분에 20번

const PAGES: Record<string, string> = {
  home: '홈(index.html)', clubs: '클럽 목록(clubs.html)', members: '클럽 홈·회원 관리(members.html)',
  schedule: '일정(schedule.html)', market: '중고거래(market.html)', dues: '회비(dues.html)',
  auth: '로그인·회원가입(auth.html)', checkout: '결제(checkout.html)', success: '결제 완료(success.html)',
  fail: '결제 실패(fail.html)',
};

const KNOWLEDGE = `
# 랠리클럽 사용 안내 (이 내용만 근거로 답해요)

## 메뉴
홈 · 클럽(clubs.html) · 일정(schedule.html) · 중고거래(market.html) · 회비(dues.html). 오른쪽 위 이름을 누르면 내 클럽, 내 일정, 내 회비, 내 판매·구매, 내 정보 수정, 로그아웃이 있어요.

## 1. 클럽 만들기
1) 로그인 → 클럽 메뉴 → [클럽 만들기]
2) 클럽 이름(30자 이내), 활동 지역, 주 코트, 클럽 소개(200자 이내), 월 회비(원), 가입 방식(바로 가입 / 운영진 승인), 색상을 입력하고 [등록하기]
3) 만든 사람이 클럽장(owner)이 되고, 이번 달 회비가 자동으로 생겨요.
- 클럽 삭제와 클럽장 위임 기능은 아직 없어요.

## 2. 클럽 가입
- 클럽 목록에서 클럽을 고르고 가입해요. "바로 가입" 클럽은 즉시 회원이 되고, "운영진 승인" 클럽은 신청 후 운영진이 승인해야 해요.
- 승인 대기 중에는 클럽 홈에서 [신청 취소]를 할 수 있어요. 승인되기 전에는 일정·회비 메뉴를 쓸 수 없어요.
- 탈퇴: 클럽 홈(members.html) → [클럽 탈퇴하기]. 클럽장은 탈퇴할 수 없어요.

## 3. 회원 관리 (클럽 홈 = members.html?club=클럽ID, 클럽 카드의 [클럽 홈 →])
역할: 클럽장(owner) 1명 · 운영진(admin) · 회원(member)
- [회원 목록] 탭: 모든 회원이 봐요. 운영진은 회원 연락처(이메일·전화)도 봐요.
- [가입 신청] 탭(운영진 이상): [승인하기] / [거절]. 승인하면 이번 달 회비가 생겨요.
- 역할 변경: 클럽장만 회원 목록의 드롭다운에서 회원 ↔ 운영진으로 바꿔요. 클럽장 역할은 줄 수 없어요.
- [내보내기]: 일반 회원은 운영진 이상이, 운영진은 클럽장만 내보낼 수 있어요. 클럽장과 자기 자신은 내보낼 수 없어요.
- [클럽 설정] 탭(운영진 이상): 이름·지역·코트·소개·월 회비·가입 방식 수정 → [설정 저장]. 바뀐 월 회비는 다음에 만들어지는 회비부터 적용돼요(이미 생긴 미납 회비 금액은 그대로).

## 4. 일정·참석 (schedule.html)
- 운영진 이상이 [+ 새 일정 등록]으로 일정(종류: 정기전·연습·대회·교류전·레슨, 날짜, 시작·종료 시간, 코트, 정원 2~64명, 메모)을 만들고 삭제해요. 일정 수정 기능은 아직 없어서 삭제 후 다시 등록해요.
- 회원은 참석 / 미정 / 불참을 눌러 응답하고, 같은 버튼을 다시 누르면 응답이 취소돼요. 참석 인원이 정원에 차면 "정원이 찼어요"가 떠요.

## 5. 회비 (dues.html)
- 매달 회비가 자동으로 생겨요(매일 00:05 확인). 미납 회비를 골라 토스페이먼츠로 결제해요. 한 번에 한 클럽의 회비만 결제할 수 있어요.
- 운영진은 [회비 납부 현황]에서 월별 납부 상태를 보고, 현금으로 받은 회비는 [현금 납부 처리]로 기록해요. 미납 알림 발송은 준비 중이에요.

## 6. 로그인·계정 문제
- 로그인: auth.html. "이메일 또는 비밀번호가 맞지 않아요" → 이메일 오타, 대소문자, 키보드 한/영 상태를 확인하고 안 되면 비밀번호 찾기.
- "이메일 인증이 아직 안 됐어요" → 가입 때 받은 인증 메일의 링크를 눌러야 로그인돼요. 스팸함도 확인해요.
- 비밀번호 찾기: 로그인 화면 [비밀번호를 잊었어요] → 가입한 이메일 입력 → 메일의 링크 → [새 비밀번호] 화면에서 8자 이상으로 바꿔요. 메일이 안 오면 스팸함 확인, 몇 분 뒤 다시 요청(발송 한도가 있어요). 링크는 한 번만, 받은 브라우저에서 바로 여는 게 좋아요.
- 회원가입: 비밀번호 8자 이상. "이미 가입된 이메일이에요" → 로그인이나 비밀번호 찾기를 써요.
- 내 정보 수정: 이름 메뉴 → [내 정보 수정](auth.html?mode=profile)에서 이름·전화번호·NTRP를 바꿔요. 이메일은 바꿀 수 없어요.
- 데모 계정: 로그인 화면 [데모 계정으로 둘러보기].

## 7. 화면 오류·버그 해결 순서
1) 새로고침(PC는 Ctrl+Shift+R로 강력 새로고침) 2) 로그아웃 후 다시 로그인 3) 다른 브라우저나 시크릿 창에서 시도 4) 광고 차단·확장 프로그램 끄기 5) 인터넷 연결 확인.
- "권한이 없어요" → 그 기능은 운영진·클럽장만 쓸 수 있거나, 아직 가입 승인 전이에요.
- "불러오는 중"에서 멈추면 새로고침하고, 계속되면 잠시 뒤 다시 시도해요.
- 그래도 안 되면 어떤 페이지에서 무엇을 눌렀을 때, 어떤 메시지가 떴는지, 기기·브라우저를 알려 달라고 해요.

## 8. 중고거래 (market.html)
- [+ 판매 등록하기]: 상품명(50자 이내), 카테고리, 상태, 가격(1,000원 이상), 거래 지역, 설명(500자 이내). 판매자는 상품을 수정·삭제하고 판매 상태를 판매중 ↔ 예약중으로 바꿀 수 있어요. 판매완료는 구매자가 결제하면 자동으로 바뀌어요. 판매완료된 상품은 삭제할 수 없어요.
- 구매: 상품 상세 → [안전결제로 구매하기] → 토스페이먼츠 결제. 판매중인 상품만, 한 번에 하나씩 살 수 있고 내 상품은 살 수 없어요.
- 내 판매·구매 내역: 이름 메뉴 → [내 판매·구매].
- 지금은 테스트 결제 환경이라 실제 돈이 빠져나가지 않아요.

## 9. 결제 문제 (회비·중고거래 공통)
결제 단계: 주문서 생성(금액은 서버가 계산) → 결제창(checkout.html) → 결제 승인 → 완료(success.html) 또는 실패(fail.html)
주문 상태: ready(결제 대기) · confirming(승인 확인 중) · done(결제 완료) · failed(실패) · expired(만료)
- **돈이 실제로 빠져나간 건 done 주문뿐**이에요. failed·expired·ready 주문은 승인되지 않아서 청구되지 않아요. 카드사 앱에 승인 알림이 보여도 최종 승인이 안 된 건은 자동으로 취소돼요.
- **중복 결제**: 같은 회비나 상품은 한 번만 결제되게 막혀 있어요(이미 납부한 회비·판매된 상품은 승인을 거절). 결제 완료 화면을 새로고침해도 두 번 처리되지 않아요. 같은 대상에 done 주문이 2건 이상이면 실제 중복이므로 두 주문번호를 정리해서 운영팀에 환불을 요청해요.
- 결제창을 닫았거나 취소함(PAY_PROCESS_CANCELED, USER_CANCEL): 청구 없음. 실패 화면의 [다시 결제하기]나 처음부터 다시 결제해요.
- "결제할 수 없는 주문이에요": 주문이 만료됐거나 이미 처리됐어요. 회비/중고거래 페이지에서 처음부터 다시 결제해요. 결제 대기(ready) 주문은 1시간이 지나면 만료돼요.
- "주문 금액과 결제 금액이 달라서…": 주소의 금액이 바뀌었어요. 처음부터 다시 결제해요.
- "이미 판매됐거나 구매할 수 없는 상품이에요. 결제는 승인되지 않았어요.": 다른 사람이 먼저 샀어요. 청구되지 않아요.
- "이미 납부했거나 정리된 회비가 있어요": 이미 납부된 회비예요. 회비 페이지에서 납부 상태를 확인해요.
- "결제 승인 서버에 연결하지 못했어요": 결제 완료 화면을 새로고침하면 같은 결제를 안전하게 다시 확인해요(중복 청구 없음).
- "결제를 확인하고 있어요"(confirming): 잠시 뒤 새로고침해요. 15분 넘게 그대로면 실패로 정리되고 청구되지 않아요.
- "결제는 승인됐지만 반영 중 문제가 생겼어요": 돈은 나갔는데 납부/판매 반영이 안 된 상태라 운영팀 확인이 필요해요. 주문번호를 꼭 알려 달라고 해요.
- 환불·결제 취소: 아직 화면에서 직접 취소하는 기능은 없어요. 운영팀에 주문번호(RC-로 시작), 결제 일시, 금액, 사유를 보내요.
- 중고거래 물건 문제(물건이 안 옴, 설명과 다름 등): 먼저 판매자와 이야기하고, 해결되지 않으면 주문번호와 상황을 정리해 운영팀에 문의해요.
`;

const SYSTEM = `너는 테니스 동호회 플랫폼 "랠리클럽"의 고객 도우미 "랠리봇"이야.
- 항상 한국어 존댓말 해요체로, 짧고 친절하게 답해. 단계는 번호 목록으로, 버튼 이름은 [대괄호]로 써.
- 아래 사용 안내와 "사용자 상황" 데이터만 근거로 답해. 없는 기능을 지어내지 말고, 모르면 모른다고 하고 운영팀 문의를 권해.
- 사용자 상황에 주문·회비 데이터가 있으면 그걸 보고 구체적으로 진단해(예: "RC-… 주문은 failed라 청구되지 않았어요").
- 너는 데이터를 바꾸거나 결제를 취소할 수 없어. 직접 처리했다고 말하지 마.
- 비밀번호, 카드번호 같은 민감한 정보는 절대 묻지 마.
- 문제가 해결되지 않아 운영팀 문의가 필요하면 마지막에 "📋 문의 요약" 제목 아래 3~5줄로 상황·주문번호·오류 메시지를 정리해 줘서 그대로 복사해 보낼 수 있게 해.
- 테니스 동호회·랠리클럽과 관계없는 질문은 정중히 범위 밖이라고 안내해. 테니스 규칙·용품 같은 가벼운 질문은 짧게 답해도 돼.`;

// 인스턴스별 간단한 요청 제한 (best effort)
const hits = new Map<string, number[]>();
function limited(key: string) {
  const now = Date.now();
  const list = (hits.get(key) || []).filter((t) => now - t < RATE.windowMs);
  list.push(now);
  hits.set(key, list);
  return list.length > RATE.limit;
}

/* ---------- 안내 자료 검색 (RAG) ---------- */
type Admin = ReturnType<typeof createClient>;

async function embed(inputs: string[], kind: 'query' | 'passage'): Promise<number[][]> {
  const res = await fetch('https://api.upstage.ai/v1/embeddings', {
    method: 'POST',
    headers: { Authorization: `Bearer ${UPSTAGE_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: `embedding-${kind}`, input: inputs }),
  });
  const data = await res.json();
  if (!res.ok || !Array.isArray(data?.data)) {
    throw new Error(`upstage embeddings ${res.status} ${JSON.stringify(data?.error ?? data).slice(0, 300)}`);
  }
  return data.data.sort((a: any, b: any) => a.index - b.index).map((d: any) => d.embedding);
}

const sha256 = async (s: string) =>
  [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)))]
    .map((b) => b.toString(16).padStart(2, '0')).join('');

// KNOWLEDGE를 "## 구역" 단위로 나누고, 긴 구역은 "- " 항목마다 다시 나눠요.
// 항목 앞 설명 줄은 따로 한 조각으로 둬요(조각마다 붙이면 서로 너무 비슷해져서 검색이 흐려져요).
function builtinChunks() {
  const out: { title: string; content: string }[] = [];
  for (const sec of KNOWLEDGE.split(/\n(?=## )/)) {
    if (!sec.startsWith('## ')) continue;
    const [head, ...rest] = sec.trim().split('\n');
    const title = head.slice(3).trim();
    const body = rest.join('\n').trim();
    if (body.length <= 700) {
      out.push({ title, content: body });
      continue;
    }
    const intro: string[] = [];
    const items: string[] = [];
    for (const line of body.split('\n')) {
      if (line.startsWith('- ')) items.push(line);
      else if (items.length) items[items.length - 1] += `\n${line}`;
      else intro.push(line);
    }
    if (intro.join('').trim()) out.push({ title, content: intro.join('\n').trim() });
    items.forEach((it) => out.push({ title, content: it.trim() }));
  }
  return out;
}

// 인스턴스마다 처음 한 번 builtin 조각을 KNOWLEDGE에 맞추고, 매번 임베딩이 빈 조각을 채워요.
let builtinSynced = false;
async function syncKb(admin: Admin) {
  if (!builtinSynced) {
    const chunks = await Promise.all(builtinChunks().map(async (c) => ({ ...c, checksum: await sha256(`${c.title}\n${c.content}`) })));
    const { data: rows, error } = await admin.from('kb_chunks').select('id, checksum').eq('source', 'builtin');
    if (error) throw error;
    const want = new Set(chunks.map((c) => c.checksum));
    const have = new Set(rows.map((r: any) => r.checksum));
    const stale = rows.filter((r: any) => !want.has(r.checksum)).map((r: any) => r.id);
    if (stale.length) await admin.from('kb_chunks').delete().in('id', stale);
    const add = chunks.filter((c) => !have.has(c.checksum)).map((c) => ({ source: 'builtin', ...c }));
    if (add.length) {
      // 다른 인스턴스가 먼저 넣었으면 중복 오류가 나요. 이미 들어간 거라 괜찮아요.
      const { error: insErr } = await admin.from('kb_chunks').insert(add);
      if (insErr) console.error('kb insert', insErr.message);
    }
    builtinSynced = true;
  }
  const { data: todo, error } = await admin.from('kb_chunks').select('id, title, content').is('embedding', null).limit(50);
  if (error) throw error;
  if (!todo.length) return;
  const vecs = await embed(todo.map((t: any) => `${t.title}\n${t.content}`), 'passage');
  await Promise.all(todo.map((t: any, i: number) =>
    admin.from('kb_chunks').update({ embedding: JSON.stringify(vecs[i]) }).eq('id', t.id)));
}

// 최근 질문 두 개로 검색해요(“그럼 환불은요?” 같은 이어지는 질문도 맥락을 잡게).
async function retrieve(admin: Admin, messages: { role: string; content: string }[]) {
  await syncKb(admin);
  const query = messages.filter((m) => m.role === 'user').slice(-2).map((m) => m.content).join('\n');
  const [vec] = await embed([query], 'query');
  const { data, error } = await admin.rpc('match_kb', { p_embedding: JSON.stringify(vec), p_count: MATCH_COUNT });
  if (error) throw error;
  return data as { id: number; title: string; content: string; similarity: number }[];
}

const STATUS_KO: Record<string, string> = {
  ready: '결제 대기', confirming: '승인 확인 중', done: '결제 완료', failed: '실패', expired: '만료',
};

// 로그인 사용자의 상황 요약 (본인 데이터만)
async function userContext(admin: Admin, userId: string) {
  const [profile, ms, dues, orders, sold, bought] = await Promise.all([
    admin.from('profiles').select('name, ntrp').eq('id', userId).maybeSingle(),
    admin.from('memberships').select('role, status, clubs(name, approval)').eq('user_id', userId),
    admin.from('dues').select('period, amount, clubs(name)').eq('user_id', userId).eq('status', 'unpaid').order('period'),
    admin.from('orders').select('order_id, type, order_name, amount, status, fail_code, fail_message, payment_type, paid_at, created_at')
      .eq('user_id', userId).order('created_at', { ascending: false }).limit(10),
    admin.from('items').select('title, price, status').eq('seller_id', userId).order('created_at', { ascending: false }).limit(10),
    admin.from('items').select('title, price').eq('buyer_id', userId).order('created_at', { ascending: false }).limit(5),
  ]);
  const ROLE: Record<string, string> = { owner: '클럽장', admin: '운영진', member: '회원' };
  const kst = (ts: string | null) => ts ? new Date(ts).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' }) : '';
  const lines = [
    `- 이름: ${profile.data?.name ?? '알 수 없음'} (NTRP ${profile.data?.ntrp ?? '-'})`,
    `- 내 클럽: ${(ms.data || []).map((m: any) => `${m.clubs?.name}(${ROLE[m.role]}${m.status === 'pending' ? ', 승인 대기' : ''})`).join(', ') || '없음'}`,
    `- 미납 회비: ${(dues.data || []).map((d: any) => `${d.clubs?.name} ${d.period} ${d.amount}원`).join(', ') || '없음'}`,
    `- 최근 주문(최신순):${(orders.data || []).length ? '' : ' 없음'}`,
    ...(orders.data || []).map((o: any) =>
      `  · ${o.order_id} | ${o.type === 'dues' ? '회비' : '중고거래'} | ${o.order_name} | ${o.amount}원 | ${STATUS_KO[o.status] ?? o.status}`
      + `${o.fail_code ? ` | 실패 사유 ${o.fail_code}: ${o.fail_message ?? ''}` : ''}`
      + ` | 주문 ${kst(o.created_at)}${o.paid_at ? ` | 결제 ${kst(o.paid_at)}` : ''}`),
    `- 내 판매 상품: ${(sold.data || []).map((i: any) => `${i.title}(${i.price}원, ${i.status})`).join(', ') || '없음'}`,
    `- 내가 구매한 상품: ${(bought.data || []).map((i: any) => `${i.title}(${i.price}원)`).join(', ') || '없음'}`,
  ];
  return lines.join('\n');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ ok: false, message: 'POST만 지원해요.' }, 405);

  const providers = PROVIDERS.filter((p) => p.key);
  if (!providers.length) return json({ ok: false, message: '챗봇 설정이 아직 끝나지 않았어요.' }, 503);

  let body: { messages?: unknown; page?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, message: '요청 형식이 올바르지 않아요.' }, 400);
  }
  const messages = (Array.isArray(body.messages) ? body.messages : [])
    .filter((m: any) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string' && m.content.trim())
    .slice(-MAX_TURNS)
    .map((m: any) => ({ role: m.role as 'user' | 'assistant', content: m.content.slice(0, MAX_CHARS) }));
  if (!messages.length || messages[messages.length - 1].role !== 'user') {
    return json({ ok: false, message: '질문을 입력해 주세요.' }, 400);
  }
  const page = PAGES[String(body.page)] ?? '알 수 없음';

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // 로그인은 선택이에요. 로그인했으면 내 상황을 같이 봐요.
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  const { data: userData } = token.split('.').length === 3 ? await admin.auth.getUser(token) : { data: { user: null } };
  const user = userData?.user ?? null;

  const ip = (req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || 'unknown';
  if (limited(user?.id ?? ip)) {
    return json({ ok: false, message: '질문이 너무 많아요. 몇 분 뒤에 다시 물어봐 주세요.' }, 429);
  }

  // 안내 검색과 내 상황 조회를 함께 해요. 검색이 안 되면 안내 전체를 보내요.
  const [found, context] = await Promise.all([
    UPSTAGE_KEY
      ? retrieve(admin, messages).catch((err) => { console.error('retrieve', err); return null; })
      : Promise.resolve(null),
    user
      ? userContext(admin, user.id).catch((err) => { console.error('userContext', err); return '- 로그인했지만 내 정보를 불러오지 못했어요.'; })
      : Promise.resolve('- 로그인하지 않았어요. 일반 안내는 그대로 해 주고, 내 주문·회비를 직접 확인해야 할 때만 로그인하면 확인해 줄 수 있다고 덧붙여요.'),
  ]);
  const kb = found && found.length ? 'rag' : 'full';
  const knowledge = kb === 'rag'
    ? `# 랠리클럽 사용 안내 중 질문과 관련된 부분 (이 내용만 근거로 답해요)\n\n${found!.map((c) => `## ${c.title}\n${c.content}`).join('\n\n')}`
    : KNOWLEDGE;
  const today = new Date().toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul' });
  const prompt = [
    { role: 'system', content: `${SYSTEM}\n${knowledge}` },
    { role: 'system', content: `# 사용자 상황 (오늘 ${today}, 지금 보고 있는 페이지: ${page})\n${context}` },
    ...messages,
  ];

  // 키가 있는 공급자를 순서대로 시도해요(OpenAI → Upstage).
  for (const p of providers) {
    try {
      const res = await fetch(p.url, {
        method: 'POST',
        headers: { Authorization: `Bearer ${p.key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: p.model, [p.maxField]: 900, messages: prompt }),
      });
      const data = await res.json();
      const reply = data?.choices?.[0]?.message?.content?.trim();
      if (res.ok && reply) {
        // sources: 참고한 안내 조각(제목·유사도). 검색 품질 확인용이에요.
        const sources = (found || []).map((c) => ({ id: c.id, title: c.title, similarity: Math.round(c.similarity * 1000) / 1000 }));
        return json({ ok: true, reply, provider: p.name, kb, sources });
      }
      console.error(p.name, res.status, data?.error ?? data);
    } catch (err) {
      console.error(p.name, 'network', err);
    }
  }
  return json({ ok: false, message: '지금은 답변을 만들지 못했어요. 잠시 후 다시 시도해 주세요.' }, 502);
});
