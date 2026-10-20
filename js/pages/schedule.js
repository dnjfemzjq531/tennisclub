(function () {
  'use strict';
  const { $, $$, esc, avatar, courtSVG, toast, param, emptyState, dday, parseYmd, DOW, openModal, closeModal } = UI;

  const me = UI.requireLogin();
  if (!me) return;

  $('#hero-court').innerHTML = courtSVG();

  let clubId = param('club') && TC.membership(param('club'))?.status === 'active' ? param('club') : TC.currentClubId();
  const focusGame = param('game');
  const today = TC.today();
  const t = parseYmd(today);
  let view = { y: t.getFullYear(), m: t.getMonth() };
  let selected = null;
  let range = 'upcoming';

  if (!clubId) {
    $('#sched-root').innerHTML = emptyState('가입한 클럽이 없어요', '클럽에 가입하면 경기 일정을 볼 수 있어요.',
      '<a class="btn btn-court" href="clubs.html">클럽 둘러보기</a>');
    return;
  }
  if (focusGame && TC.game(focusGame)) {
    selected = TC.game(focusGame).date;
    const d = parseYmd(selected);
    view = { y: d.getFullYear(), m: d.getMonth() };
  }

  const pad = (n) => String(n).padStart(2, '0');
  const RSVP = [['yes', '참석'], ['maybe', '미정'], ['no', '불참']];
  const TYPE_BADGE = { 정기전: 'badge-dark', 연습: 'badge-line', 대회: 'badge-clay', 교류전: 'badge-ball', 레슨: 'badge' };

  function renderPills() {
    UI.clubPills($('#club-pills'), clubId, (id) => {
      clubId = id;
      TC.setCurrentClub(id);
      selected = null;
      render();
    });
  }

  function renderCal() {
    const games = TC.games(clubId);
    const counts = games.reduce((acc, g) => { acc[g.date] = (acc[g.date] || 0) + 1; return acc; }, {});
    const first = new Date(view.y, view.m, 1);
    const start = new Date(first);
    start.setDate(1 - first.getDay());
    const cells = [];
    for (let i = 0; i < 42; i++) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      const key = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
      const cls = ['cal-day', d.getMonth() !== view.m && 'out', key === today && 'today', key === selected && 'is-selected'].filter(Boolean).join(' ');
      const n = Math.min(counts[key] || 0, 3);
      cells.push(`<button type="button" class="${cls}" data-date="${key}" aria-label="${d.getMonth() + 1}월 ${d.getDate()}일${n ? `, 일정 ${counts[key]}개` : ''}" aria-pressed="${key === selected}">
        ${d.getDate()}<span class="dots">${'<i></i>'.repeat(n)}</span></button>`);
    }
    $('#cal').innerHTML = `
      <div class="cal-head">
        <h3>${view.y}. ${pad(view.m + 1)}</h3>
        <div class="nav">
          <button class="icon-btn" type="button" data-nav="-1" aria-label="이전 달">←</button>
          <button class="icon-btn" type="button" data-nav="1" aria-label="다음 달">→</button>
        </div>
      </div>
      <div class="cal-grid">${DOW.map((w) => `<span class="cal-dow">${w}</span>`).join('')}${cells.join('')}</div>`;
  }

  function gameCard(g) {
    const d = parseYmd(g.date);
    const past = g.date < today;
    const groups = { yes: [], maybe: [], no: [] };
    Object.entries(g.rsvps).forEach(([uid, s]) => { const u = TC.user(uid); if (u && groups[s]) groups[s].push(u); });
    const mine = g.rsvps[me.id];
    const yes = groups.yes.length;
    const maybe = groups.maybe.length;
    const full = yes >= g.capacity;
    const admin = TC.isAdmin(clubId);

    return `<article class="game ${past ? 'is-past' : ''} reveal" id="game-${g.id}">
      <div class="game-date">
        <div class="m">${d.getFullYear()}.${pad(d.getMonth() + 1)}</div>
        <div class="d">${pad(d.getDate())}</div>
        <div class="w">${DOW[d.getDay()]}요일</div>
        <span class="dday">${dday(g.date)}</span>
      </div>
      <div class="game-main">
        <div class="game-top">
          <div>
            <span class="badge ${TYPE_BADGE[g.type] || 'badge'}">${esc(g.type)}</span>
            <h3>${esc(g.title)}</h3>
          </div>
          ${admin ? `<button class="icon-btn" type="button" data-del="${g.id}" aria-label="${esc(g.title)} 일정 삭제" title="일정 삭제">✕</button>` : ''}
        </div>
        <div class="game-info">
          <span>🕖 ${g.start} – ${g.end}</span>
          <span>📍 ${esc(g.court)}</span>
        </div>
        ${g.memo ? `<p class="game-memo">📣 ${esc(g.memo)}</p>` : ''}
        <div class="cap">
          <div class="cap-label"><span>참석 ${yes}명${maybe ? ` · 미정 ${maybe}명` : ''}</span><span>${full ? '정원 마감' : `정원 ${g.capacity}명`}</span></div>
          <div class="cap-bar" role="img" aria-label="정원 ${g.capacity}명 중 참석 ${yes}명">
            <span class="yes" style="width:${Math.min(100, (yes / g.capacity) * 100)}%"></span>
            <span class="maybe" style="width:${Math.max(0, Math.min(100 - (yes / g.capacity) * 100, (maybe / g.capacity) * 100))}%"></span>
          </div>
        </div>
        <div class="game-foot">
          <details class="attendees">
            <summary><span class="avatar-stack">${groups.yes.slice(0, 5).map((u) => avatar(u)).join('')}${yes > 5 ? `<span class="avatar more">+${yes - 5}</span>` : ''}</span> 응답 보기</summary>
            <div class="att-groups">
              ${RSVP.map(([k, label]) => `<div class="att-group"><h5>${label} ${groups[k].length}</h5>
                <ul>${groups[k].map((u) => `<li>${avatar(u, 'avatar-sm')}${esc(u.name)}</li>`).join('') || '<li class="muted">없음</li>'}</ul></div>`).join('')}
            </div>
          </details>
          ${past
            ? `<span class="badge badge-line">종료된 경기${mine ? ` · 내 응답 ${RSVP.find(([k]) => k === mine)[1]}` : ''}</span>`
            : `<div class="seg" role="group" aria-label="참석 여부">
                ${RSVP.map(([k, label]) => `<button type="button" class="${mine === k ? `on-${k}` : ''}" data-rsvp="${g.id}" data-status="${k}" aria-pressed="${mine === k}"
                  ${k === 'yes' && full && mine !== 'yes' ? 'disabled title="정원이 찼어요"' : ''}>${label}</button>`).join('')}
              </div>`}
        </div>
      </div>
    </article>`;
  }

  function renderList() {
    let games = TC.games(clubId);
    let caption;
    if (selected) {
      games = games.filter((g) => g.date === selected);
      caption = `${UI.dateLabel(selected)} 일정 · <button class="link-btn" type="button" data-clear>전체 보기</button>`;
    } else if (range === 'upcoming') {
      games = games.filter((g) => g.date >= today);
      caption = `${games.length}개의 일정`;
    } else {
      games = games.filter((g) => g.date < today).reverse();
      caption = `${games.length}개의 지난 일정`;
    }
    $$('#range [data-range]').forEach((b) => {
      const on = !selected && b.dataset.range === range;
      b.classList.toggle('is-active', on);
      b.setAttribute('aria-pressed', String(on));
    });
    $('#list-caption').innerHTML = caption;
    $('#game-list').innerHTML = games.length
      ? games.map(gameCard).join('')
      : emptyState(selected ? '이 날은 일정이 없어요' : '일정이 없어요',
        TC.isAdmin(clubId) ? '새 일정을 등록해 회원들에게 알려 주세요.' : '운영진이 일정을 등록하면 여기에 보여요.',
        TC.isAdmin(clubId) ? '<button class="btn btn-court" type="button" data-add>+ 새 일정 등록</button>' : '');
    UI.reveal();
  }

  function render() {
    renderPills();
    renderCal();
    renderList();
    $('#add-game').hidden = !TC.isAdmin(clubId);
  }

  $('#cal').addEventListener('click', (e) => {
    const nav = e.target.closest('[data-nav]');
    if (nav) {
      const d = new Date(view.y, view.m + Number(nav.dataset.nav), 1);
      view = { y: d.getFullYear(), m: d.getMonth() };
      return renderCal();
    }
    const day = e.target.closest('[data-date]');
    if (day) {
      selected = selected === day.dataset.date ? null : day.dataset.date;
      const d = parseYmd(day.dataset.date);
      if (d.getMonth() !== view.m) view = { y: d.getFullYear(), m: d.getMonth() };
      renderCal();
      renderList();
    }
  });

  $('#range').addEventListener('click', (e) => {
    const b = e.target.closest('[data-range]');
    if (!b) return;
    range = b.dataset.range;
    selected = null;
    renderCal();
    renderList();
  });

  function openAdd() {
    const f = $('#game-form');
    f.reset();
    f.elements.date.value = selected && selected >= today ? selected : today;
    f.elements.date.min = today;
    f.elements.court.value = TC.club(clubId).court;
    openModal('game-modal');
  }
  $('#add-game').addEventListener('click', openAdd);

  $('#sched-root').addEventListener('click', (e) => {
    if (e.target.closest('[data-clear]')) {
      selected = null;
      renderCal();
      return renderList();
    }
    if (e.target.closest('[data-add]')) return openAdd();
    const r = e.target.closest('[data-rsvp]');
    if (r) {
      const status = TC.rsvp(r.dataset.rsvp, r.dataset.status);
      toast(status ? `'${RSVP.find(([k]) => k === status)[1]}'으로 응답했어요.` : '응답을 취소했어요.');
      return renderList();
    }
    const del = e.target.closest('[data-del]');
    if (del) {
      const g = TC.game(del.dataset.del);
      if (!confirm(`'${g.title}' 일정을 삭제할까요? 참석 응답도 함께 지워져요.`)) return;
      TC.deleteGame(g.id);
      toast('일정을 삭제했어요.');
      render();
    }
  });

  $('#game-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const f = e.target;
    const v = (k) => f.elements[k].value.trim();
    if (!v('title') || !v('date') || !v('start') || !v('end') || !v('court')) {
      toast('필수 항목을 채워 주세요.', 'error');
      return;
    }
    if (v('end') <= v('start')) {
      toast('종료 시간이 시작 시간보다 늦어야 해요.', 'error');
      return;
    }
    const g = TC.createGame({
      clubId, title: v('title'), type: v('type'), date: v('date'), start: v('start'), end: v('end'),
      court: v('court'), capacity: Math.max(2, Number(v('capacity')) || 12), memo: v('memo'),
    });
    closeModal('game-modal');
    toast('새 일정을 등록했어요.');
    selected = g.date;
    const d = parseYmd(g.date);
    view = { y: d.getFullYear(), m: d.getMonth() };
    render();
  });

  render();
  if (focusGame) setTimeout(() => document.getElementById(`game-${focusGame}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 300);
})();
