(async function () {
  'use strict';
  const { $, $$, ballSVG, courtSVG, toast, param, busy } = UI;

  $('#auth-court').outerHTML = courtSVG('court-art', true);
  $('#auth-ball').outerHTML = ballSVG('auth-ball');

  // 외부 주소로 튕기지 않도록 같은 폴더의 .html 경로만 허용해요.
  const next = (() => {
    const n = param('next') || '';
    return /^[\w-]+\.html(\?[\w=&%-]*)?$/.test(n) ? n : 'index.html';
  })();

  const tabs = $('.tabs');
  function show(name) {
    // 로그인·회원가입 탭은 그 두 패널에서만 보여요.
    tabs.hidden = !['login', 'signup'].includes(name);
    $$('[data-tab]').forEach((t) => {
      const on = t.dataset.tab === name;
      t.classList.toggle('is-active', on);
      t.setAttribute('aria-selected', String(on));
    });
    $$('[data-panel]').forEach((p) => { p.hidden = p.dataset.panel !== name; });
  }
  $$('[data-tab]').forEach((t) => t.addEventListener('click', () => show(t.dataset.tab)));
  $$('[data-show]').forEach((b) => b.addEventListener('click', () => show(b.dataset.show)));
  if (!TC.hasDemo()) $('#demo-login').hidden = true;

  function firstInvalid(form) {
    const bad = $$('input, select', form).find((el) => !el.checkValidity());
    if (bad) {
      bad.focus();
      toast(bad.type === 'checkbox' ? '약관에 동의해 주세요.' : `${bad.closest('.field')?.querySelector('label')?.textContent.replace('*', '').trim() || '입력값'}을(를) 확인해 주세요.`, 'error');
    }
    return bad;
  }

  /* 로그인 */
  $('#login-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const f = e.target;
    if (firstInvalid(f)) return;
    busy(f.querySelector('[type=submit]'), async () => {
      try {
        await TC.login(f.email.value, f.password.value);
        location.href = next;
      } catch (err) {
        toast(err.message, 'error');
      }
    });
  });

  $('#demo-login').addEventListener('click', (e) => {
    busy(e.currentTarget, async () => {
      try {
        await TC.loginDemo();
        location.href = next;
      } catch (err) {
        toast(err.message, 'error');
      }
    });
  });

  /* 회원가입 */
  $('#signup-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const f = e.target;
    if (firstInvalid(f)) return;
    busy(f.querySelector('[type=submit]'), async () => {
      try {
        const v = (k) => f.elements[k].value;
        const res = await TC.signup({ name: v('name'), email: v('email'), phone: v('phone'), ntrp: v('ntrp'), password: v('password') });
        if (res.needsConfirm) {
          const email = v('email');
          f.reset();
          show('login');
          $('#login-email').value = email;
          toast('인증 메일을 보냈어요. 메일의 링크를 누른 뒤 로그인해 주세요.');
          return;
        }
        location.href = next === 'index.html' ? 'clubs.html' : next;
      } catch (err) {
        toast(err.message, 'error');
      }
    });
  });

  /* 비밀번호 재설정 */
  $('#forgot-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const f = e.target;
    if (firstInvalid(f)) return;
    busy(f.querySelector('[type=submit]'), async () => {
      try {
        await TC.resetPassword(f.email.value);
        toast('재설정 메일을 보냈어요. 메일함을 확인해 주세요.');
        show('login');
      } catch (err) {
        toast(err.message, 'error');
      }
    });
  });

  $('#newpw-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const f = e.target;
    if (firstInvalid(f)) return;
    busy(f.querySelector('[type=submit]'), async () => {
      try {
        await TC.setNewPassword(f.password.value);
        toast('비밀번호를 바꿨어요.');
        setTimeout(() => { location.href = 'index.html'; }, 800);
      } catch (err) {
        toast(err.message, 'error');
      }
    });
  });

  /* 내 정보 수정 */
  function showProfile() {
    const me = TC.me();
    if (!me) return show('login');
    const f = $('#profile-form');
    f.name.value = me.name;
    f.phone.value = me.phone || '';
    f.ntrp.value = me.ntrp;
    $('#pf-email').textContent = `${me.email} 계정이에요.`;
    show('profile');
  }
  $('#profile-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const f = e.target;
    if (firstInvalid(f)) return;
    busy(f.querySelector('[type=submit]'), async () => {
      try {
        await TC.updateProfile({ name: f.name.value, phone: f.phone.value, ntrp: f.ntrp.value });
        UI.renderUserArea();
        toast('내 정보를 저장했어요.');
      } catch (err) {
        toast(err.message, 'error');
      }
    });
  });

  // 재설정 메일 링크로 들어오면 Supabase가 PASSWORD_RECOVERY 이벤트를 보내요.
  TC.onAuthChange((event) => {
    if (event === 'PASSWORD_RECOVERY') show('newpw');
  });

  await TC.ready;
  const mode = param('mode');
  if (mode === 'reset') show('newpw');
  else if (mode === 'profile') showProfile();
  else if (mode === 'signup') show('signup');
  else if (TC.me() && param('next')) location.replace(next);
})();
