(async function () {
  'use strict';
  const { $, esc, won, param, ballSVG } = UI;

  const root = $('#result');
  const paymentKey = param('paymentKey');
  const orderId = param('orderId');
  const amount = Number(param('amount'));
  const paymentType = param('paymentType');

  const failView = (title, desc, retry = false) => `<div class="result">
    <div class="result-mark fail"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg></div>
    <h1>${title}</h1>
    <p class="muted">${desc}</p>
    <div class="result-actions" style="margin-top:28px">
      ${retry ? '<button class="btn btn-court" type="button" onclick="location.reload()">다시 확인하기</button>' : ''}
      <a class="btn ${retry ? 'btn-ghost' : 'btn-court'}" href="index.html">홈으로</a>
    </div>
  </div>`;

  root.innerHTML = `<div class="result"><div class="widget-loading">${ballSVG()}결제를 확인하고 있어요. 창을 닫지 말아 주세요.</div></div>`;
  await TC.ready;
  if (!UI.requireLogin()) return;

  if (!paymentKey || !orderId) {
    root.innerHTML = failView('주문을 찾을 수 없어요', '결제 정보가 올바르지 않아요. 결제 내역을 확인해 주세요.');
    return;
  }

  /*
   * 결제 승인은 서버(Supabase Edge Function payments-confirm)가 해요.
   * 서버가 저장된 주문 금액과 amount가 같은지 확인하고, 시크릿 키로 토스페이먼츠 승인 API를 호출해요.
   * 승인 요청을 보내지 않으면 10분 뒤 결제가 만료돼요.
   */
  let result = await TC.confirmPayment({ paymentKey, orderId, amount });
  // 다른 탭에서 같은 결제를 확인하는 중이면 잠깐 기다렸다가 주문 상태를 다시 봐요.
  for (let i = 0; i < 5 && result.code === 'IN_PROGRESS'; i++) {
    await new Promise((r) => setTimeout(r, 1500));
    const o = await TC.order(orderId).catch(() => null);
    if (o && o.status === 'done') result = { ok: true };
    else if (o && o.status !== 'confirming') result = { ok: false, message: o.failMessage || '결제를 승인하지 못했어요.' };
  }

  if (!result.ok) {
    if (result.code === 'AMOUNT_MISMATCH') {
      root.innerHTML = failView('결제 금액이 달라요', `주문 금액(${won(result.orderAmount)})과 결제 금액(${won(amount)})이 달라서 결제를 승인하지 않았어요.`);
    } else {
      const retry = ['NETWORK_ERROR', 'IN_PROGRESS', 'INTERNAL'].includes(result.code);
      root.innerHTML = failView('결제를 완료하지 못했어요', esc(result.message || '잠시 후 다시 시도해 주세요.'), retry);
    }
    return;
  }

  const done = await TC.order(orderId);
  const isDues = done.type === 'dues';

  root.innerHTML = `<div class="result">
    <div class="result-mark"><svg viewBox="0 0 24 24" fill="none" stroke="#0B1F17" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg></div>
    <span class="eyebrow">Payment complete</span>
    <h1 style="margin-top:14px">GAME, SET,<br>PAID.</h1>
    <p class="muted">${isDues ? '회비 납부가 완료됐어요. 이번 시즌도 코트에서 만나요!' : '결제가 완료됐어요. 판매자와 거래 일정을 잡아 보세요.'}</p>

    <div class="receipt">
      <div class="lines">
        <div><span>주문명</span><b>${esc(done.orderName)}</b></div>
        <div><span>주문번호</span><b class="mono" style="font-size:12px">${esc(done.orderId)}</b></div>
        <div><span>결제 유형</span><b>${esc(done.paymentType || paymentType || 'NORMAL')}</b></div>
      </div>
      <div class="total"><span>결제 금액</span><b>${won(done.amount)}</b></div>
    </div>

    <div class="result-actions">
      <a class="btn btn-court" href="${isDues ? 'dues.html' : 'market.html'}">${isDues ? '회비 내역 보기' : '마켓으로 돌아가기'}</a>
      <a class="btn btn-ghost" href="index.html">홈으로</a>
    </div>

  </div>`;
})();
