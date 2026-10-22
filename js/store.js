/*
 * 랠리클럽 — 데이터 계층 (Supabase)
 *
 * 화면 코드는 전역 TC만 써요. 데이터를 가져오거나 바꾸는 함수는 모두 Promise를 돌려줘요.
 * 페이지 시작 시 `await TC.ready`를 하면 로그인 사용자·내 멤버십이 캐시에 올라와서
 * me(), user(), membership(), myClubs(), isAdmin(), isOwner(), currentClubId()는 바로(동기로) 쓸 수 있어요.
 *
 * 권한은 서버(RLS·RPC)가 강제해요. 여기 있는 확인은 화면 표시용이에요.
 */
(function (global) {
  'use strict';

  const CLUB_KEY = 'rallyclub_club_v1';
  const cfg = global.SUPABASE_CONFIG;
  const sb = global.supabase.createClient(cfg.URL, cfg.PUBLISHABLE_KEY, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
  });

  // 예전 목업(localStorage) 데이터는 더 쓰지 않아요.
  try {
    localStorage.removeItem('rallyclub_db_v1');
    localStorage.removeItem('rallyclub_session_v1');
  } catch (e) { /* 저장소를 못 쓰는 환경 */ }

  const storage = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* 저장 불가 */ } },
    remove(k) { try { localStorage.removeItem(k); } catch (e) { /* 저장 불가 */ } },
  };
  let memClub = null;

  /* ---------- 유틸 ---------- */
  const pad = (n) => String(n).padStart(2, '0');
  const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const tsToYmd = (ts) => (ts ? ymd(new Date(ts)) : null);
  const periodOf = (offset = 0) => {
    const d = new Date();
    d.setDate(1);
    d.setMonth(d.getMonth() + offset);
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
  };
  const ROLE_ORDER = { owner: 0, admin: 1, member: 2 };

  // Supabase 응답에서 에러를 꺼내 사람이 읽을 수 있는 메시지로 던져요.
  function unwrap({ data, error }) {
    if (!error) return data;
    console.error(error);
    let msg = error.message || '요청을 처리하지 못했어요.';
    if (error.code === '42501' && !/[가-힣]/.test(msg)) msg = '권한이 없어요.';
    else if (error.code === '23514') msg = '입력값을 다시 확인해 주세요.';
    else if (!/[가-힣]/.test(msg)) msg = '요청을 처리하지 못했어요. 잠시 후 다시 시도해 주세요.';
    throw new Error(msg);
  }

  /* ---------- 매퍼 (DB 컬럼 → 화면용 모양) ---------- */
  const mapClub = (r) => r && ({
    id: r.id, name: r.name, region: r.region, court: r.court, desc: r.description,
    monthlyFee: r.monthly_fee, approval: r.approval, tone: r.tone, ownerId: r.owner_id, createdAt: tsToYmd(r.created_at),
  });
  const mapProfile = (r) => r && ({
    id: r.id, name: r.name, ntrp: r.ntrp,
    ...(r.email !== undefined && { email: r.email }),
    ...(r.phone !== undefined && { phone: r.phone }),
    ...(r.customer_key !== undefined && { customerKey: r.customer_key }),
  });
  const mapGame = (r) => ({
    id: r.id, clubId: r.club_id, title: r.title, type: r.type, date: r.date,
    start: r.start_time.slice(0, 5), end: r.end_time.slice(0, 5), court: r.court,
    capacity: r.capacity, memo: r.memo,
    rsvps: Object.fromEntries((r.rsvps || []).map((x) => [x.user_id, x.status])),
  });
  const mapItem = (r) => r && ({
    id: r.id, sellerId: r.seller_id, buyerId: r.buyer_id, title: r.title, category: r.category,
    condition: r.condition, price: r.price, region: r.region, desc: r.description,
    status: r.status, tone: r.tone, createdAt: tsToYmd(r.created_at),
  });
  const mapDue = (r) => ({
    id: r.id, clubId: r.club_id, userId: r.user_id, period: r.period, amount: r.amount,
    status: r.status, paidAt: tsToYmd(r.paid_at), method: r.method, orderId: r.order_id,
  });
  const mapOrder = (r) => r && ({
    orderId: r.order_id, userId: r.user_id, type: r.type, orderName: r.order_name, amount: r.amount,
    status: r.status, paymentKey: r.payment_key, paymentType: r.payment_type,
    failCode: r.fail_code, failMessage: r.fail_message, paidAt: r.paid_at,
    refs: (r.order_refs || []).map((x) => x.due_id || x.item_id).filter(Boolean),
  });

  /* ---------- 캐시 ---------- */
  const state = { me: null, memberships: [], clubs: new Map() };
  const users = new Map();
  const remember = (p) => {
    if (!p) return p;
    users.set(p.id, { ...(users.get(p.id) || {}), ...p });
    return users.get(p.id);
  };

  async function ensureUsers(ids) {
    const missing = [...new Set(ids)].filter((id) => id && !users.has(id));
    if (!missing.length) return;
    const rows = unwrap(await sb.from('profiles').select('id, name, ntrp').in('id', missing));
    rows.forEach((r) => remember(mapProfile(r)));
  }

  async function loadMine() {
    const { data: { session } } = await sb.auth.getSession();
    if (!session) {
      state.me = null;
      state.memberships = [];
      return;
    }
    const [profileRows, msRows] = await Promise.all([
      sb.rpc('get_my_profile').then(unwrap),
      sb.from('memberships')
        .select('club_id, role, status, joined_at, clubs(*)')
        .eq('user_id', session.user.id)
        .then(unwrap),
    ]);
    state.me = profileRows[0] ? remember(mapProfile(profileRows[0])) : null;
    state.memberships = msRows.map((m) => {
      if (m.clubs) state.clubs.set(m.club_id, mapClub(m.clubs));
      return { clubId: m.club_id, role: m.role, status: m.status, joinedAt: tsToYmd(m.joined_at) };
    });
  }

  const ready = loadMine().catch((err) => {
    console.error(err);
    state.me = null;
    state.memberships = [];
  });

  /* ---------- 공개 API ---------- */
  const api = {
    client: sb,
    ready,
    today: () => ymd(new Date()),
    periodOf,

    /* 세션 */
    me: () => state.me,
    user: (id) => users.get(id) || null,
    async refresh() { await loadMine(); },
    async login(email, password) {
      const { error } = await sb.auth.signInWithPassword({ email: String(email).trim(), password });
      if (error) {
        throw new Error(/confirm/i.test(error.message)
          ? '이메일 인증이 아직 안 됐어요. 메일함의 인증 링크를 눌러 주세요.'
          : '이메일 또는 비밀번호가 맞지 않아요.');
      }
      await loadMine();
      return state.me;
    },
    hasDemo: () => !!cfg.DEMO_ACCOUNT,
    loginDemo() { return api.login(cfg.DEMO_ACCOUNT.email, cfg.DEMO_ACCOUNT.password); },
    async logout() {
      await sb.auth.signOut();
      storage.remove(CLUB_KEY);
      state.me = null;
      state.memberships = [];
    },
    // 이메일 인증을 켜 둔 프로젝트면 { needsConfirm: true }를 돌려줘요.
    async signup({ name, email, phone, ntrp, password }) {
      const base = location.href.replace(/[?#].*$/, '').replace(/[^/]*$/, '');
      const { data, error } = await sb.auth.signUp({
        email: email.trim(),
        password,
        options: {
          data: { name: name.trim(), phone: phone.trim(), ntrp },
          emailRedirectTo: `${base}auth.html`,
        },
      });
      if (error) {
        if (/registered|exists/i.test(error.message)) throw new Error('이미 가입된 이메일이에요.');
        if (/password/i.test(error.message)) throw new Error('비밀번호는 8자 이상으로 입력해 주세요.');
        if (/rate limit/i.test(error.message)) throw new Error('잠시 후 다시 시도해 주세요. (메일 발송 한도 초과)');
        throw new Error('회원가입을 하지 못했어요. 입력값을 확인해 주세요.');
      }
      // 이미 가입된 이메일이면 identities가 빈 배열로 와요.
      if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
        throw new Error('이미 가입된 이메일이에요.');
      }
      if (!data.session) return { needsConfirm: true };
      await loadMine();
      return { needsConfirm: false, user: state.me };
    },
    async updateProfile({ name, phone, ntrp }) {
      unwrap(await sb.from('profiles').update({ name: name.trim(), phone: phone.trim(), ntrp }).eq('id', state.me.id));
      await loadMine();
    },
    async resetPassword(email) {
      const base = location.href.replace(/[?#].*$/, '').replace(/[^/]*$/, '');
      const { error } = await sb.auth.resetPasswordForEmail(email.trim(), { redirectTo: `${base}auth.html?mode=reset` });
      if (error) throw new Error('메일을 보내지 못했어요. 잠시 후 다시 시도해 주세요.');
    },
    async setNewPassword(password) {
      const { error } = await sb.auth.updateUser({ password });
      if (error) throw new Error('비밀번호를 바꾸지 못했어요. 8자 이상인지 확인해 주세요.');
    },
    onAuthChange(cb) { return sb.auth.onAuthStateChange(cb); },

    /* 클럽 */
    async clubs() {
      const rows = unwrap(await sb.from('clubs').select('*').order('created_at'));
      return rows.map((r) => {
        const c = mapClub(r);
        state.clubs.set(c.id, c);
        return c;
      });
    },
    async club(id) {
      const r = unwrap(await sb.from('clubs').select('*').eq('id', id).maybeSingle());
      const c = mapClub(r);
      if (c) state.clubs.set(c.id, c);
      return c || null;
    },
    async createClub(data) {
      const r = unwrap(await sb.rpc('create_club', {
        p_name: data.name, p_region: data.region, p_court: data.court, p_description: data.desc || '',
        p_monthly_fee: data.monthlyFee, p_approval: data.approval, p_tone: data.tone,
      }));
      await loadMine();
      return mapClub(r);
    },
    async updateClub(id, patch) {
      const row = {};
      if ('name' in patch) row.name = patch.name;
      if ('region' in patch) row.region = patch.region;
      if ('court' in patch) row.court = patch.court;
      if ('desc' in patch) row.description = patch.desc;
      if ('monthlyFee' in patch) row.monthly_fee = patch.monthlyFee;
      if ('approval' in patch) row.approval = patch.approval;
      const rows = unwrap(await sb.from('clubs').update(row).eq('id', id).select());
      if (!rows.length) throw new Error('클럽을 수정할 권한이 없어요.');
      const c = mapClub(rows[0]);
      state.clubs.set(c.id, c);
      return c;
    },

    /* 멤버십 */
    membership(clubId) {
      return state.memberships.find((m) => m.clubId === clubId) || null;
    },
    myClubs() {
      return state.memberships
        .filter((m) => m.status === 'active' && state.clubs.has(m.clubId))
        .map((m) => ({ ...state.clubs.get(m.clubId), role: m.role }));
    },
    isAdmin(clubId) {
      const ms = api.membership(clubId);
      return !!ms && ms.status === 'active' && (ms.role === 'owner' || ms.role === 'admin');
    },
    isOwner(clubId) {
      const ms = api.membership(clubId);
      return !!ms && ms.status === 'active' && ms.role === 'owner';
    },
    // 클럽 회원 목록. clubIds를 배열로 주면 { clubId: [회원…] } 맵을 돌려줘요.
    async members(clubId, status = 'active') {
      const ids = Array.isArray(clubId) ? clubId : [clubId];
      let q = sb.from('memberships').select('club_id, user_id, role, status, joined_at, profiles(id, name, ntrp)').eq('status', status);
      q = ids.length === 1 ? q.eq('club_id', ids[0]) : q.in('club_id', ids);
      const rows = unwrap(await q);
      const byClub = Object.fromEntries(ids.map((id) => [id, []]));
      rows.forEach((m) => {
        const u = remember(mapProfile(m.profiles));
        byClub[m.club_id]?.push({ ...u, role: m.role, status: m.status, joinedAt: tsToYmd(m.joined_at) });
      });
      Object.values(byClub).forEach((list) =>
        list.sort((a, b) => ROLE_ORDER[a.role] - ROLE_ORDER[b.role] || a.joinedAt.localeCompare(b.joinedAt)));
      return Array.isArray(clubId) ? byClub : byClub[clubId];
    },
    // 운영진 전용: 회원 이메일·전화번호
    async memberContacts(clubId) {
      const rows = unwrap(await sb.rpc('club_member_contacts', { p_club: clubId }));
      return Object.fromEntries(rows.map((r) => [r.user_id, { email: r.email, phone: r.phone }]));
    },
    async joinClub(clubId) {
      const status = unwrap(await sb.rpc('join_club', { p_club: clubId }));
      await loadMine();
      return status;
    },
    async leaveClub(clubId) {
      unwrap(await sb.rpc('leave_club', { p_club: clubId }));
      if (storage.get(CLUB_KEY) === clubId) storage.remove(CLUB_KEY);
      await loadMine();
    },
    async approve(clubId, userId) { unwrap(await sb.rpc('approve_member', { p_club: clubId, p_user: userId })); },
    async reject(clubId, userId) { unwrap(await sb.rpc('reject_member', { p_club: clubId, p_user: userId })); },
    async kick(clubId, userId) { unwrap(await sb.rpc('kick_member', { p_club: clubId, p_user: userId })); },
    async setRole(clubId, userId, role) {
      unwrap(await sb.rpc('set_member_role', { p_club: clubId, p_user: userId, p_role: role }));
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
    async games(clubId) {
      const rows = unwrap(await sb.from('games').select('*, rsvps(user_id, status)')
        .eq('club_id', clubId).order('date').order('start_time'));
      const games = rows.map(mapGame);
      await ensureUsers(games.flatMap((g) => Object.keys(g.rsvps)));
      return games;
    },
    async upcomingGames(limit = 5) {
      if (!state.me) return [];
      const rows = unwrap(await sb.from('games').select('*, rsvps(user_id, status)')
        .gte('date', api.today()).order('date').order('start_time').limit(limit));
      const games = rows.map(mapGame);
      await ensureUsers(games.flatMap((g) => Object.keys(g.rsvps)));
      return games.map((g) => ({ ...g, club: state.clubs.get(g.clubId) || { name: '' } }));
    },
    async createGame(data) {
      const r = unwrap(await sb.from('games').insert({
        club_id: data.clubId, title: data.title, type: data.type, date: data.date,
        start_time: data.start, end_time: data.end, court: data.court, capacity: data.capacity, memo: data.memo || '',
      }).select().single());
      return mapGame(r);
    },
    async deleteGame(id) {
      const rows = unwrap(await sb.from('games').delete().eq('id', id).select('id'));
      if (!rows.length) throw new Error('일정을 삭제할 권한이 없어요.');
    },
    // 같은 응답을 다시 누르면 취소돼요. 바뀐 내 응답(또는 null)을 돌려줘요.
    async rsvp(gameId, status) {
      return unwrap(await sb.rpc('toggle_rsvp', { p_game: gameId, p_status: status }));
    },

    /* 중고거래 */
    async items() {
      const rows = unwrap(await sb.from('items').select('*').order('created_at', { ascending: false }));
      const items = rows.map(mapItem);
      await ensureUsers(items.map((i) => i.sellerId));
      return items;
    },
    async item(id) {
      const r = unwrap(await sb.from('items').select('*').eq('id', id).maybeSingle());
      const item = mapItem(r);
      if (item) await ensureUsers([item.sellerId]);
      return item || null;
    },
    async createItem(data) {
      const tones = ['court', 'ball', 'clay', 'paper'];
      const r = unwrap(await sb.from('items').insert({
        title: data.title, category: data.category, condition: data.condition, price: data.price,
        region: data.region, description: data.desc || '', tone: tones[Math.floor(Math.random() * tones.length)],
      }).select().single());
      return mapItem(r);
    },
    async updateItem(id, patch) {
      const row = {};
      ['title', 'category', 'condition', 'price', 'region', 'status'].forEach((k) => { if (k in patch) row[k] = patch[k]; });
      if ('desc' in patch) row.description = patch.desc;
      const rows = unwrap(await sb.from('items').update(row).eq('id', id).select());
      if (!rows.length) throw new Error('상품을 수정할 수 없어요.');
      return mapItem(rows[0]);
    },
    async deleteItem(id) {
      const rows = unwrap(await sb.from('items').delete().eq('id', id).select('id'));
      if (!rows.length) throw new Error('상품을 삭제할 수 없어요.');
    },

    /* 회비 */
    async dues(clubId, userId = state.me && state.me.id) {
      const rows = unwrap(await sb.from('dues').select('*')
        .eq('club_id', clubId).eq('user_id', userId).order('period', { ascending: false }));
      return rows.map(mapDue);
    },
    async duesByIds(ids) {
      const rows = unwrap(await sb.from('dues').select('*').in('id', ids).order('period'));
      return rows.map(mapDue);
    },
    // 운영진: 해당 월 활동 회원별 회비 [{ user, due }]
    async clubDues(clubId, period) {
      const [members, rows] = await Promise.all([
        api.members(clubId),
        sb.from('dues').select('*').eq('club_id', clubId).eq('period', period).then(unwrap),
      ]);
      const byUser = Object.fromEntries(rows.map((r) => [r.user_id, mapDue(r)]));
      return members.map((u) => ({ user: u, due: byUser[u.id] || null }));
    },
    async duePeriods(clubId) {
      const rows = unwrap(await sb.from('dues').select('period').eq('club_id', clubId));
      return [...new Set(rows.map((r) => r.period))].sort().reverse();
    },
    async markDuesPaid(ids) {
      return unwrap(await sb.rpc('mark_dues_paid', { p_ids: ids }));
    },
    async unpaidSummary() {
      const clubIds = api.myClubs().map((c) => c.id);
      if (!state.me || !clubIds.length) return { total: 0, count: 0 };
      const rows = unwrap(await sb.from('dues').select('amount')
        .eq('user_id', state.me.id).eq('status', 'unpaid').in('club_id', clubIds));
      return { total: rows.reduce((s, d) => s + d.amount, 0), count: rows.length };
    },

    /* 주문 (토스페이먼츠 결제 요청 전에 만드는 주문서). 금액은 서버가 계산해요. */
    async createOrder({ type, refs }) {
      return mapOrder(unwrap(await sb.rpc('create_order', { p_type: type, p_refs: refs })));
    },
    async order(orderId) {
      if (!orderId) return null;
      const r = unwrap(await sb.from('orders').select('*, order_refs(due_id, item_id)').eq('order_id', orderId).maybeSingle());
      return mapOrder(r) || null;
    },
    async recordOrderFailure(orderId, code, message) {
      await sb.rpc('record_order_failure', { p_order_id: orderId, p_code: code, p_message: message });
    },
    // Edge Function payments-confirm이 시크릿 키로 토스 승인 API를 불러요.
    async confirmPayment({ paymentKey, orderId, amount }) {
      const { data: { session } } = await sb.auth.getSession();
      if (!session) return { ok: false, code: 'UNAUTHORIZED', message: '로그인이 필요해요.' };
      try {
        const res = await fetch(`${cfg.URL}/functions/v1/payments-confirm`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            apikey: cfg.PUBLISHABLE_KEY,
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ paymentKey, orderId, amount }),
        });
        return await res.json();
      } catch (err) {
        console.error(err);
        return { ok: false, code: 'NETWORK_ERROR', message: '결제 승인 서버에 연결하지 못했어요. 새로고침해서 다시 시도해 주세요.' };
      }
    },

    /* 도우미 챗봇. Edge Function chat이 OpenAI를 불러요. 로그인했으면 내 주문·회비도 같이 봐요. */
    async chat(messages, page) {
      const { data: { session } } = await sb.auth.getSession();
      const headers = { 'Content-Type': 'application/json', apikey: cfg.PUBLISHABLE_KEY };
      if (session) headers.Authorization = `Bearer ${session.access_token}`;
      let res;
      try {
        res = await fetch(`${cfg.URL}/functions/v1/chat`, {
          method: 'POST', headers, body: JSON.stringify({ messages, page }),
        });
      } catch (err) {
        console.error(err);
        throw new Error('챗봇 서버에 연결하지 못했어요. 인터넷 연결을 확인해 주세요.');
      }
      const data = await res.json().catch(() => ({}));
      if (!data.ok) throw new Error(data.message || '답변을 받지 못했어요. 잠시 후 다시 시도해 주세요.');
      return data.reply;
    },
  };

  global.TC = api;
})(window);
