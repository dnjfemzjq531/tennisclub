(function () {
  'use strict';
  const { $, esc, won, dateLabel, dday, avatar, roleBadge, ballSVG, courtSVG, itemCard, emptyState } = UI;

  // 장식 요소
  $('#hero-court').outerHTML = courtSVG('hero-court', true);
  $('#hero-ball').outerHTML = ballSVG('hero-ball');
  $('#cta-court').outerHTML = courtSVG('court-art');
  const words = ['매치 일정', '참석 체크', '회비 납부', '중고 라켓', '클럽 운영', '복식 리그', '토요 정기전'];
  const chunk = `<span>${words.map((w) => `${w} ${ballSVG()}`).join(' ')}</span>`;
  $('#marquee').innerHTML = chunk + chunk;

  const me = TC.me();

  /* 대시보드 */
  const dash = $('#dash');
  if (!me) {
    dash.innerHTML = `<article class="dash-card dash-next reveal" style="grid-column:1/-1">
      ${courtSVG('court-art')}
      <p class="eyebrow on-dark">Welcome</p>
      <h3 class="big-num">코트에 들어오세요.</h3>
      <p class="meta">로그인하면 내 클럽 일정과 회비를 바로 볼 수 있어요.</p>
      <div class="foot"><a class="btn btn-ball" href="auth.html">로그인 / 회원가입 <span class="arr">→</span></a></div>
    </article>`;
  } else {
    const next = TC.upcomingGames(1)[0];
    const unpaid = TC.unpaidSummary();
    const clubs = TC.myClubs();
    const yesCount = next ? Object.values(next.rsvps).filter((v) => v === 'yes').length : 0;
    const myRsvp = next ? next.rsvps[me.id] : null;
    const rsvpLabel = { yes: '참석', maybe: '미정', no: '불참' };

    dash.innerHTML = `
      <article class="dash-card dash-next reveal">
        ${courtSVG('court-art')}
        <p class="eyebrow on-dark">Next Match</p>
        ${next ? `
          <div class="big-num hl">${dday(next.date)}</div>
          <h3>${esc(next.title)}</h3>
          <p class="meta">${esc(next.club.name)}<br>${dateLabel(next.date)} ${next.start}–${next.end} · ${esc(next.court)}</p>
          <div class="foot">
            <span class="badge ${myRsvp ? 'badge-ball' : 'badge-cream'}">${myRsvp ? `내 응답: ${rsvpLabel[myRsvp]}` : '아직 응답 안 했어요'}</span>
            <span class="badge badge-cream">참석 ${yesCount}/${next.capacity}</span>
            <a class="btn btn-ball btn-sm" href="schedule.html" style="margin-left:auto">참석 체크 <span class="arr">→</span></a>
          </div>` : `
          <h3 style="margin-top:12px">예정된 경기가 없어요.</h3>
          <p class="meta">클럽에 가입하면 일정이 여기에 떠요.</p>
          <div class="foot"><a class="btn btn-ball btn-sm" href="clubs.html">클럽 찾기</a></div>`}
      </article>

      <article class="dash-card dash-dues reveal d1">
        <p class="eyebrow">Unpaid Dues</p>
        <div class="big-num">${won(unpaid.total)}</div>
        <p class="meta">${unpaid.count ? `미납 회비 ${unpaid.count}건이 있어요.` : '밀린 회비가 없어요. 깔끔해요!'}</p>
        <div class="foot"><a class="btn btn-court" href="dues.html">${unpaid.count ? '회비 납부하기' : '납부 내역 보기'} <span class="arr">→</span></a></div>
      </article>

      <article class="dash-card dash-clubs reveal d2">
        <p class="eyebrow">My Clubs · ${clubs.length}</p>
        ${clubs.length ? `<ul>${clubs.map((c) => `
          <li><a class="club-mini" href="members.html?club=${c.id}"><span>${esc(c.name)}</span>${roleBadge(c.role)}</a></li>`).join('')}</ul>`
          : '<p class="meta">아직 가입한 클럽이 없어요.</p>'}
        <div class="foot"><a class="btn btn-ghost btn-sm" href="clubs.html">클럽 둘러보기 <span class="arr">→</span></a></div>
      </article>`;
  }

  /* 다가오는 경기 */
  const up = $('#upcoming');
  const games = me ? TC.upcomingGames(4) : [];
  up.innerHTML = games.length
    ? games.map((g) => {
      const attendees = Object.entries(g.rsvps).filter(([, v]) => v === 'yes').map(([id]) => TC.user(id));
      return `<a class="up-row reveal" href="schedule.html?club=${g.clubId}&game=${g.id}">
        <span class="dd">${dday(g.date)}</span>
        <div><h4>${esc(g.title)}</h4><p class="meta">${esc(g.club.name)} · ${dateLabel(g.date)} ${g.start} · ${esc(g.court)}</p></div>
        <div class="avatar-stack">${attendees.slice(0, 4).map((u) => avatar(u)).join('')}</div>
        <span class="badge badge-ball">${esc(g.type)}</span>
      </a>`;
    }).join('')
    : `<p class="lead">${me ? '예정된 경기가 없어요.' : '로그인하면 내 클럽의 경기 일정이 보여요.'}</p>`;

  /* 마켓 미리보기 */
  const items = TC.items().filter((i) => i.status === 'selling').slice(0, 4);
  $('#market-preview').innerHTML = items.length
    ? items.map(itemCard).join('')
    : emptyState('아직 올라온 상품이 없어요', '첫 번째 판매자가 되어 보세요.');
  $('#market-preview').addEventListener('click', (e) => {
    const card = e.target.closest('[data-item]');
    if (card) location.href = `market.html?item=${card.dataset.item}`;
  });

  UI.reveal();
})();
