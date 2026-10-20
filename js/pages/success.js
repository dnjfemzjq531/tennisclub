(function () {
  'use strict';
  const { $, esc, won, param } = UI;

  const root = $('#result');
  const paymentKey = param('paymentKey');
  const orderId = param('orderId');
  const amount = Number(param('amount'));
  const paymentType = param('paymentType');
  const order = TC.order(orderId);

  const failView = (title, desc) => `<div class="result">
    <div class="result-mark fail"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg></div>
    <h1>${title}</h1>
    <p class="muted">${desc}</p>
    <div class="result-actions" style="margin-top:28px"><a class="btn btn-court" href="index.html">홈으로</a></div>
  </div>`;

  if (!paymentKey || !order) {
    root.innerHTML = failView('주문을 찾을 수 없어요', '결제 정보가 올바르지 않아요. 결제 내역을 확인해 주세요.');
    return;
  }

  // 중요: successUrl의 amount가 결제 요청 때 저장한 금액과 같은지 반드시 확인해요.
  // 다르면 금액이 조작된 것일 수 있으니 결제 승인을 진행하면 안 돼요.
  if (order.amount !== amount) {
    root.innerHTML = failView('결제 금액이 달라요', `주문 금액(${won(order.amount)})과 결제 금액(${won(amount)})이 달라서 결제를 승인하지 않았어요.`);
    return;
  }

  /*
   * 실제 서비스에서는 여기서 우리 서버로 paymentKey, orderId, amount를 보내고,
   * 서버가 시크릿 키로 토스페이먼츠 결제 승인 API(POST /v1/payments/confirm)를 호출해야 결제가 끝나요.
   * 승인 요청을 보내지 않으면 10분 뒤 결제가 만료돼요.
   * 이 시안은 서버가 없어서 화면 확인용으로 바로 완료 처리해요.
   */
  const done = TC.completeOrder(orderId, paymentKey, paymentType);
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
        <div><span>결제 유형</span><b>${esc(paymentType || 'NORMAL')}</b></div>
      </div>
      <div class="total"><span>결제 금액</span><b>${won(done.amount)}</b></div>
    </div>

    <div class="result-actions">
      <a class="btn btn-court" href="${isDues ? 'dues.html' : 'market.html'}">${isDues ? '회비 내역 보기' : '마켓으로 돌아가기'}</a>
      <a class="btn btn-ghost" href="index.html">홈으로</a>
    </div>

    <div class="dev-note">
      <h4>개발 참고 · 결제 승인은 서버에서</h4>
      <p>퍼블리싱 시안이라 이 화면에서 바로 완료 처리했어요. 실제 서비스에서는 서버가 아래처럼 결제 승인 API를 호출한 뒤에 완료 처리해야 해요. 시크릿 키는 브라우저 코드에 넣으면 안 돼요.</p>
      <pre>POST https://api.tosspayments.com/v1/payments/confirm
Authorization: Basic base64("{시크릿 키}:")
Content-Type: application/json

{ "paymentKey": "${esc(paymentKey)}",
  "orderId": "${esc(done.orderId)}",
  "amount": ${done.amount} }</pre>
    </div>
  </div>`;
})();
