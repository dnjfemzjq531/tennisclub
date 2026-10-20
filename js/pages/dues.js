(async function () {
  'use strict';
  const { $, esc, won, avatar, courtSVG, toast, param, emptyState, dateLabel, periodLabel, loading, fail, busy } = UI;

  $('#hero-court').innerHTML = courtSVG();
  await TC.ready;
  const me = UI.requireLogin();
  if (!me) return;

  let clubId = param('club') && TC.membership(param('club'))?.status === 'active' ? param('club') : TC.currentClubId();
  let checked = new Set();
  let adminPeriod = TC.periodOf(0);

  if (!clubId) {
    $('#dues-root').innerHTML = emptyState('가입한 클럽이 없어요', '클럽에 가입하면 회비를 낼 수 있어요.',
      '<a class="btn btn-court" href="clubs.html">클럽 둘러보기</a>');
    return;
  }

  // 내 회비와(운영진이면) 월별 납부 현황을 불러와요.
  let myDues = [];
  let periods = [];
  let adminRows = [];
  async function loadMine() {
    myDues = await TC.dues(clubId);
  }
  async function loadAdmin() {
    if (!TC.isAdmin(clubId)) return;
    periods = await TC.duePeriods(clubId);
    if (!periods.includes(adminPeriod)) adminPeriod = periods[0] || TC.periodOf(0);
    adminRows = await TC.clubDues(clubId, adminPeriod);
  }
  async function loadAll() {
    $('#due-list').innerHTML = loading('회비를 불러오는 중이에요');
    try {
      await Promise.all([loadMine(), loadAdmin()]);
    } catch (err) { fail(err); }
  }

  function resetChecked() {
    checked = new Set(myDues.filter((d) => d.status === 'unpaid').map((d) => d.id));
  }

  function renderList() {
    const dues = myDues;
    const unpaid = dues.filter((d) => d.status === 'unpaid');
    $('#toggle-all').hidden = !unpaid.length;
    $('#toggle-all').textContent = unpaid.length && unpaid.every((d) => checked.has(d.id)) ? '선택 해제' : '미납 전체 선택';

    $('#due-list').innerHTML = dues.length ? dues.map((d) => {
      const isUnpaid = d.status === 'unpaid';
      const on = checked.has(d.id);
      return `<label class="due-row ${isUnpaid ? 'selectable' : 'paid'} ${on ? 'is-checked' : ''} reveal">
        ${isUnpaid ? `<input class="check" type="checkbox" data-due="${d.id}" ${on ? 'checked' : ''} aria-label="${periodLabel(d.period)} 회비 선택">` : '<span class="paid-dot" aria-hidden="true"></span>'}
        <div>
          <div class="period">${periodLabel(d.period)}</div>
          <div class="sub">${isUnpaid ? '<span class="badge badge-clay">미납</span>' : `<span class="badge badge-ball">납부 완료</span> ${dateLabel(d.paidAt)} · ${esc(d.method || '')}`}</div>
        </div>
        <div class="amt">${won(d.amount)}</div>
      </label>`;
    }).join('') : emptyState('회비 내역이 없어요', '이번 달 회비가 만들어지면 여기에 보여요.');
  }

  function renderSummary() {
    const club = TC.myClubs().find((c) => c.id === clubId);
    const dues = myDues.filter((d) => checked.has(d.id));
    const total = dues.reduce((s, d) => s + d.amount, 0);
    $('#pay-summary').innerHTML = `
      ${courtSVG('court-art')}
      <span class="eyebrow on-dark">Payment</span>
      <div>
        <p style="font-size:14px;color:var(--on-dark-muted);margin-bottom:6px">${esc(club.name)} · 선택한 회비</p>
        <div class="pay-total">${won(total)}</div>
      </div>
      <div class="pay-lines">
        ${dues.length ? dues.map((d) => `<div><span>${periodLabel(d.period)} 회비</span><b>${won(d.amount)}</b></div>`).join('')
          : '<div><span>결제할 회비를 선택해 주세요.</span></div>'}
      </div>
      <button class="btn btn-ball btn-lg btn-block" type="button" id="pay-btn" ${dues.length ? '' : 'disabled'}>
        ${dues.length ? `${won(total)} 결제하기` : '선택한 회비가 없어요'} <span class="arr">→</span>
      </button>
      <p style="font-size:12px;color:var(--on-dark-muted);text-align:center">토스페이먼츠 테스트 결제 · 실제 출금 없음</p>`;
  }

  function renderAdmin() {
    const box = $('#admin-box');
    if (!TC.isAdmin(clubId)) {
      box.hidden = true;
      return;
    }
    box.hidden = false;
    const rows = adminRows;
    const paid = rows.filter((r) => r.due && r.due.status === 'paid');
    const unpaidRows = rows.filter((r) => r.due && r.due.status === 'unpaid');
    const rate = rows.length ? paid.length / rows.length : 0;
    const C = 2 * Math.PI * 52;
    const collected = paid.reduce((s, r) => s + r.due.amount, 0);
    const outstanding = unpaidRows.reduce((s, r) => s + r.due.amount, 0);

    box.innerHTML = `
      <div class="admin-head">
        <div><span class="eyebrow">Admin only</span><h2 style="font-family:var(--font-display);font-size:clamp(32px,4vw,48px);letter-spacing:-.04em;margin-top:10px">회비 납부 현황</h2></div>
        <div class="pills">
          <label class="sr-only" for="period-sel">기간</label>
          <select class="select" id="period-sel" style="width:auto;border-radius:999px">
            ${periods.map((p) => `<option value="${p}" ${p === adminPeriod ? 'selected' : ''}>${periodLabel(p)}</option>`).join('')}
          </select>
          <button class="btn btn-clay" type="button" id="remind" ${unpaidRows.length ? '' : 'disabled'}>미납자 ${unpaidRows.length}명에게 알림</button>
        </div>
      </div>
      <div class="grid g-3" style="margin-bottom:20px">
        <div class="card ring-wrap">
          <svg class="ring" viewBox="0 0 120 120" aria-hidden="true">
            <circle class="bg" cx="60" cy="60" r="52"/>
            <circle class="fg" cx="60" cy="60" r="52" stroke-dasharray="${C}" stroke-dashoffset="${C * (1 - rate)}"/>
          </svg>
          <div><div class="ring-num">${Math.round(rate * 100)}%</div><p class="muted">납부율 · ${paid.length}/${rows.length}명</p></div>
        </div>
        <div class="card"><span class="eyebrow">Collected</span><div class="big-num" style="font-size:44px;margin-top:14px">${won(collected)}</div><p class="muted">걷힌 회비</p></div>
        <div class="card"><span class="eyebrow">Outstanding</span><div class="big-num" style="font-size:44px;margin-top:14px;color:var(--clay)">${won(outstanding)}</div><p class="muted">아직 안 걷힌 회비</p></div>
      </div>
      <div class="table-wrap">
        <table class="table">
          <thead><tr><th>회원</th><th>금액</th><th>상태</th><th>납부일 · 방법</th><th style="text-align:right">관리</th></tr></thead>
          <tbody>${rows.map(({ user, due }) => `<tr>
            <td><div class="person">${avatar(user, 'avatar-sm')}<div><b>${esc(user.name)}</b></div></div></td>
            <td>${due ? won(due.amount) : '-'}</td>
            <td>${!due ? '<span class="badge badge-line">해당 없음</span>' : due.status === 'paid' ? '<span class="badge badge-ball">납부</span>' : '<span class="badge badge-clay">미납</span>'}</td>
            <td>${due && due.paidAt ? `${dateLabel(due.paidAt)} · ${esc(due.method || '')}` : '-'}</td>
            <td><div class="actions">${due && due.status === 'unpaid' ? `<button class="btn btn-sm btn-ghost" type="button" data-manual="${due.id}">현금 납부 처리</button>` : ''}</div></td>
          </tr>`).join('')}</tbody>
        </table>
      </div>`;
  }

  function render() {
    UI.clubPills($('#club-pills'), clubId, async (id) => {
      clubId = id;
      TC.setCurrentClub(id);
      await loadAll();
      resetChecked();
      render();
    });
    renderList();
    renderSummary();
    renderAdmin();
    UI.reveal();
  }

  $('#due-list').addEventListener('change', (e) => {
    const cb = e.target.closest('[data-due]');
    if (!cb) return;
    if (cb.checked) checked.add(cb.dataset.due);
    else checked.delete(cb.dataset.due);
    cb.closest('.due-row').classList.toggle('is-checked', cb.checked);
    renderSummary();
    const unpaid = myDues.filter((d) => d.status === 'unpaid');
    $('#toggle-all').textContent = unpaid.every((d) => checked.has(d.id)) ? '선택 해제' : '미납 전체 선택';
  });

  $('#toggle-all').addEventListener('click', () => {
    const unpaid = myDues.filter((d) => d.status === 'unpaid');
    if (unpaid.every((d) => checked.has(d.id))) checked.clear();
    else unpaid.forEach((d) => checked.add(d.id));
    renderList();
    renderSummary();
    UI.reveal();
  });

  $('#pay-summary').addEventListener('click', (e) => {
    const btn = e.target.closest('#pay-btn');
    if (!btn) return;
    const dues = myDues.filter((d) => checked.has(d.id) && d.status === 'unpaid');
    if (!dues.length) return;
    // 주문서는 서버가 회비 금액을 더해서 만들어요. 결제 후 successUrl의 amount와 비교해요.
    busy(btn, async () => {
      try {
        const order = await TC.createOrder({ type: 'dues', refs: dues.map((d) => d.id) });
        location.href = `checkout.html?orderId=${encodeURIComponent(order.orderId)}`;
      } catch (err) {
        fail(err);
        await loadAll();
        resetChecked();
        render();
      }
    });
  });

  $('#admin-box').addEventListener('change', (e) => {
    if (e.target.id !== 'period-sel') return;
    adminPeriod = e.target.value;
    loadAdmin().then(renderAdmin, fail);
  });
  $('#admin-box').addEventListener('click', (e) => {
    if (e.target.closest('#remind')) {
      toast('알림 발송은 준비 중이에요. 지금은 연락처로 직접 안내해 주세요.');
      return;
    }
    const m = e.target.closest('[data-manual]');
    if (m) {
      busy(m, async () => {
        try {
          await TC.markDuesPaid([m.dataset.manual]);
          checked.delete(m.dataset.manual);
          toast('현금 납부로 처리했어요.');
        } catch (err) { fail(err); }
        await loadAll();
        render();
      });
    }
  });

  await loadAll();
  resetChecked();
  render();
})();
