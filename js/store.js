/*
 * 랠리클럽 — 퍼블리싱용 목업 데이터 저장소
 * 서버 없이 화면을 확인할 수 있도록 localStorage에 데이터를 저장해요.
 * 실제 서비스에서는 이 파일의 함수들을 API 호출로 바꾸면 돼요.
 */
(function (global) {
  'use strict';

  const DB_KEY = 'rallyclub_db_v1';
  const SESSION_KEY = 'rallyclub_session_v1';
  const CLUB_KEY = 'rallyclub_club_v1';

  // 사파리 사생활 보호 모드 등 저장소를 못 쓰는 환경에서도 화면은 돌아가게 해요.
  const storage = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* 저장 불가 */ } },
    remove(k) { try { localStorage.removeItem(k); } catch (e) { /* 저장 불가 */ } },
  };
  let memSession = null;
  let memClub = null;

  /* ---------- 유틸 ---------- */
  const pad = (n) => String(n).padStart(2, '0');
  const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const dayOffset = (n) => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() + n);
    return ymd(d);
  };
  const periodOf = (offset = 0) => {
    const d = new Date();
    d.setDate(1);
    d.setMonth(d.getMonth() + offset);
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
  };
  const uid = (p) => `${p}_${Math.random().toString(36).slice(2, 9)}${Date.now().toString(36).slice(-4)}`;
  // 토스페이먼츠 customerKey: 유추할 수 없는 무작위 값이어야 해요.
  const newCustomerKey = () =>
    (global.crypto && typeof crypto.randomUUID === 'function') ? crypto.randomUUID() : `ck_${uid('a')}_${uid('b')}`;
  // 토스페이먼츠 orderId: 6~64자, 영문·숫자·-·_ 만 허용
  const newOrderId = () => `RC-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

  /* ---------- 시드 데이터 ---------- */
  function seed() {
    const users = [
      ['u1', '김테니스', 'demo@example.com', '010-1234-5678', '3.5'],
      ['u2', '이서브', 'serve@example.com', '010-2222-1111', '4.0'],
      ['u3', '박발리', 'volley@example.com', '010-3333-2222', '3.0'],
      ['u4', '최스매시', 'smash@example.com', '010-4444-3333', '4.5'],
      ['u5', '정로브', 'lob@example.com', '010-5555-4444', '2.5'],
      ['u6', '한드롭', 'drop@example.com', '010-6666-5555', '3.0'],
      ['u7', '윤에이스', 'ace@example.com', '010-7777-6666', '3.5'],
      ['u8', '강듀스', 'deuce@example.com', '010-8888-7777', '2.0'],
    ].map(([id, name, email, phone, ntrp]) => ({
      id, name, email, phone, ntrp, customerKey: newCustomerKey(), createdAt: dayOffset(-300),
    }));

    const clubs = [
      {
        id: 'c1', name: '그린코트 테니스클럽', region: '서울 송파', court: '올림픽공원 테니스장',
        desc: '매주 토요일 오전, 하드코트에서 즐기는 복식 중심 클럽이에요. NTRP 2.5 이상이면 누구나 환영해요.',
        monthlyFee: 30000, approval: 'manual', ownerId: 'u1', tone: 'court', createdAt: dayOffset(-400),
      },
      {
        id: 'c2', name: '새벽발리 TC', region: '경기 성남', court: '분당 탄천 테니스장',
        desc: '출근 전 6시, 새벽 공기 마시며 랠리하는 직장인 클럽. 한 시간 빡세게 치고 출근해요.',
        monthlyFee: 20000, approval: 'auto', ownerId: 'u2', tone: 'ball', createdAt: dayOffset(-300),
      },
      {
        id: 'c3', name: '클레이 크루', region: '서울 마포', court: '망원한강공원 테니스장',
        desc: '클레이코트를 사랑하는 사람들. 매달 첫째 주는 초보자 레슨 데이로 운영해요.',
        monthlyFee: 25000, approval: 'manual', ownerId: 'u3', tone: 'clay', createdAt: dayOffset(-150),
      },
    ];

    const m = (clubId, userId, role, status = 'active', joined = -120) =>
      ({ clubId, userId, role, status, joinedAt: dayOffset(joined) });
    const memberships = [
      m('c1', 'u1', 'owner', 'active', -400), m('c1', 'u4', 'admin', 'active', -380), m('c1', 'u2', 'member'),
      m('c1', 'u5', 'member'), m('c1', 'u6', 'member', 'active', -60), m('c1', 'u7', 'member', 'active', -30),
      m('c1', 'u8', 'member', 'pending', -2),
      m('c2', 'u2', 'owner', 'active', -300), m('c2', 'u3', 'admin', 'active', -280), m('c2', 'u1', 'member', 'active', -200),
      m('c2', 'u7', 'member', 'active', -90),
      m('c3', 'u3', 'owner', 'active', -150), m('c3', 'u4', 'member'), m('c3', 'u6', 'member'),
      m('c3', 'u5', 'member', 'pending', -1),
    ];

    const g = (id, clubId, title, type, offset, start, end, court, capacity, rsvps, memo = '') =>
      ({ id, clubId, title, type, date: dayOffset(offset), start, end, court, capacity, rsvps, memo });
    const games = [
      g('g1', 'c1', '토요 정기 복식', '정기전', 3, '07:00', '10:00', '올림픽공원 3·4번 코트', 12,
        { u1: 'yes', u4: 'yes', u2: 'yes', u5: 'maybe', u6: 'yes', u7: 'no' }, '공은 클럽에서 준비해요. 늦으면 첫 게임 대기!'),
      g('g2', 'c1', '화요 야간 랠리', '연습', 7, '19:30', '21:30', '올림픽공원 7번 코트 (조명)', 8,
        { u4: 'yes', u6: 'yes' }, '포핸드 크로스 랠리 위주 연습'),
      g('g3', 'c1', '월례 클럽 대회', '대회', 10, '08:00', '13:00', '올림픽공원 1~4번 코트', 16,
        { u1: 'yes', u2: 'yes', u4: 'yes', u5: 'yes', u7: 'maybe' }, '복식 리그전 후 시상식이 있어요. 참가비는 회비에 포함!'),
      g('g4', 'c1', '클레이 크루 교류전', '교류전', 17, '09:00', '12:00', '망원한강공원 테니스장', 12,
        { u1: 'maybe', u4: 'yes' }),
      g('g5', 'c1', '토요 정기 복식', '정기전', -4, '07:00', '10:00', '올림픽공원 3·4번 코트', 12,
        { u1: 'yes', u4: 'yes', u2: 'yes', u5: 'yes', u6: 'yes', u7: 'yes' }),
      g('g6', 'c2', '새벽 랠리', '정기전', 1, '06:00', '07:30', '탄천 2번 코트', 8,
        { u2: 'yes', u3: 'yes', u7: 'maybe' }),
      g('g7', 'c2', '새벽 랠리 + 서브 클리닉', '레슨', 8, '06:00', '07:30', '탄천 2번 코트', 8, { u2: 'yes' }),
      g('g8', 'c3', '초보자 레슨 데이', '레슨', 4, '10:00', '12:00', '망원 클레이 A코트', 10, { u3: 'yes', u6: 'yes' }),
    ];

    const it = (id, sellerId, title, category, price, condition, status, offset, tone, desc) =>
      ({ id, sellerId, title, category, price, condition, status, createdAt: dayOffset(offset), tone, desc,
        region: clubs.find((c) => c.ownerId === sellerId)?.region || '서울 송파' });
    const items = [
      it('i1', 'u4', '윌슨 블레이드 98 v8 (16x19, G2)', '라켓', 180000, '사용감 적음', 'selling', -1, 'court',
        '3개월 사용했어요. 스트링은 RPM 블라스트 48파운드로 새로 맸어요. 오버그립 새 걸로 감아서 드려요.'),
      it('i2', 'u2', '바볼랏 퓨어드라이브 2021', '라켓', 150000, '사용감 있음', 'selling', -2, 'ball',
        '프레임 상단에 생활 기스 조금 있어요. 성능에는 문제없어요. 직거래는 분당 탄천에서 가능해요.'),
      it('i3', 'u6', '아식스 젤 레졸루션 9 (270mm)', '신발', 85000, '거의 새것', 'selling', -3, 'clay',
        '사이즈 미스로 두 번 신었어요. 올코트용이에요. 박스 있어요.'),
      it('i4', 'u3', '헤드 투어 팀 6R 라켓백', '가방', 60000, '사용감 적음', 'selling', -4, 'paper',
        '라켓 6자루 수납되고 신발 칸 따로 있어요. 내부 깨끗해요.'),
      it('i5', 'u1', '던롭 포트 투어 볼 4캔 (미개봉)', '공·소모품', 24000, '새상품', 'selling', -5, 'ball',
        '대회 기념품으로 받은 미개봉 공이에요. 4캔 일괄 판매해요.'),
      it('i6', 'u7', '나이키 코트 드라이핏 폴로 (L)', '의류', 25000, '거의 새것', 'selling', -6, 'court',
        '한 번 입고 세탁했어요. 정사이즈 L이에요.'),
      it('i7', 'u5', '요넥스 이존 100 2022', '라켓', 140000, '사용감 적음', 'reserved', -7, 'clay',
        '예약 중이에요. 거래가 취소되면 다시 올릴게요.'),
      it('i8', 'u4', '테크니파이버 블랙코드 4S 릴 (200m)', '공·소모품', 45000, '새상품', 'sold', -9, 'paper',
        '판매 완료된 상품이에요.'),
    ];

    const db = { version: 1, users, clubs, memberships, games, items, dues: [], orders: [] };

    // 지난 두 달 + 이번 달 회비 기록
    const unpaid = new Set(['c1:u1:-1', 'c1:u1:0', 'c1:u5:-1', 'c1:u5:0', 'c1:u2:0', 'c1:u7:0',
      'c2:u1:0', 'c2:u7:0', 'c3:u6:0']);
    memberships.filter((x) => x.status === 'active').forEach((x) => {
      const club = clubs.find((c) => c.id === x.clubId);
      [-2, -1, 0].forEach((o) => {
        const paid = !unpaid.has(`${x.clubId}:${x.userId}:${o}`);
        db.dues.push({
          id: uid('d'), clubId: x.clubId, userId: x.userId, period: periodOf(o), amount: club.monthlyFee,
          status: paid ? 'paid' : 'unpaid', paidAt: paid ? dayOffset(o * 30 - 2) : null, method: paid ? '토스페이먼츠' : null,
        });
      });
    });
    return db;
  }

  /* ---------- 로드·저장 ---------- */
  let db = load();

  function load() {
    const raw = storage.get(DB_KEY);
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        if (parsed && parsed.version === 1) return parsed;
      } catch (e) { /* 깨진 데이터는 새로 만들어요 */ }
    }
    const fresh = seed();
    storage.set(DB_KEY, JSON.stringify(fresh));
    // 데모: 처음 방문하면 데모 계정으로 로그인한 상태로 보여줘요.
    storage.set(SESSION_KEY, 'u1');
    memSession = 'u1';
    return fresh;
  }
  const save = () => storage.set(DB_KEY, JSON.stringify(db));

  /* ---------- 내부 헬퍼 ---------- */
  const meId = () => storage.get(SESSION_KEY) || memSession;
  const requireMe = () => {
    const me = api.me();
    if (!me) throw new Error('로그인이 필요해요.');
    return me;
  };
  const ROLE_ORDER = { owner: 0, admin: 1, member: 2 };

  function ensureDues(clubId) {
    const club = api.club(clubId);
    if (!club) return;
    const period = periodOf(0);
    db.memberships
      .filter((x) => x.clubId === clubId && x.status === 'active')
      .forEach((x) => {
        const exists = db.dues.some((d) => d.clubId === clubId && d.userId === x.userId && d.period === period);
        if (!exists) {
          db.dues.push({
            id: uid('d'), clubId, userId: x.userId, period, amount: club.monthlyFee,
            status: 'unpaid', paidAt: null, method: null,
          });
        }
      });
  }

  /* ---------- 공개 API ---------- */
  const api = {
    today: () => dayOffset(0),
    periodOf,

    /* 세션 */
    me() {
      const id = meId();
      return db.users.find((u) => u.id === id) || null;
    },
    login(email) {
      const u = db.users.find((x) => x.email.toLowerCase() === String(email).trim().toLowerCase());
      if (!u) return null;
      storage.set(SESSION_KEY, u.id);
      memSession = u.id;
      return u;
    },
    loginDemo() { return api.login('demo@example.com'); },
    logout() {
      storage.remove(SESSION_KEY);
      memSession = null;
    },
    signup({ name, email, phone, ntrp }) {
      if (db.users.some((u) => u.email.toLowerCase() === email.trim().toLowerCase())) {
        throw new Error('이미 가입된 이메일이에요.');
      }
      const u = {
        id: uid('u'), name: name.trim(), email: email.trim(), phone: phone.trim(), ntrp,
        customerKey: newCustomerKey(), createdAt: dayOffset(0),
      };
      db.users.push(u);
      save();
      storage.set(SESSION_KEY, u.id);
      memSession = u.id;
      return u;
    },
    user: (id) => db.users.find((u) => u.id === id) || null,

    /* 클럽 */
    clubs: () => db.clubs.slice(),
    club: (id) => db.clubs.find((c) => c.id === id) || null,
    createClub(data) {
      const me = requireMe();
      const c = { id: uid('c'), ...data, ownerId: me.id, createdAt: dayOffset(0) };
      db.clubs.push(c);
      db.memberships.push({ clubId: c.id, userId: me.id, role: 'owner', status: 'active', joinedAt: dayOffset(0) });
      ensureDues(c.id);
      save();
      return c;
    },
    updateClub(id, patch) {
      const c = api.club(id);
      Object.assign(c, patch);
      save();
      return c;
    },
    membership(clubId, userId = meId()) {
      return db.memberships.find((x) => x.clubId === clubId && x.userId === userId) || null;
    },
    myClubs() {
      const id = meId();
      return db.memberships
        .filter((x) => x.userId === id && x.status === 'active')
        .map((x) => ({ ...api.club(x.clubId), role: x.role }))
        .filter((c) => c.id);
    },
    members(clubId, status = 'active') {
      return db.memberships
        .filter((x) => x.clubId === clubId && x.status === status)
        .map((x) => ({ ...api.user(x.userId), role: x.role, status: x.status, joinedAt: x.joinedAt }))
        .sort((a, b) => ROLE_ORDER[a.role] - ROLE_ORDER[b.role] || a.joinedAt.localeCompare(b.joinedAt));
    },
    memberCount: (clubId) => db.memberships.filter((x) => x.clubId === clubId && x.status === 'active').length,
    isAdmin(clubId) {
      const ms = api.membership(clubId);
      return !!ms && ms.status === 'active' && (ms.role === 'owner' || ms.role === 'admin');
    },
    isOwner(clubId) {
      const ms = api.membership(clubId);
      return !!ms && ms.status === 'active' && ms.role === 'owner';
    },
    joinClub(clubId) {
      const me = requireMe();
      if (api.membership(clubId, me.id)) return api.membership(clubId, me.id).status;
      const club = api.club(clubId);
      const status = club.approval === 'auto' ? 'active' : 'pending';
      db.memberships.push({ clubId, userId: me.id, role: 'member', status, joinedAt: dayOffset(0) });
      if (status === 'active') ensureDues(clubId);
      save();
      return status;
    },
    leaveClub(clubId, userId = meId()) {
      db.memberships = db.memberships.filter((x) => !(x.clubId === clubId && x.userId === userId));
      db.dues = db.dues.filter((d) => !(d.clubId === clubId && d.userId === userId && d.status === 'unpaid'));
      if (storage.get(CLUB_KEY) === clubId && userId === meId()) storage.remove(CLUB_KEY);
      save();
    },
    approve(clubId, userId) {
      const ms = api.membership(clubId, userId);
      ms.status = 'active';
      ms.joinedAt = dayOffset(0);
      ensureDues(clubId);
      save();
    },
    reject(clubId, userId) { api.leaveClub(clubId, userId); },
    setRole(clubId, userId, role) {
      api.membership(clubId, userId).role = role;
      save();
    },
    currentClubId() {
      const mine = api.myClubs();
      const saved = storage.get(CLUB_KEY) || memClub;
      if (saved && mine.some((c) => c.id === saved)) return saved;
      return mine[0] ? mine[0].id : null;
    },
    setCurrentClub(id) {
      storage.set(CLUB_KEY, id);
      memClub = id;
    },

    /* 일정 */
    games(clubId) {
      return db.games
        .filter((x) => x.clubId === clubId)
        .sort((a, b) => a.date.localeCompare(b.date) || a.start.localeCompare(b.start));
    },
    game: (id) => db.games.find((x) => x.id === id) || null,
    createGame(data) {
      const gm = { id: uid('g'), ...data, rsvps: {} };
      db.games.push(gm);
      save();
      return gm;
    },
    deleteGame(id) {
      db.games = db.games.filter((x) => x.id !== id);
      save();
    },
    rsvp(gameId, status) {
      const me = requireMe();
      const gm = api.game(gameId);
      if (gm.rsvps[me.id] === status) delete gm.rsvps[me.id];
      else gm.rsvps[me.id] = status;
      save();
      return gm.rsvps[me.id] || null;
    },
    upcomingGames(limit = 5) {
      const today = dayOffset(0);
      const clubIds = api.myClubs().map((c) => c.id);
      return db.games
        .filter((x) => clubIds.includes(x.clubId) && x.date >= today)
        .sort((a, b) => a.date.localeCompare(b.date) || a.start.localeCompare(b.start))
        .slice(0, limit)
        .map((x) => ({ ...x, club: api.club(x.clubId) }));
    },

    /* 중고거래 */
    items: () => db.items.slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    item: (id) => db.items.find((x) => x.id === id) || null,
    createItem(data) {
      const me = requireMe();
      const tones = ['court', 'ball', 'clay', 'paper'];
      const item = {
        id: uid('i'), sellerId: me.id, status: 'selling', createdAt: dayOffset(0),
        tone: tones[db.items.length % tones.length], ...data,
      };
      db.items.push(item);
      save();
      return item;
    },
    updateItem(id, patch) {
      Object.assign(api.item(id), patch);
      save();
    },
    deleteItem(id) {
      db.items = db.items.filter((x) => x.id !== id);
      save();
    },

    /* 회비 */
    dues(clubId, userId = meId()) {
      ensureDues(clubId);
      save();
      return db.dues
        .filter((d) => d.clubId === clubId && d.userId === userId)
        .sort((a, b) => b.period.localeCompare(a.period));
    },
    clubDues(clubId, period) {
      ensureDues(clubId);
      save();
      return api.members(clubId).map((u) => ({
        user: u,
        due: db.dues.find((d) => d.clubId === clubId && d.userId === u.id && d.period === period) || null,
      }));
    },
    duePeriods(clubId) {
      ensureDues(clubId);
      return [...new Set(db.dues.filter((d) => d.clubId === clubId).map((d) => d.period))].sort().reverse();
    },
    markDuesPaid(ids, method = '현금(수기)') {
      db.dues.filter((d) => ids.includes(d.id)).forEach((d) => {
        d.status = 'paid';
        d.paidAt = dayOffset(0);
        d.method = method;
      });
      save();
    },
    unpaidSummary() {
      const id = meId();
      api.myClubs().forEach((c) => ensureDues(c.id));
      const clubIds = api.myClubs().map((c) => c.id);
      const list = db.dues.filter((d) => d.userId === id && d.status === 'unpaid' && clubIds.includes(d.clubId));
      return { total: list.reduce((s, d) => s + d.amount, 0), count: list.length };
    },

    /* 주문 (토스페이먼츠 결제 요청 전에 만들어 두는 주문서) */
    createOrder({ type, refs, amount, orderName }) {
      const me = requireMe();
      const order = {
        orderId: newOrderId(), type, refs, amount, orderName, userId: me.id,
        status: 'ready', createdAt: new Date().toISOString(), paymentKey: null,
      };
      db.orders.push(order);
      save();
      return order;
    },
    order: (orderId) => db.orders.find((o) => o.orderId === orderId) || null,
    completeOrder(orderId, paymentKey, paymentType) {
      const order = api.order(orderId);
      if (!order || order.status === 'done') return order;
      order.status = 'done';
      order.paymentKey = paymentKey;
      order.paymentType = paymentType;
      order.paidAt = new Date().toISOString();
      if (order.type === 'dues') {
        db.dues.filter((d) => order.refs.includes(d.id)).forEach((d) => {
          d.status = 'paid';
          d.paidAt = dayOffset(0);
          d.method = '토스페이먼츠';
          d.orderId = orderId;
        });
      }
      if (order.type === 'market') {
        db.items.filter((x) => order.refs.includes(x.id)).forEach((x) => {
          x.status = 'sold';
          x.buyerId = order.userId;
        });
      }
      save();
      return order;
    },

    reset() {
      storage.remove(DB_KEY);
      storage.remove(SESSION_KEY);
      storage.remove(CLUB_KEY);
      db = load();
    },
  };

  global.TC = api;
})(window);
