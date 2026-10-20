(async function () {
  'use strict';
  const { $, $$, esc, won, avatar, courtSVG, ballSVG, toast, param, emptyState, dateLabel, itemArt, itemCard, toneBg, openModal, closeModal, loading, fail, busy } = UI;

  $('#hero-court').innerHTML = courtSVG();
  const words = ['라켓', '스트링', '테니스화', '라켓백', '오버그립', '테니스공', '의류'];
  const chunk = `<span>${words.map((w) => `${w} ${ballSVG()}`).join(' ')}</span>`;
  $('#marquee').innerHTML = chunk + chunk;

  const MINE = '내 거래';
  let cat = '전체';
  let query = '';
  let sort = 'new';
  let onlySelling = false;
  let items = [];
  let editingId = null;
  const findItem = (id) => items.find((i) => i.id === id) || null;

  $('#item-grid').innerHTML = loading('상품을 불러오는 중이에요');
  await TC.ready;
  const me = TC.me();
  const CATS = ['전체', '라켓', '신발', '가방', '의류', '공·소모품', '기타', ...(me ? [MINE] : [])];
  if (me && param('filter') === 'mine') cat = MINE;

  $('#cats').innerHTML = CATS.map((c) => `<button class="pill ${c === cat ? 'is-active' : ''}" type="button" data-cat="${c}">${c}</button>`).join('');

  async function load() {
    items = await TC.items();
  }

  function render() {
    $$('#cats [data-cat]').forEach((b) => {
      b.classList.toggle('is-active', b.dataset.cat === cat);
      b.setAttribute('aria-pressed', String(b.dataset.cat === cat));
    });
    let list = items.slice();
    if (cat === MINE) list = list.filter((i) => i.sellerId === me.id || i.buyerId === me.id);
    else if (cat !== '전체') list = list.filter((i) => i.category === cat);
    if (onlySelling) list = list.filter((i) => i.status === 'selling');
    if (query) {
      const q = query.toLowerCase();
      list = list.filter((i) => `${i.title} ${i.desc} ${i.region}`.toLowerCase().includes(q));
    }
    if (sort === 'low') list.sort((a, b) => a.price - b.price);
    if (sort === 'high') list.sort((a, b) => b.price - a.price);

    $('#item-grid').innerHTML = list.length
      ? list.map(itemCard).join('')
      : `<div style="grid-column:1/-1">${emptyState(
        cat === MINE ? '아직 판매하거나 구매한 상품이 없어요' : '찾는 상품이 없어요',
        cat === MINE ? '안 쓰는 용품을 올려 보세요.' : '다른 카테고리나 검색어로 찾아보세요.')}</div>`;
    UI.reveal();
  }

  function showDetail(id) {
    const item = findItem(id);
    if (!item) return;
    const seller = TC.user(item.sellerId);
    const mine = me && me.id === item.sellerId;
    const bought = me && me.id === item.buyerId;
    const statusLabel = { selling: '판매중', reserved: '예약중', sold: '판매완료' }[item.status];

    let actions;
    if (mine && item.status !== 'sold') {
      actions = `<div class="field" style="margin-bottom:12px">
          <label for="status-sel">판매 상태</label>
          <select class="select" id="status-sel" data-status-item="${item.id}">
            <option value="selling" ${item.status === 'selling' ? 'selected' : ''}>판매중</option>
            <option value="reserved" ${item.status === 'reserved' ? 'selected' : ''}>예약중</option>
          </select>
          <span class="hint">판매완료는 구매자가 결제하면 자동으로 바뀌어요.</span>
        </div>
        <div style="display:flex;gap:8px">
          <button class="btn btn-ghost btn-block" type="button" data-edit="${item.id}">수정하기</button>
          <button class="btn btn-ghost btn-block" type="button" data-delete="${item.id}">삭제하기</button>
        </div>`;
    } else if (mine) {
      actions = `<button class="btn btn-block" type="button" disabled>판매가 끝난 상품이에요</button>`;
    } else if (bought) {
      actions = `<button class="btn btn-block" type="button" disabled>내가 구매한 상품이에요</button>`;
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
    if (!$('#item-modal').open) openModal('item-modal');
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

  async function reloadAndShow(id) {
    await load();
    render();
    if (id && findItem(id)) showDetail(id);
  }

  $('#item-detail').addEventListener('click', (e) => {
    const buy = e.target.closest('[data-buy]');
    if (buy) {
      if (!TC.me()) return UI.requireLogin();
      busy(buy, async () => {
        try {
          // 주문서는 서버가 상품 가격으로 금액을 정해서 만들어요.
          const order = await TC.createOrder({ type: 'market', refs: [buy.dataset.buy] });
          location.href = `checkout.html?orderId=${encodeURIComponent(order.orderId)}`;
        } catch (err) {
          fail(err);
          reloadAndShow(buy.dataset.buy).catch(fail);
        }
      });
      return;
    }
    const edit = e.target.closest('[data-edit]');
    if (edit) return openSell(findItem(edit.dataset.edit));
    const del = e.target.closest('[data-delete]');
    if (del) {
      if (!confirm('이 상품을 삭제할까요?')) return;
      busy(del, async () => {
        try {
          await TC.deleteItem(del.dataset.delete);
          closeModal('item-modal');
          toast('상품을 삭제했어요.');
          await load();
          render();
        } catch (err) { fail(err); }
      });
    }
  });
  $('#item-detail').addEventListener('change', (e) => {
    const sel = e.target.closest('[data-status-item]');
    if (!sel) return;
    busy(sel, async () => {
      try {
        await TC.updateItem(sel.dataset.statusItem, { status: sel.value });
        toast('판매 상태를 바꿨어요.');
      } catch (err) { fail(err); }
      await reloadAndShow(sel.dataset.statusItem).catch(fail);
    });
  });

  // 판매 등록과 수정이 같은 폼을 써요.
  function openSell(item) {
    const f = $('#sell-form');
    f.reset();
    editingId = item ? item.id : null;
    $('#sell-title').textContent = item ? '상품 수정' : '판매 등록';
    $('#sell-submit').textContent = item ? '수정하기' : '등록하기';
    if (item) {
      f.elements.title.value = item.title;
      f.elements.category.value = item.category;
      f.elements.condition.value = item.condition;
      f.elements.price.value = item.price;
      f.elements.region.value = item.region;
      f.elements.desc.value = item.desc || '';
      closeModal('item-modal');
    } else {
      const club = TC.myClubs()[0];
      if (club) f.elements.region.value = club.region;
    }
    openModal('sell-modal');
  }

  $('#sell-btn').addEventListener('click', () => {
    if (!TC.me()) return UI.requireLogin();
    openSell(null);
  });

  $('#sell-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const f = e.target;
    const v = (k) => f.elements[k].value.trim();
    const price = Number(v('price'));
    if (!v('title') || !v('region')) return toast('상품명과 거래 지역을 입력해 주세요.', 'error');
    if (!price || price < 1000) return toast('가격은 1,000원 이상으로 입력해 주세요.', 'error');
    const data = {
      title: v('title'), category: v('category'), condition: v('condition'),
      price: Math.round(price / 100) * 100, region: v('region'), desc: v('desc'),
    };
    busy($('#sell-submit'), async () => {
      try {
        if (editingId) {
          await TC.updateItem(editingId, data);
          closeModal('sell-modal');
          toast('상품 정보를 고쳤어요.');
          await reloadAndShow(editingId);
          return;
        }
        await TC.createItem(data);
        closeModal('sell-modal');
        toast('상품을 등록했어요.');
        cat = '전체';
        sort = 'new';
        $('#sort').value = 'new';
        await load();
        render();
      } catch (err) { fail(err); }
    });
  });

  try {
    await load();
  } catch (err) { fail(err); }
  render();
  if (param('item')) showDetail(param('item'));
})();
