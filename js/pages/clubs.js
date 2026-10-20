(async function () {
  'use strict';
  const { $, $$, esc, won, avatar, roleBadge, courtSVG, toast, openModal, closeModal, param, emptyState, loading, fail, busy } = UI;

  $('#hero-court').innerHTML = courtSVG();
  const grid = $('#club-grid');
  let filter = ['mine', 'open'].includes(param('filter')) ? param('filter') : 'all';
  let query = '';
  let allClubs = [];
  let membersByClub = {};

  // 클럽 목록과 활동 회원을 한 번에 불러와요.
  async function load() {
    allClubs = await TC.clubs();
    membersByClub = allClubs.length ? await TC.members(allClubs.map((c) => c.id)) : {};
  }

  function card(c) {
    const me = TC.me();
    const ms = me ? TC.membership(c.id) : null;
    const members = membersByClub[c.id] || [];
    let action;
    if (ms && ms.status === 'active') action = `<a class="btn btn-sm ${c.tone === 'ball' ? 'btn-court' : 'btn-ball'}" href="members.html?club=${c.id}">클럽 홈 →</a>`;
    else if (ms && ms.status === 'pending') action = '<span class="badge badge-cream">승인 대기중</span>';
    else action = `<button class="btn btn-sm ${c.tone === 'ball' ? 'btn-court' : 'btn-ball'}" type="button" data-join="${c.id}">${c.approval === 'auto' ? '바로 가입' : '가입 신청'}</button>`;

    return `<article class="club-card tone-${c.tone || 'paper'} reveal" data-club="${c.id}">
      ${courtSVG('court-art')}
      <div class="top">
        <span class="badge ${c.tone === 'ball' ? 'badge-dark' : 'badge-cream'}">${esc(c.region)}</span>
        ${ms && ms.status === 'active' ? roleBadge(ms.role) : ''}
      </div>
      <h3>${esc(c.name)}</h3>
      <p class="desc">${esc(c.desc || '')}</p>
      <div class="info">
        <span>📍 ${esc(c.court)}</span>
        <span>💳 월 ${won(c.monthlyFee)} · ${c.approval === 'auto' ? '바로 가입' : '승인제'}</span>
      </div>
      <div class="foot">
        <div style="display:flex;align-items:center;gap:10px">
          <div class="avatar-stack">${members.slice(0, 4).map((u) => avatar(u)).join('')}</div>
          <small>${members.length}명</small>
        </div>
        ${action}
      </div>
    </article>`;
  }

  function render() {
    const me = TC.me();
    $$('#filter [data-filter]').forEach((b) => {
      b.classList.toggle('is-active', b.dataset.filter === filter);
      b.setAttribute('aria-pressed', String(b.dataset.filter === filter));
    });
    let clubs = allClubs.slice();
    if (filter === 'mine') clubs = clubs.filter((c) => me && TC.membership(c.id)?.status === 'active');
    if (filter === 'open') clubs = clubs.filter((c) => !me || !TC.membership(c.id));
    if (query) {
      const q = query.toLowerCase();
      clubs = clubs.filter((c) => [c.name, c.region, c.court, c.desc].join(' ').toLowerCase().includes(q));
    }

    const newCard = `<button class="club-card club-new reveal" type="button" data-create>
      <span class="plus" aria-hidden="true">+</span>
      <h3>새 클럽 만들기</h3>
      <p class="muted">클럽장이 되어 회원과 일정, 회비를 관리해요.</p>
    </button>`;

    grid.innerHTML = clubs.length
      ? clubs.map(card).join('') + newCard
      : `<div style="grid-column:1/-1">${emptyState(
        filter === 'mine' ? '아직 가입한 클럽이 없어요' : '조건에 맞는 클럽이 없어요',
        '다른 검색어로 찾아보거나 직접 클럽을 만들어 보세요.',
        '<button class="btn btn-court" type="button" data-create>클럽 만들기</button>')}</div>`;
    UI.reveal();
  }

  $('#filter').addEventListener('click', (e) => {
    const b = e.target.closest('[data-filter]');
    if (!b) return;
    filter = b.dataset.filter;
    render();
  });
  $('#q').addEventListener('input', (e) => {
    query = e.target.value.trim();
    render();
  });

  function openCreate() {
    if (!TC.me()) return UI.requireLogin();
    openModal('create-modal');
  }

  grid.addEventListener('click', (e) => {
    if (e.target.closest('[data-create]')) return openCreate();
    const join = e.target.closest('[data-join]');
    if (join) {
      e.stopPropagation();
      if (!TC.me()) return UI.requireLogin();
      busy(join, async () => {
        try {
          const status = await TC.joinClub(join.dataset.join);
          if (status === 'active') membersByClub = await TC.members(allClubs.map((c) => c.id));
          toast(status === 'active' ? '가입했어요. 환영해요!' : '가입 신청을 보냈어요. 운영진 승인을 기다려 주세요.');
          render();
        } catch (err) { fail(err); }
      });
      return;
    }
    if (e.target.closest('a')) return;
    const c = e.target.closest('[data-club]');
    if (c) location.href = `members.html?club=${c.dataset.club}`;
  });

  $('#create-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const f = e.target;
    const bad = $$('input[required]', f).find((el) => !el.value.trim() || !el.checkValidity());
    if (bad) {
      bad.focus();
      toast('필수 항목을 채워 주세요.', 'error');
      return;
    }
    const v = (k) => f.elements[k].value.trim();
    busy(f.querySelector('[type=submit]'), async () => {
      try {
        const club = await TC.createClub({
          name: v('name'), region: v('region'), court: v('court'), desc: v('desc'),
          monthlyFee: Number(v('monthlyFee')), tone: v('tone'), approval: v('approval'),
        });
        TC.setCurrentClub(club.id);
        closeModal('create-modal');
        f.reset();
        toast(`'${club.name}' 클럽을 만들었어요. 이제 클럽장이에요!`);
        filter = 'mine';
        await load();
        render();
      } catch (err) { fail(err); }
    });
  });

  grid.innerHTML = loading('클럽을 불러오는 중이에요');
  await TC.ready;
  try {
    await load();
  } catch (err) {
    fail(err);
  }
  render();
  if (param('create') === '1') openCreate();
})();
