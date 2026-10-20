(function () {
  'use strict';
  const { $, esc, param } = UI;

  const code = param('code') || 'UNKNOWN_ERROR';
  const message = param('message') || '결제 중 문제가 생겼어요.';
  const orderId = param('orderId');
  const order = orderId && TC.order(orderId);
  const canRetry = order && order.status === 'ready';
  const cancelled = code === 'PAY_PROCESS_CANCELED' || code === 'USER_CANCEL';

  $('#result').innerHTML = `<div class="result">
    <div class="result-mark fail"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg></div>
    <span class="eyebrow">${cancelled ? 'Payment cancelled' : 'Payment failed'}</span>
    <h1 style="margin-top:14px">${cancelled ? 'LET.<br>REPLAY.' : 'FAULT.'}</h1>
    <p class="muted">${cancelled ? '결제를 취소했어요. 다시 시도할 수 있어요.' : esc(message)}</p>
    <div class="receipt">
      <div class="lines">
        <div><span>에러 코드</span><b class="mono" style="font-size:12px">${esc(code)}</b></div>
        <div><span>메시지</span><b>${esc(message)}</b></div>
        ${orderId ? `<div><span>주문번호</span><b class="mono" style="font-size:12px">${esc(orderId)}</b></div>` : ''}
      </div>
    </div>
    <div class="result-actions">
      ${canRetry ? `<a class="btn btn-court" href="checkout.html?orderId=${encodeURIComponent(orderId)}">다시 결제하기</a>` : ''}
      <a class="btn btn-ghost" href="${order && order.type === 'market' ? 'market.html' : 'dues.html'}">돌아가기</a>
    </div>
  </div>`;
})();
