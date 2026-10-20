(function () {
  'use strict';
  const { $, $$, ballSVG, courtSVG, toast, param } = UI;

  $('#auth-court').outerHTML = courtSVG('court-art', true);
  $('#auth-ball').outerHTML = ballSVG('auth-ball');

  // 외부 주소로 튕기지 않도록 같은 폴더의 .html 경로만 허용해요.
  const next = (() => {
    const n = param('next') || '';
    return /^[\w-]+\.html(\?[\w=&%-]*)?$/.test(n) ? n : 'index.html';
  })();

  function switchTab(name) {
    $$('[data-tab]').forEach((t) => {
      const on = t.dataset.tab === name;
      t.classList.toggle('is-active', on);
      t.setAttribute('aria-selected', String(on));
    });
    $$('[data-panel]').forEach((p) => { p.hidden = p.dataset.panel !== name; });
  }
  $$('[data-tab]').forEach((t) => t.addEventListener('click', () => switchTab(t.dataset.tab)));
  if (param('mode') === 'signup') switchTab('signup');

  function firstInvalid(form) {
    const bad = $$('input, select', form).find((el) => !el.checkValidity());
    if (bad) {
      bad.focus();
      toast(bad.type === 'checkbox' ? '약관에 동의해 주세요.' : `${bad.closest('.field')?.querySelector('label')?.textContent.replace('*', '').trim() || '입력값'}을(를) 확인해 주세요.`, 'error');
    }
    return bad;
  }

  $('#login-form').addEventListener('submit', (e) => {
    e.preventDefault();
    if (firstInvalid(e.target)) return;
    const user = TC.login(e.target.email.value);
    if (!user) {
      toast('가입되지 않은 이메일이에요.', 'error');
      return;
    }
    location.href = next;
  });

  $('#demo-login').addEventListener('click', () => {
    TC.loginDemo();
    location.href = next;
  });

  $('#signup-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const f = e.target;
    if (firstInvalid(f)) return;
    try {
      const v = (k) => f.elements[k].value;
      TC.signup({ name: v('name'), email: v('email'), phone: v('phone'), ntrp: v('ntrp') });
      location.href = next === 'index.html' ? 'clubs.html' : next;
    } catch (err) {
      toast(err.message, 'error');
    }
  });
})();
