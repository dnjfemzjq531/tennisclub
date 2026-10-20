(async function () {
  'use strict';
  const { $, esc, won, courtSVG, ballSVG, toast, param, emptyState, periodLabel, fail } = UI;

  $('#hero-court').innerHTML = courtSVG();
  $('#loading-ball').outerHTML = ballSVG();
  await TC.ready;
  const me = UI.requireLogin();
  if (!me) return;

  let order = null;
  let lines = '';
  try {
    order = await TC.order(param('orderId'));
    // 주문 요약에 쓸 회비·상품 정보
    if (order && order.type === 'dues') {
      const dues = await TC.duesByIds(order.refs);
      lines = dues.map((d) => `<div><span>${periodLabel(d.period)} 회비</span><b>${won(d.amount)}</b></div>`).join('');
    } else if (order && order.type === 'market' && order.refs[0]) {
      const item = await TC.item(order.refs[0]);
      const seller = item && TC.user(item.sellerId);
      lines = item ? `
        <div><span>상품</span><b>${esc(item.title)}</b></div>
        <div><span>상태</span><b>${esc(item.condition)}</b></div>
        <div><span>판매자</span><b>${esc(seller?.name || '-')}</b></div>
        <div><span>거래 지역</span><b>${esc(item.region)}</b></div>` : '';
    }
  } catch (err) { fail(err); }

  if (!order || order.status !== 'ready') {
    $('#checkout-root').innerHTML = emptyState(
      order && order.status === 'done' ? '이미 결제가 끝난 주문이에요'
        : order && order.status === 'expired' ? '결제 시간이 지난 주문이에요' : '주문 정보를 찾을 수 없어요',
      '회비나 중고거래 화면에서 다시 결제를 시작해 주세요.',
      '<a class="btn btn-court" href="dues.html">회비 납부</a> <a class="btn btn-ghost" href="market.html">중고거래</a>');
    return;
  }

  $('#receipt').innerHTML = `
    <div class="receipt-head">
      <span class="badge ${order.type === 'dues' ? 'badge-ball' : 'badge-clay'}">${order.type === 'dues' ? '회비 납입' : '중고거래 안전결제'}</span>
      <h2>${esc(order.orderName)}</h2>
    </div>
    <div class="lines">
      ${lines}
      <div><span>주문자</span><b>${esc(me.name)}</b></div>
      <div><span>주문번호</span><b class="mono" style="font-size:12px">${esc(order.orderId)}</b></div>
    </div>
    <div class="total"><span>총 결제 금액</span><b>${won(order.amount)}</b></div>
    <a class="link-btn muted" style="display:inline-block;margin-top:20px;font-size:13px" href="${order.type === 'dues' ? 'dues.html' : 'market.html'}">← 돌아가기</a>`;

  /* 토스페이먼츠 주문서형 결제(결제위젯) 연동 */
  const payButton = $('#pay-button');
  payButton.textContent = `${won(order.amount)} 결제하기`;

  async function initWidget() {
    if (typeof window.TossPayments !== 'function') {
      $('#payment-method').innerHTML = emptyState('결제 모듈을 불러오지 못했어요', '네트워크 상태를 확인하고 새로고침해 주세요.',
        '<button class="btn btn-court" type="button" onclick="location.reload()">새로고침</button>');
      return;
    }
    try {
      const { CLIENT_KEY, VARIANT_KEY, AGREEMENT_VARIANT_KEY } = window.TOSS_CONFIG;
      const tossPayments = window.TossPayments(CLIENT_KEY);
      // 회원 결제: 유추할 수 없는 고유 값(UUID)을 customerKey로 써요.
      const widgets = tossPayments.widgets({ customerKey: me.customerKey });

      // 결제 UI를 렌더링하기 전에 반드시 금액을 먼저 설정해요.
      await widgets.setAmount({ currency: 'KRW', value: order.amount });

      $('#payment-method').innerHTML = '';
      await Promise.all([
        widgets.renderPaymentMethods({ selector: '#payment-method', variantKey: VARIANT_KEY }),
        widgets.renderAgreement({ selector: '#agreement', variantKey: AGREEMENT_VARIANT_KEY }),
      ]);
      payButton.disabled = false;

      payButton.addEventListener('click', async () => {
        payButton.disabled = true;
        // 현재 폴더 기준 경로라서 하위 폴더에 배포해도 동작해요.
        const base = location.href.replace(/[?#].*$/, '').replace(/[^/]*$/, '');
        try {
          await widgets.requestPayment({
            orderId: order.orderId,
            orderName: order.orderName,
            successUrl: `${base}success.html`,
            failUrl: `${base}fail.html`,
            customerEmail: me.email,
            customerName: me.name,
            customerMobilePhone: (me.phone || '').replace(/\D/g, '') || undefined,
          });
        } catch (err) {
          // 결제창을 닫는 등 사용자가 취소한 경우에도 여기로 와요.
          toast(err.message || '결제를 진행하지 못했어요.', 'error');
          payButton.disabled = false;
        }
      });
    } catch (err) {
      console.error(err);
      $('#payment-method').innerHTML = emptyState('결제 수단을 표시하지 못했어요', esc(err.message || '잠시 후 다시 시도해 주세요.'));
    }
  }

  initWidget();
})();
