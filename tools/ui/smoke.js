/* Smoke test (python -I tools/ui_test.py --only smoke.js): every page address opens without a JS/Python error and
   isn't empty: signed out, then as a new member, then as the admin. Resolves to {ok, log}. */
(async function () {
  const log = [], bad = [];
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  async function until(fn, what, ms) {
    const end = Date.now() + (ms || 20000);
    while (Date.now() < end) { try { const v = fn(); if (v) return v; } catch (e) {} await sleep(150); }
    throw new Error('timed out waiting for: ' + what);
  }
  const q = (s) => document.querySelector(s), qa = (s) => Array.from(document.querySelectorAll(s));
  const errs = [];
  window.addEventListener('error', (e) => errs.push(String(e.message)));
  function type(input, value) {
    input.focus(); input.value = value;
    input.dispatchEvent(new Event('input', { bubbles: true })); input.dispatchEvent(new Event('change', { bubbles: true }));
  }
  function call(fn, args) {  // the same bridge the engines use (mb.py install_bridge)
    return Promise.resolve(window.MB_PY.call(fn, JSON.stringify(args || []), true)).then((r) => JSON.parse(r));
  }
  function visibleError() {
    const n = qa('.anvil-notification, .alert-danger, [data-notify="container"]').map((e) => e.textContent).join(' ');
    return /error|exception|went wrong/i.test(n) ? n.slice(0, 200) : '';
  }
  async function check(hash, ready) {
    const before = errs.length;
    if (location.hash !== hash) window.UI_READY = false;
    location.hash = hash;
    try {
      await until(() => window.UI_READY && location.hash === hash && (!ready || ready()), hash, 30000);
    } catch (e) { bad.push(hash + ': ' + e.message); log.push('FAIL ' + hash); return; }
    await sleep(700);
    const text = (q('.ui-main') || q('.mb-stage-page') || document.body).innerText.trim();
    const problem = errs.length > before ? 'JS error: ' + errs.slice(before).join(' / ') : visibleError() ? 'shown: ' + visibleError() : text.length < 40 ? 'empty page' : '';
    if (problem) bad.push(hash + ' ' + problem);
    log.push((problem ? 'FAIL ' : 'ok   ') + hash + (problem ? ' ' + problem : ''));
  }
  async function signOut() {
    await call('get_me');
    location.hash = '#profile';
    await until(() => window.UI_READY && qa('.pf-links button').length, 'profile');
    qa('.pf-links button').find((b) => /Sign out/.test(b.textContent)).click();
    await until(() => location.hash === '#landing' && window.UI_READY && !q('.ui-shell.signed-in'), 'signed out', 30000);
    await sleep(600);
  }
  async function signUp(name, email, pw) {
    if (location.hash !== '#auth/signup') window.UI_READY = false;
    location.hash = '#auth/signup';
    await until(() => window.UI_READY && qa('.anvil-role-btn-block button').some((b) => /Create account/.test(b.textContent)), 'sign-up form');
    await sleep(300);
    const inputs = qa('.au-card input[type=text], .au-card input[type=email], .au-card input[type=password]');
    type(inputs[0], name); type(inputs[1], email); type(inputs[2], pw);
    const tick = q('.au-card input[type=checkbox]'); if (tick && !tick.checked) tick.click();
    qa('.anvil-role-btn-block button').find((b) => /Create account/.test(b.textContent)).click();
    await until(() => location.hash === '#home' && window.UI_READY, 'signed in as ' + email, 30000);
  }
  const STAGE_READY = () => window.MB_STAGE && q('.st-panel') && !/Setting up the room/.test(q('.st-panel').textContent);
  try {
    for (const h of ['#landing', '#auth', '#auth/signup', '#drills', '#drills/handbook', '#report/guest']) await check(h);
    await check('#stage/sample', STAGE_READY);
    await check('#stage/drill:topics', STAGE_READY);
    await check('#landing');
    // member
    await signUp('Smoke Tester', 'smoke' + Date.now() + '@example.com', 'Hb-' + Math.random().toString(36).slice(2) + '-Kq7');
    for (const h of ['#home', '#talks', '#talks/new', '#drills', '#progress', '#profile']) await check(h);
    const c = await call('get_content');
    const t = await call('new_talk_from_template', [c.result.templates[0].key]);
    const tid = t.result.talk.id;
    await check('#talks/' + encodeURIComponent(tid), () => qa('.tk-c').length > 0);
    await check('#stage/' + encodeURIComponent(tid), STAGE_READY);
    const s = await call('save_session', [{ kind: 'talk', talk_id: tid, title: 'Smoke run', venue: 'redcircle', crowd: 40, mode: 'flat',
      metrics: { secs: 75, speech_secs: 60, syllables: 220, pauses: 9 }, timeline: { step: 1, vol: [10, 20, 30, 25], pitch: [120, 130, 0, 140], rate: [3, 4, 3, 4], events: [] } }]);
    if (s.result && s.result.ok && s.result.id) await check('#report/' + encodeURIComponent(s.result.id));
    else log.push('note: save_session said ' + JSON.stringify(s).slice(0, 160));
    await check('#home');
    // the picker dialog
    const btn = qa('.anvil-role-mb-onstage button')[0];
    if (btn) { btn.click(); await until(() => qa('.mb-pick-btn').length >= 3, 'Go on stage picker'); log.push('ok   Go on stage picker'); const cancel = qa('.modal button, .anvil-modal button').find((b) => /Cancel/.test(b.textContent)); if (cancel) cancel.click(); await sleep(800); }
    await signOut();
    // admin (the first arkulinskis@gmail.com sign-up becomes admin; later runs sign in)
    const pw = 'Adm-9x-Smoke-Test-Pw';
    location.hash = '#auth';
    await until(() => window.UI_READY && qa('.au-card input').length >= 2, 'sign-in form');
    let ins = qa('.au-card input[type=email], .au-card input[type=password]');
    type(ins[0], 'arkulinskis@gmail.com'); type(ins[1], pw);
    qa('.anvil-role-btn-block button').find((b) => /Sign in/.test(b.textContent)).click();
    await sleep(2500);
    if (location.hash !== '#home') await signUp('The Admin', 'arkulinskis@gmail.com', pw);
    for (const h of ['#admin', '#admin/stage', '#admin/feedback', '#admin/users', '#admin/demo']) await check(h, () => q('.ui-tabs a[href="#admin/stage"]'));
    log.push(bad.length ? 'PROBLEMS: ' + bad.join(' | ') : 'PASSED');
    return { ok: !bad.length, log: log };
  } catch (e) {
    log.push(String(e && e.message || e));
    return { ok: false, log: log };
  }
})();
