(function () {
  'use strict';
  const { $, $$, esc, won, avatar, courtSVG, ballSVG, toast, param, emptyState, dateLabel, itemArt, itemCard, toneBg, openModal, closeModal } = UI;

  $('#hero-court').innerHTML = courtSVG();
  const words = ['라켓', '스트링', '테니스화', '라켓백', '오버그립', '테니스공', '의류'];
  const chunk = `<span>${words.map((w) => `${w} ${ballSVG()}`).join(' ')}</span>`;
  $('#marquee').innerHTML = chunk + chunk;

  const CATS = ['전체', '라켓', '신발', '가방', '의류', '공·소모품', '기타'];
  let cat = '전체';
  let query = '';
  let sort = 'new';
  let onlySelling = false;

  $('#cats').innerHTML = CATS.map((c) => `<button class="pill ${c === cat ? 'is-active' : ''}" type="button" data-cat="${c}">${c}</button>`).join('');

  function render() {
    $$('#cats [data-cat]').forEach((b) => {
      b.classList.toggle('is-active', b.dataset.cat === cat);
      b.setAttribute('aria-pressed', String(b.dataset.cat === cat));
    });
    let items = TC.items();
    if (cat !== '전체') items = items.filter((i) => i.category === cat);
    if (onlySelling) items = items.filter((i) => i.status === 'selling');
    if (query) {
      const q = query.toLowerCase();
      items = items.filter((i) => `${i.title} ${i.desc} ${i.region}`.toLowerCase().includes(q));
    }
    if (sort === 'low') items.sort((a, b) => a.price - b.price);
    if (sort === 'high') items.sort((a, b) => b.price - a.price);

    $('#item-grid').innerHTML = items.length
      ? items.map(itemCard).join('')
      : `<div style="grid-column:1/-1">${emptyState('찾는 상품이 없어요', '다른 카테고리나 검색어로 찾아보세요.')}</div>`;
    UI.reveal();
  }

  function showDetail(id) {
    const item = TC.item(id);
    if (!item) return;
    const me = TC.me();
    const seller = TC.user(item.sellerId);
    const mine = me && me.id === item.sellerId;
    const statusLabel = { selling: '판매중', reserved: '예약중', sold: '판매완료' }[item.status];

    let actions;
    if (mine) {
      actions = `<div class="field" style="margin-bottom:12px">
          <label for="status-sel">판매 상태</label>
          <select class="select" id="status-sel" data-status-item="${item.id}">
            <option value="selling" ${item.status === 'selling' ? 'selected' : ''}>판매중</option>
            <option value="reserved" ${item.status === 'reserved' ? 'selected' : ''}>예약중</option>
            <option value="sold" ${item.status === 'sold' ? 'selected' : ''}>판매완료</option>
          </select>
        </div>
        <button class="btn btn-ghost btn-block" type="button" data-delete="${item.id}">삭제하기</button>`;
    } else if (item.status === 'selling') {
      actions = `<button class="btn btn-court btn-lg btn-block" type="button" data-buy="${item.id}">안전결제로 구매하기 <span class="arr">→</span></button>
        <p class="hint" style="margin-top:10px;text-align:center">토스페이먼츠로 결제해요. 테스트 환경이라 실제 출금은 없어요.</p>`;
    } else {
      actions = `<button class="btn btn-block" type="button" disabled>${statusLabel} 상품이에요</button>`;
    }

    $('#item-detail').innerHTML = `<div class="item-detail">
      <div class="item-art" style="background:${toneBg(item.tone)}">${itemArt(item.category, item.tone)}</div>
      <div>
        <span class="badge ${item.status === 'selling' ? 'badge-ball' : item.status === 'reserved' ? 'badge-clay' : 'badge-dark'}">${statusLabel}</span>
        <h3 id="item-title">${esc(item.title)}</h3>
        <p class="price">${won(item.price)}</p>
        <p class="desc">${esc(item.desc || '설명이 없어요.')}</p>
        <dl class="spec">
          <dt>카테고리</dt><dd>${esc(item.category)}</dd>
          <dt>상태</dt><dd>${esc(item.condition)}</dd>
          <dt>거래 지역</dt><dd>${esc(item.region)}</dd>
          <dt>등록일</dt><dd>${dateLabel(item.createdAt)}</dd>
        </dl>
        <div class="person" style="margin:22px 0;padding:14px;border:1px solid var(--line);border-radius:16px">
          ${avatar(seller)}<div><b>${esc(seller?.name || '알 수 없음')}${mine ? ' (나)' : ''}</b><small>판매자 · NTRP ${esc(seller?.ntrp || '-')}</small></div>
        </div>
        ${actions}
      </div>
    </div>`;
    openModal('item-modal');
  }

  $('#cats').addEventListener('click', (e) => {
    const b = e.target.closest('[data-cat]');
    if (!b) return;
    cat = b.dataset.cat;
    render();
  });
  $('#q').addEventListener('input', (e) => { query = e.target.value.trim(); render(); });
  $('#sort').addEventListener('change', (e) => { sort = e.target.value; render(); });
  $('#only-selling').addEventListener('change', (e) => { onlySelling = e.target.checked; render(); });

  const grid = $('#item-grid');
  grid.addEventListener('click', (e) => {
    const card = e.target.closest('[data-item]');
    if (card) showDetail(card.dataset.item);
  });
  grid.addEventListener('keydown', (e) => {
    const card = e.target.closest('[data-item]');
    if (card && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      showDetail(card.dataset.item);
    }
  });

  $('#item-detail').addEventListener('click', (e) => {
    const buy = e.target.closest('[data-buy]');
    if (buy) {
      if (!TC.me()) return UI.requireLogin();
      const item = TC.item(buy.dataset.buy);
      if (item.status !== 'selling') return toast('지금은 구매할 수 없는 상품이에요.', 'error');
      // 결제 전에 주문서를 만들어 금액을 저장해 두고, 결제 후 금액이 같은지 확인해요.
      const order = TC.createOrder({ type: 'market', refs: [item.id], amount: item.price, orderName: item.title.slice(0, 100) });
      location.href = `checkout.html?orderId=${encodeURIComponent(order.orderId)}`;
      return;
    }
    const del = e.target.closest('[data-delete]');
    if (del) {
      if (!confirm('이 상품을 삭제할까요?')) return;
      TC.deleteItem(del.dataset.delete);
      closeModal('item-modal');
      toast('상품을 삭제했어요.');
      render();
    }
  });
  $('#item-detail').addEventListener('change', (e) => {
    const sel = e.target.closest('[data-status-item]');
    if (!sel) return;
    TC.updateItem(sel.dataset.statusItem, { status: sel.value });
    toast('판매 상태를 바꿨어요.');
    render();
    showDetail(sel.dataset.statusItem);
  });

  $('#sell-btn').addEventListener('click', () => {
    const me = TC.me();
    if (!me) return UI.requireLogin();
    const club = TC.myClubs()[0];
    const f = $('#sell-form');
    f.reset();
    if (club) f.elements.region.value = club.region;
    openModal('sell-modal');
  });

  $('#sell-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const f = e.target;
    const v = (k) => f.elements[k].value.trim();
    const price = Number(v('price'));
    if (!v('title') || !v('region')) return toast('상품명과 거래 지역을 입력해 주세요.', 'error');
    if (!price || price < 1000) return toast('가격은 1,000원 이상으로 입력해 주세요.', 'error');
    TC.createItem({
      title: v('title'), category: v('category'), condition: v('condition'),
      price: Math.round(price / 100) * 100, region: v('region'), desc: v('desc'),
    });
    closeModal('sell-modal');
    toast('상품을 등록했어요.');
    cat = '전체';
    sort = 'new';
    $('#sort').value = 'new';
    render();
  });

  render();
  if (param('item')) showDetail(param('item'));
})();
