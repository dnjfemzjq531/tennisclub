(function () {
  'use strict';
  const { $, esc, won, avatar, roleBadge, courtSVG, toast, param, emptyState, dateLabel, periodLabel } = UI;

  const me = UI.requireLogin();
  if (!me) return;

  const clubId = param('club') || TC.currentClubId();
  const club = clubId && TC.club(clubId);
  const hero = $('#club-hero');
  const body = $('#club-body');

  if (!club) {
    hero.innerHTML = `<div class="court-art">${courtSVG()}</div><div class="container"><span class="hero-index">CLUB</span><h1 class="display">NO <span class="hl">CLUB.</span></h1></div>`;
    body.innerHTML = emptyState('아직 선택된 클럽이 없어요', '클럽을 찾아 가입하거나 새로 만들어 보세요.',
      '<a class="btn btn-court" href="clubs.html">클럽 둘러보기</a>');
    return;
  }

  let tab = 'members';

  function renderHero() {
    const ms = TC.membership(club.id);
    const active = ms && ms.status === 'active';
    const members = TC.members(club.id);
    const upcoming = TC.games(club.id).filter((g) => g.date >= TC.today()).length;
    const period = TC.periodOf(0);
    const dues = TC.clubDues(club.id, period);
    const paid = dues.filter((d) => d.due && d.due.status === 'paid').length;
    const rate = dues.length ? Math.round((paid / dues.length) * 100) : 0;

    hero.innerHTML = `
      <div class="court-art">${courtSVG()}</div>
      <div class="container">
        <span class="hero-index">CLUB / ${esc(club.region)}</span>
        <div class="hero-row">
          <div>
            <h1 class="display" style="font-size:clamp(48px,8vw,120px)">${esc(club.name)}</h1>
            <p class="lead">${esc(club.desc || '')}</p>
          </div>
          <div class="pills">
            ${active ? `
              <a class="btn btn-ball" href="schedule.html?club=${club.id}">일정 보기 <span class="arr">→</span></a>
              <a class="btn btn-ghost" href="dues.html?club=${club.id}">회비</a>` : ''}
          </div>
        </div>
        <div class="club-hero-stats">
          <div><b>${members.length}</b><span>활동 회원</span></div>
          <div><b>${won(club.monthlyFee).replace('원', '')}</b><span>월 회비 (원)</span></div>
          <div><b>${upcoming}</b><span>예정된 경기</span></div>
          <div><b>${rate}%</b><span>${periodLabel(period)} 회비 납부율</span></div>
          <div><b style="font-size:20px;padding-top:14px">${active ? roleBadge(ms.role) : '<span class="badge badge-cream">비회원</span>'}</b><span>내 역할</span></div>
        </div>
      </div>`;
  }

  function memberTable() {
    const admin = TC.isAdmin(club.id);
    const owner = TC.isOwner(club.id);
    const rows = TC.members(club.id).map((u) => {
      const self = u.id === me.id;
      let manage = '';
      if (admin && !self && u.role !== 'owner') {
        manage = `<div class="actions">
          ${owner ? `<select class="select" data-role="${u.id}" aria-label="${esc(u.name)} 역할">
              <option value="member" ${u.role === 'member' ? 'selected' : ''}>회원</option>
              <option value="admin" ${u.role === 'admin' ? 'selected' : ''}>운영진</option>
            </select>` : ''}
          ${owner || u.role === 'member' ? `<button class="btn btn-sm btn-ghost" type="button" data-kick="${u.id}">내보내기</button>` : ''}
        </div>`;
      }
      return `<tr>
        <td><div class="person">${avatar(u)}<div><b>${esc(u.name)}${self ? ' <span class="badge badge-ball" style="height:20px">나</span>' : ''}</b><small>${esc(u.email)}</small></div></div></td>
        <td class="mono">${esc(u.ntrp)}</td>
        <td>${roleBadge(u.role)}</td>
        <td>${dateLabel(u.joinedAt)}</td>
        ${admin ? `<td class="mono">${esc(u.phone)}</td>` : ''}
        <td>${manage}</td>
      </tr>`;
    }).join('');
    return `<div class="table-wrap reveal">
      <table class="table">
        <thead><tr><th>회원</th><th>NTRP</th><th>역할</th><th>가입일</th>${admin ? '<th>연락처</th>' : ''}<th style="text-align:right">${admin ? '관리' : ''}</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
  }

  function pendingList() {
    const list = TC.members(club.id, 'pending');
    if (!list.length) return emptyState('대기 중인 신청이 없어요', '새 가입 신청이 오면 여기에 보여요.');
    return `<div class="pending-list">${list.map((u) => `
      <div class="pending-card reveal">
        <div class="person">${avatar(u, 'avatar-lg')}<div><b>${esc(u.name)}</b><small>NTRP ${esc(u.ntrp)} · ${esc(u.email)} · ${dateLabel(u.joinedAt)} 신청</small></div></div>
        <div class="pills">
          <button class="btn btn-sm btn-ghost" type="button" data-reject="${u.id}">거절</button>
          <button class="btn btn-sm btn-court" type="button" data-approve="${u.id}">승인하기</button>
        </div>
      </div>`).join('')}</div>`;
  }

  function settingsForm() {
    return `<form class="card reveal" id="settings-form" novalidate style="max-width:760px">
      <div class="form-grid">
        <div class="field span-2"><label for="s-name">클럽 이름</label><input class="input" id="s-name" name="name" value="${esc(club.name)}" required></div>
        <div class="field"><label for="s-region">활동 지역</label><input class="input" id="s-region" name="region" value="${esc(club.region)}" required></div>
        <div class="field"><label for="s-court">주 코트</label><input class="input" id="s-court" name="court" value="${esc(club.court)}" required></div>
        <div class="field span-2"><label for="s-desc">클럽 소개</label><textarea class="textarea" id="s-desc" name="desc">${esc(club.desc || '')}</textarea></div>
        <div class="field"><label for="s-fee">월 회비 (원)</label><input class="input" id="s-fee" name="monthlyFee" type="number" min="0" step="1000" value="${club.monthlyFee}" required>
          <span class="hint">바꾼 금액은 다음에 만들어지는 회비부터 적용돼요.</span></div>
        <div class="field"><span class="label">가입 방식</span>
          <div class="radio-cards">
            <label class="radio-card"><input type="radio" name="approval" value="manual" ${club.approval !== 'auto' ? 'checked' : ''}><span>운영진 승인</span></label>
            <label class="radio-card"><input type="radio" name="approval" value="auto" ${club.approval === 'auto' ? 'checked' : ''}><span>바로 가입</span></label>
          </div>
        </div>
      </div>
      <div style="display:flex;justify-content:flex-end;margin-top:24px"><button class="btn btn-court" type="submit">설정 저장</button></div>
    </form>`;
  }

  function renderBody() {
    const ms = TC.membership(club.id);
    const active = ms && ms.status === 'active';

    if (!active) {
      body.innerHTML = `<div class="card join-panel reveal">
        <div>
          <span class="eyebrow">Join the club</span>
          <h2 style="font-size:28px;margin:10px 0 6px;letter-spacing:-.03em">${ms ? '가입 신청을 검토하고 있어요.' : `${esc(club.name)}에 함께해요.`}</h2>
          <p class="muted">${ms ? '운영진이 승인하면 일정과 회비 메뉴를 쓸 수 있어요.' : `📍 ${esc(club.court)} · 월 회비 ${won(club.monthlyFee)}`}</p>
        </div>
        ${ms ? '<button class="btn btn-ghost" type="button" data-cancel>신청 취소</button>'
          : `<button class="btn btn-court btn-lg" type="button" data-join>${club.approval === 'auto' ? '바로 가입하기' : '가입 신청하기'}</button>`}
      </div>
      <div style="margin-top:48px">
        <div class="sec-head"><div><span class="eyebrow">Members</span><h2>함께하는 회원</h2></div></div>
        <div class="grid g-4">${TC.members(club.id).map((u) => `<div class="card person reveal">${avatar(u)}<div><b>${esc(u.name)}</b><small>NTRP ${esc(u.ntrp)}</small></div></div>`).join('')}</div>
      </div>`;
      UI.reveal();
      return;
    }

    const admin = TC.isAdmin(club.id);
    const pendingCount = TC.members(club.id, 'pending').length;
    if (!admin && tab !== 'members') tab = 'members';

    body.innerHTML = `
      <div class="tabs" role="tablist">
        <button class="tab ${tab === 'members' ? 'is-active' : ''}" type="button" role="tab" data-tab="members" aria-selected="${tab === 'members'}">회원 목록</button>
        ${admin ? `
          <button class="tab ${tab === 'pending' ? 'is-active' : ''}" type="button" role="tab" data-tab="pending" aria-selected="${tab === 'pending'}">가입 신청${pendingCount ? `<span class="count">${pendingCount}</span>` : ''}</button>
          <button class="tab ${tab === 'settings' ? 'is-active' : ''}" type="button" role="tab" data-tab="settings" aria-selected="${tab === 'settings'}">클럽 설정</button>` : ''}
      </div>
      <div role="tabpanel">
        ${tab === 'members' ? memberTable() : tab === 'pending' ? pendingList() : settingsForm()}
      </div>
      ${ms.role !== 'owner' ? `<div style="margin-top:40px;text-align:right"><button class="link-btn muted" type="button" data-leave>클럽 탈퇴하기</button></div>` : ''}`;
    UI.reveal();
  }

  function render() {
    renderHero();
    renderBody();
  }

  body.addEventListener('click', (e) => {
    const t = e.target;
    const tabBtn = t.closest('[data-tab]');
    if (tabBtn) { tab = tabBtn.dataset.tab; return renderBody(); }

    if (t.closest('[data-join]')) {
      const status = TC.joinClub(club.id);
      if (status === 'active') TC.setCurrentClub(club.id);
      toast(status === 'active' ? '가입했어요. 환영해요!' : '가입 신청을 보냈어요.');
      return render();
    }
    if (t.closest('[data-cancel]')) {
      TC.leaveClub(club.id);
      toast('가입 신청을 취소했어요.');
      return render();
    }
    if (t.closest('[data-leave]')) {
      if (!confirm(`${club.name}에서 탈퇴할까요? 미납 회비 기록도 함께 정리돼요.`)) return;
      TC.leaveClub(club.id);
      toast('클럽에서 탈퇴했어요.');
      return render();
    }
    const ap = t.closest('[data-approve]');
    if (ap) {
      TC.approve(club.id, ap.dataset.approve);
      toast(`${TC.user(ap.dataset.approve).name}님을 승인했어요.`);
      return render();
    }
    const rj = t.closest('[data-reject]');
    if (rj) {
      TC.reject(club.id, rj.dataset.reject);
      toast('가입 신청을 거절했어요.');
      return render();
    }
    const kick = t.closest('[data-kick]');
    if (kick) {
      const u = TC.user(kick.dataset.kick);
      if (!confirm(`${u.name}님을 클럽에서 내보낼까요?`)) return;
      TC.leaveClub(club.id, u.id);
      toast(`${u.name}님을 내보냈어요.`);
      return render();
    }
  });

  body.addEventListener('change', (e) => {
    const sel = e.target.closest('[data-role]');
    if (!sel) return;
    TC.setRole(club.id, sel.dataset.role, sel.value);
    toast(`${TC.user(sel.dataset.role).name}님의 역할을 ${sel.value === 'admin' ? '운영진' : '회원'}으로 바꿨어요.`);
    renderBody();
  });

  body.addEventListener('submit', (e) => {
    if (e.target.id !== 'settings-form') return;
    e.preventDefault();
    const f = e.target;
    const v = (k) => f.elements[k].value.trim();
    if (!v('name') || !v('region') || !v('court')) {
      toast('이름, 지역, 코트는 꼭 입력해 주세요.', 'error');
      return;
    }
    TC.updateClub(club.id, {
      name: v('name'), region: v('region'), court: v('court'), desc: v('desc'),
      monthlyFee: Number(v('monthlyFee')) || 0, approval: v('approval'),
    });
    toast('클럽 설정을 저장했어요.');
    render();
  });

  if (TC.membership(club.id)?.status === 'active') TC.setCurrentClub(club.id);
  render();
})();
