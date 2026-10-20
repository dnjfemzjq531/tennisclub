/*
 * 토스페이먼츠 결제 승인 (POST /v1/payments/confirm)
 *
 * success.html이 paymentKey·orderId·amount를 보내면
 *   1) 로그인한 사용자 확인
 *   2) begin_confirm: 주문 소유자·금액·대상(회비/상품) 검증 후 confirming으로 잠금
 *   3) 시크릿 키로 토스페이먼츠 승인 API 호출
 *   4) finish_confirm: 결과를 한 트랜잭션으로 반영 (주문 done + 회비 paid / 상품 sold)
 *
 * 시크릿 키는 `supabase secrets set TOSS_SECRET_KEY=test_gsk_...`로 넣어요.
 * 값이 없으면 토스페이먼츠 문서에 공개된 테스트 시크릿 키를 써요(js/toss-config.js의 문서 테스트 클라이언트 키와 짝).
 * 라이브 키로 바꿀 때는 반드시 시크릿으로 넣어야 해요.
 */
import { createClient } from 'npm:@supabase/supabase-js@2.49.4';

const DOCS_TEST_SECRET_KEY = 'test_gsk_docs_OaPz8L5KdmQXkzRz3y47BMw6';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ ok: false, code: 'METHOD_NOT_ALLOWED', message: 'POST만 지원해요.' }, 405);

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // 1) 로그인 사용자 확인
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  const { data: userData } = token ? await admin.auth.getUser(token) : { data: { user: null } };
  const user = userData?.user;
  if (!user) return json({ ok: false, code: 'UNAUTHORIZED', message: '로그인이 필요해요.' }, 401);

  let body: { paymentKey?: unknown; orderId?: unknown; amount?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, code: 'INVALID_REQUEST', message: '요청 형식이 올바르지 않아요.' }, 400);
  }
  const paymentKey = typeof body.paymentKey === 'string' ? body.paymentKey : '';
  const orderId = typeof body.orderId === 'string' ? body.orderId : '';
  const amount = Number(body.amount);
  if (!paymentKey || paymentKey.length > 200 || !/^[A-Za-z0-9_-]{6,64}$/.test(orderId) || !Number.isInteger(amount) || amount <= 0) {
    return json({ ok: false, code: 'INVALID_REQUEST', message: '결제 정보가 올바르지 않아요.' }, 400);
  }

  // 2) 검증 + 잠금
  const { data: begin, error: beginErr } = await admin.rpc('begin_confirm', {
    p_order_id: orderId, p_amount: amount, p_user: user.id,
  });
  if (beginErr) {
    console.error('begin_confirm', beginErr);
    return json({ ok: false, code: 'INTERNAL', message: '결제 확인 중 문제가 생겼어요.' }, 500);
  }
  if (begin.state === 'done') return json({ ok: true, state: 'done' });
  if (!begin.ok) return json(begin, begin.code === 'IN_PROGRESS' ? 409 : 400);

  // 3) 토스페이먼츠 승인
  const secretKey = Deno.env.get('TOSS_SECRET_KEY') || DOCS_TEST_SECRET_KEY;
  let tossRes: Response;
  let tossBody: Record<string, unknown>;
  try {
    tossRes = await fetch('https://api.tosspayments.com/v1/payments/confirm', {
      method: 'POST',
      headers: {
        Authorization: `Basic ${btoa(`${secretKey}:`)}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': `confirm-${orderId}`,
      },
      body: JSON.stringify({ paymentKey, orderId, amount }),
    });
    tossBody = await tossRes.json();
  } catch (err) {
    // 네트워크 오류: 승인 여부를 알 수 없어요. 주문을 ready로 되돌려서 새로고침하면
    // 같은 Idempotency-Key로 다시 승인을 요청하게 해요(이미 승인됐다면 같은 결과가 와요).
    console.error('toss confirm network', err);
    await admin.rpc('revert_confirm', { p_order_id: orderId });
    return json({ ok: false, code: 'NETWORK_ERROR', message: '결제 승인 서버에 연결하지 못했어요. 잠시 후 다시 시도해 주세요.' }, 502);
  }

  const success = tossRes.ok && tossBody.status === 'DONE';

  // 4) 결과 반영
  const { error: finishErr } = await admin.rpc('finish_confirm', {
    p_order_id: orderId,
    p_success: success,
    p_payment_key: paymentKey,
    p_payment_type: typeof tossBody.type === 'string' ? tossBody.type : null,
    p_fail_code: success ? null : String(tossBody.code ?? 'CONFIRM_FAILED'),
    p_fail_message: success ? null : String(tossBody.message ?? '결제 승인에 실패했어요.'),
    p_response: tossBody,
  });
  if (finishErr) {
    console.error('finish_confirm', finishErr);
    return json({ ok: false, code: 'INTERNAL', message: '결제는 승인됐지만 반영 중 문제가 생겼어요. 고객센터로 문의해 주세요.' }, 500);
  }

  if (!success) {
    return json({ ok: false, code: tossBody.code ?? 'CONFIRM_FAILED', message: tossBody.message ?? '결제 승인에 실패했어요.' }, 400);
  }
  return json({ ok: true, state: 'done', method: tossBody.method ?? null });
});
