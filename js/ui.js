/*
 * 랠리클럽 — 공통 UI (헤더·푸터·모달·토스트·포맷터·일러스트)
 */
(function (global) {
  'use strict';

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

  /* ---------- 포맷터 ---------- */
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const won = (n) => `${Number(n || 0).toLocaleString('ko-KR')}원`;
  const DOW = ['일', '월', '화', '수', '목', '금', '토'];
  const parseYmd = (s) => {
    const [y, m, d] = s.split('-').map(Number);
    return new Date(y, m - 1, d);
  };
  const dateLabel = (s) => {
    const d = parseYmd(s);
    return `${d.getMonth() + 1}월 ${d.getDate()}일 (${DOW[d.getDay()]})`;
  };
  const periodLabel = (p) => {
    const [y, m] = p.split('-');
    return `${y}년 ${Number(m)}월`;
  };
  const dday = (s) => {
    const t = new Date();
    t.setHours(0, 0, 0, 0);
    const diff = Math.round((parseYmd(s) - t) / 86400000);
    if (diff === 0) return 'D-DAY';
    return diff > 0 ? `D-${diff}` : `D+${-diff}`;
  };
  const param = (k) => new URLSearchParams(location.search).get(k);

  /* ---------- 아바타·배지 ---------- */
  const AVATAR_COLORS = ['#D9F84A', '#F3C9A8', '#BFE3D0', '#F6E27A', '#C9D7F5', '#F2B5A0', '#D8C8F0', '#A8D8C2'];
  function avatar(user, cls = '') {
    if (!user) return '';
    const i = [...user.id].reduce((a, c) => a + c.charCodeAt(0), 0) % AVATAR_COLORS.length;
    const label = user.name.length >= 3 ? user.name.slice(1, 3) : user.name;
    return `<span class="avatar ${cls}" style="background:${AVATAR_COLORS[i]}" title="${esc(user.name)}">${esc(label)}</span>`;
  }
  const ROLE = { owner: ['클럽장', 'badge-ball'], admin: ['운영진', 'badge-dark'], member: ['회원', 'badge-line'] };
  const roleBadge = (r) => `<span class="badge ${ROLE[r][1]}">${ROLE[r][0]}</span>`;

  /* ---------- 일러스트 (SVG) ---------- */
  function ballSVG(cls = '') {
    return `<svg class="${cls}" viewBox="0 0 100 100" aria-hidden="true">
      <circle cx="50" cy="50" r="48" fill="#D9F84A"/>
      <circle cx="50" cy="50" r="48" fill="url(#ballShade)" opacity=".35"/>
      <path d="M18 14C38 32 38 68 18 86M82 14C62 32 62 68 82 86" fill="none" stroke="#fff" stroke-width="4" stroke-linecap="round"/>
      <defs><radialGradient id="ballShade" cx=".35" cy=".3" r=".8"><stop offset=".55" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#0F3D2E"/></radialGradient></defs>
    </svg>`;
  }

  // 실제 테니스 코트 비율(23.77m × 10.97m)로 그린 라인
  function courtSVG(cls = '', vertical = false) {
    const lines = `
      <rect x="0" y="0" width="2377" height="1097"/>
      <line x1="0" y1="137" x2="2377" y2="137"/><line x1="0" y1="960" x2="2377" y2="960"/>
      <line x1="548" y1="137" x2="548" y2="960"/><line x1="1829" y1="137" x2="1829" y2="960"/>
      <line x1="548" y1="548.5" x2="1829" y2="548.5"/>
      <line x1="0" y1="548.5" x2="30" y2="548.5"/><line x1="2347" y1="548.5" x2="2377" y2="548.5"/>
      <line class="net" x1="1188.5" y1="-40" x2="1188.5" y2="1137"/>`;
    const vb = vertical ? '-40 -40 1177 2457' : '-40 -40 2457 1177';
    const body = vertical ? `<g transform="matrix(0 1 1 0 0 0)">${lines}</g>` : lines;
    return `<svg class="${cls}" viewBox="${vb}" fill="none" stroke="currentColor" aria-hidden="true">
      <g stroke-width="2" vector-effect="non-scaling-stroke" style="vector-effect:non-scaling-stroke">${body}</g></svg>`;
  }

  let artSeq = 0;
  const TONES = {
    court: ['#0F3D2E', '#D9F84A'],
    ball: ['#D9F84A', '#0F3D2E'],
    clay: ['#D2643F', '#F3F0E4'],
    paper: ['#E9E4D2', '#0F3D2E'],
  };
  function itemArt(category, tone = 'court') {
    const [bg, fg] = TONES[tone] || TONES.court;
    const id = `art${++artSeq}`;
    const shapes = {
      '라켓': `<g transform="rotate(-32 100 100)">
          <defs><clipPath id="${id}"><ellipse cx="100" cy="72" rx="38" ry="50"/></clipPath></defs>
          <g clip-path="url(#${id})" stroke="${fg}" stroke-width="1.6" opacity=".55">
            ${Array.from({ length: 9 }, (_, i) => `<line x1="${68 + i * 8}" y1="15" x2="${68 + i * 8}" y2="130"/>`).join('')}
            ${Array.from({ length: 12 }, (_, i) => `<line x1="55" y1="${26 + i * 8.5}" x2="145" y2="${26 + i * 8.5}"/>`).join('')}
          </g>
          <ellipse cx="100" cy="72" rx="42" ry="54" fill="none" stroke="${fg}" stroke-width="8"/>
          <path d="M80 120L95 140M120 120L105 140" stroke="${fg}" stroke-width="7" stroke-linecap="round"/>
          <rect x="93" y="138" width="14" height="52" rx="6" fill="${fg}"/>
        </g>`,
      '신발': `<path d="M26 128c0-22 10-34 34-37l30-5c10-16 26-22 40-12l18 26c22 4 30 14 30 30v8H26z" fill="${fg}"/>
          <rect x="22" y="134" width="160" height="14" rx="7" fill="${bg === '#D9F84A' ? '#fff' : '#F3F0E4'}" opacity=".9"/>
          <path d="M96 92l10 14M108 86l10 14M120 82l10 14" stroke="${bg}" stroke-width="4" stroke-linecap="round"/>`,
      '가방': `<path d="M55 86c0-26 90-26 90 0" fill="none" stroke="${fg}" stroke-width="7"/>
          <rect x="22" y="80" width="156" height="66" rx="33" fill="${fg}"/>
          <path d="M42 102h116" stroke="${bg}" stroke-width="3" stroke-dasharray="6 6"/>
          <circle cx="150" cy="122" r="9" fill="${bg}"/>`,
      '의류': `<path d="M70 46l20-8c4 12 16 12 20 0l20 8 32 26-16 18-14-10v82H68V80L54 90 38 72z" fill="${fg}"/>
          <path d="M90 38c4 14 16 14 20 0" fill="none" stroke="${bg}" stroke-width="4"/>
          <circle cx="118" cy="78" r="6" fill="${bg}"/>`,
      '공·소모품': `<g transform="translate(18 62) scale(.62)">${ballInner(fg, bg)}</g>
          <g transform="translate(92 50) scale(.62)">${ballInner(fg, bg)}</g>
          <g transform="translate(56 104) scale(.62)">${ballInner(fg, bg)}</g>`,
      '기타': `<g transform="translate(50 50)">${ballInner(fg, bg)}</g>`,
    };
    return `<svg viewBox="0 0 200 200" aria-hidden="true">${shapes[category] || shapes['기타']}</svg>`;
  }
  function ballInner(fill, seam) {
    return `<circle cx="50" cy="50" r="48" fill="${fill}"/>
      <path d="M18 14C38 32 38 68 18 86M82 14C62 32 62 68 82 86" fill="none" stroke="${seam}" stroke-width="5" stroke-linecap="round"/>`;
  }
  const toneBg = (tone) => (TONES[tone] || TONES.court)[0];

  const STATUS = {
    selling: ['판매중', 'badge-ball'],
    reserved: ['예약중', 'badge-clay'],
    sold: ['판매완료', 'badge-dark'],
  };
  function itemCard(item) {
    const [label, cls] = STATUS[item.status];
    return `<article class="item-card ${item.status === 'sold' ? 'is-sold' : ''} reveal" data-item="${item.id}" tabindex="0" role="button" aria-label="${esc(item.title)} 상세 보기">
      <div class="item-art" style="background:${toneBg(item.tone)}">
        <span class="badge ${cls}">${label}</span>
        ${itemArt(item.category, item.tone)}
      </div>
      <div class="item-body">
        <p class="item-cat">${esc(item.category)} · ${esc(item.condition)}</p>
        <h3 class="item-title">${esc(item.title)}</h3>
        <p class="item-price">${won(item.price)}</p>
        <p class="item-meta">${esc(item.region)} · ${dateLabel(item.createdAt)}</p>
      </div>
    </article>`;
  }

  /* ---------- 헤더·푸터 ---------- */
  const NAV = [
    { key: 'home', href: 'index.html', label: '홈' },
    { key: 'clubs', href: 'clubs.html', label: '클럽' },
    { key: 'schedule', href: 'schedule.html', label: '일정' },
    { key: 'market', href: 'market.html', label: '중고거래' },
    { key: 'dues', href: 'dues.html', label: '회비' },
  ];

  function headerHTML(active) {
    const me = TC.me();
    const nav = NAV.map((n) =>
      `<a href="${n.href}" class="${n.key === active ? 'is-active' : ''}" ${n.key === active ? 'aria-current="page"' : ''}>${n.label}</a>`).join('');
    const right = me
      ? `<div class="user-menu">
          <button class="user-chip" type="button" aria-haspopup="true" aria-expanded="false">${avatar(me, 'avatar-sm')}<span>${esc(me.name)}</span></button>
          <div class="user-pop" hidden>
            <div class="user-pop-head"><b>${esc(me.name)}</b><small>${esc(me.email)} · NTRP ${esc(me.ntrp)}</small></div>
            <a href="clubs.html?filter=mine">내 클럽</a>
            <a href="schedule.html">내 일정</a>
            <a href="dues.html">내 회비</a>
            <button type="button" data-logout>로그아웃</button>
          </div>
        </div>`
      : `<a class="btn btn-ball btn-sm" href="auth.html">로그인</a>`;
    return `<header class="site-header">
      <div class="container header-inner">
        <a class="logo" href="index.html" aria-label="랠리클럽 홈">${ballSVG('logo-ball')}<span>RALLY<i>CLUB</i></span></a>
        <nav class="gnb" aria-label="주요 메뉴">${nav}</nav>
        <div class="header-actions">
          ${right}
          <button class="menu-toggle" type="button" aria-label="메뉴 열기" aria-expanded="false"><span></span><span></span></button>
        </div>
      </div>
    </header>`;
  }

  function footerHTML() {
    return `<footer class="site-footer">
      <div class="container">
        <div class="footer-top">
          <p class="eyebrow">Rally Club — Tennis Community</p>
          <nav class="footer-links" aria-label="푸터 메뉴">${NAV.map((n) => `<a href="${n.href}">${n.label}</a>`).join('')}</nav>
        </div>
        <p class="footer-big" aria-hidden="true">GAME.<br>SET. <span class="hl">CLUB.</span></p>
        <div class="footer-bottom">
          <span>© 2026 RALLY CLUB · 테니스 동호회 플랫폼 퍼블리싱 시안</span>
          <button type="button" class="link-btn" data-reset>데모 데이터 초기화</button>
        </div>
      </div>
    </footer>`;
  }

  function mountChrome() {
    const page = document.body.dataset.page;
    const h = $('#header');
    const f = $('#footer');
    if (h) h.outerHTML = headerHTML(page);
    if (f) f.outerHTML = footerHTML();

    const header = $('.site-header');
    if (header) {
      const toggle = $('.menu-toggle', header);
      toggle.addEventListener('click', () => {
        const open = header.classList.toggle('is-open');
        toggle.setAttribute('aria-expanded', String(open));
        toggle.setAttribute('aria-label', open ? '메뉴 닫기' : '메뉴 열기');
      });
      const chip = $('.user-chip', header);
      const pop = $('.user-pop', header);
      if (chip) {
        chip.addEventListener('click', (e) => {
          e.stopPropagation();
          pop.hidden = !pop.hidden;
          chip.setAttribute('aria-expanded', String(!pop.hidden));
        });
        document.addEventListener('click', (e) => {
          if (!pop.hidden && !pop.contains(e.target)) {
            pop.hidden = true;
            chip.setAttribute('aria-expanded', 'false');
          }
        });
      }
    }

    document.addEventListener('click', (e) => {
      if (e.target.closest('[data-logout]')) {
        TC.logout();
        location.href = 'index.html';
      }
      if (e.target.closest('[data-reset]')) {
        if (confirm('데모 데이터를 처음 상태로 되돌릴까요?')) {
          TC.reset();
          location.reload();
        }
      }
      const closer = e.target.closest('[data-close]');
      if (closer) closer.closest('dialog')?.close();
    });
  }

  /* ---------- 모달 (native dialog) ---------- */
  function openModal(id) {
    const d = document.getElementById(id);
    if (!d) return;
    if (!d.dataset.bound) {
      d.dataset.bound = '1';
      // 바깥(backdrop)을 누르면 닫혀요.
      d.addEventListener('click', (e) => { if (e.target === d) d.close(); });
    }
    d.showModal();
  }
  const closeModal = (id) => document.getElementById(id)?.close();

  /* ---------- 토스트 ---------- */
  function toast(msg, type = '') {
    let wrap = $('.toast-wrap');
    if (!wrap) {
      wrap = document.createElement('div');
      wrap.className = 'toast-wrap';
      wrap.setAttribute('role', 'status');
      wrap.setAttribute('aria-live', 'polite');
      document.body.appendChild(wrap);
    }
    const t = document.createElement('div');
    t.className = `toast ${type}`;
    t.textContent = msg;
    wrap.appendChild(t);
    setTimeout(() => {
      t.classList.add('out');
      setTimeout(() => t.remove(), 400);
    }, 2600);
  }

  /* ---------- 공통 블록 ---------- */
  function requireLogin() {
    const me = TC.me();
    if (!me) {
      const next = location.pathname.split('/').pop() + location.search;
      location.replace(`auth.html?next=${encodeURIComponent(next)}`);
      return null;
    }
    return me;
  }

  // 내 클럽 선택 pill. 클럽이 없으면 false를 돌려줘요.
  function clubPills(el, currentId, onChange) {
    const clubs = TC.myClubs();
    if (!clubs.length) {
      el.innerHTML = '';
      return false;
    }
    el.innerHTML = clubs.map((c) =>
      `<button type="button" class="pill ${c.id === currentId ? 'is-active' : ''}" data-club="${c.id}" aria-pressed="${c.id === currentId}">${esc(c.name)}</button>`).join('');
    el.onclick = (e) => {
      const b = e.target.closest('[data-club]');
      if (b && b.dataset.club !== currentId) onChange(b.dataset.club);
    };
    return true;
  }

  const emptyState = (title, desc, action = '') =>
    `<div class="empty">${ballSVG('empty-ball')}<h3>${title}</h3><p>${desc}</p>${action}</div>`;

  /* ---------- 스크롤 등장 애니메이션 ---------- */
  let io = null;
  function reveal() {
    const els = $$('.reveal:not(.in)');
    if (!('IntersectionObserver' in global)) {
      els.forEach((el) => el.classList.add('in'));
      return;
    }
    io = io || new IntersectionObserver((entries) => {
      entries.forEach((en) => {
        if (en.isIntersecting) {
          en.target.classList.add('in');
          io.unobserve(en.target);
        }
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });
    els.forEach((el) => io.observe(el));
  }

  /* ---------- 테니스공 커서 (마우스 환경만) ---------- */
  function cursor() {
    if (!matchMedia('(pointer: fine)').matches || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const c = document.createElement('div');
    c.className = 'cursor';
    document.body.appendChild(c);
    let x = -100, y = -100, cx = -100, cy = -100;
    addEventListener('mousemove', (e) => { x = e.clientX; y = e.clientY; }, { passive: true });
    document.addEventListener('mouseover', (e) => {
      c.classList.toggle('is-hover', !!e.target.closest('a, button, [role="button"], .pill, input, select, textarea'));
    });
    document.addEventListener('mouseleave', () => { x = y = -100; });
    (function loop() {
      cx += (x - cx) * 0.22;
      cy += (y - cy) * 0.22;
      c.style.transform = `translate(${cx}px, ${cy}px) translate(-50%, -50%)`;
      requestAnimationFrame(loop);
    })();
  }

  global.UI = {
    $, $$, esc, won, dateLabel, periodLabel, dday, param, parseYmd, DOW,
    avatar, roleBadge, ballSVG, courtSVG, itemArt, itemCard, toneBg,
    openModal, closeModal, toast, requireLogin, clubPills, emptyState, reveal,
  };

  mountChrome();
  cursor();
  document.addEventListener('DOMContentLoaded', reveal);
  requestAnimationFrame(reveal);
})(window);
