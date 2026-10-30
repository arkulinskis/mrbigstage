/* core.js: the shared front-end engine (window.UI). Same in every app made from APP_MAKER/template;
   app-specific things live in web/app.js (brand, nav, footer) and web/pages/*.html (the pages).

   Pages:   UI.page(name, {title, nav, icon, auth, order, chrome}, mount)
              auth: null (anyone) | 'guest' (signed-out only) | 'user' | 'admin'
              nav: label for the header / phone tab bar (omit to keep it out of the menus)
              mount(view, ctx) draws into `view`; ctx = {args, me, go, api}. Return a Promise (the page
              is "ready" when it resolves) or {ready, destroy}. URLs are #name/arg1/arg2.
   Server:  UI.api(fn, ...args) -> Promise of the server function's return value. A reply of
              {ok: false, error} rejects with that message (shown as a toast unless you .catch it).
            UI.apiQuiet(fn, ...args) is the same without Anvil's loading spinner.
   Auth:    UI.auth('login'|'signup'|'reset'|'logout', {...}) -> Promise of {ok, me, message}
   Helpers: UI.esc, UI.icon, UI.toast, UI.modal, UI.confirm, UI.busy, UI.formData, UI.fmtDate, UI.ago,
            UI.store, UI.setTheme, UI.feedback, UI.go, UI.refresh
   Tests:   window.UI_READY is true when the current page has finished loading. */
(function () {
  'use strict';
  if (window.UI && window.UI.__v) return;
  var UI = window.UI = { __v: 1, pages: {}, me: null, config: { name: 'App', key: 'app', home: 'home', landing: 'landing' } };
  window.UI_READY = false;

  UI.configure = function (cfg) { Object.keys(cfg).forEach(function (k) { UI.config[k] = cfg[k]; }); };

  /* ------------------------------------------------------------------ small helpers */
  UI.esc = function (s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  };
  UI.plural = function (n, one, many) { return n + ' ' + (n === 1 ? one : (many || one + 's')); };
  UI.initials = function (name) {
    var p = String(name || '?').trim().split(/\s+/);
    return ((p[0] || '?')[0] + (p.length > 1 ? p[p.length - 1][0] : '')).toUpperCase();
  };
  UI.fmtDate = function (iso, opts) {
    if (!iso) return '';
    var d = iso.length <= 10 ? new Date(iso + 'T12:00:00') : new Date(iso);
    return d.toLocaleDateString(undefined, opts || { day: 'numeric', month: 'short', year: 'numeric' });
  };
  UI.fmtDateTime = function (iso) {
    return iso ? new Date(iso).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '';
  };
  UI.ago = function (iso) {
    if (!iso) return '';
    var s = (Date.now() - new Date(iso).getTime()) / 1000;
    if (s < 60) return 'just now';
    var steps = [[60, 'minute'], [24, 'hour'], [7, 'day'], [4.35, 'week'], [12, 'month'], [Infinity, 'year']], n = s / 60;
    for (var i = 0; i < steps.length; i++) {
      if (n < steps[i][0]) { n = Math.floor(n); return UI.plural(n, steps[i][1]) + ' ago'; }
      n = n / steps[i][0];
    }
    return '';
  };
  UI.store = {
    get: function (k, dflt) { try { var v = localStorage.getItem(UI.config.key + '.' + k); return v == null ? dflt : JSON.parse(v); } catch (e) { return dflt; } },
    set: function (k, v) { try { localStorage.setItem(UI.config.key + '.' + k, JSON.stringify(v)); } catch (e) {} }
  };
  UI.formData = function (form) {
    var out = {};
    Array.prototype.forEach.call(form.elements, function (el) {
      if (!el.name || el.disabled) return;
      if (el.type === 'checkbox') out[el.name] = el.checked;
      else if (el.type === 'radio') { if (el.checked) out[el.name] = el.value; }
      else out[el.name] = el.value;
    });
    return out;
  };
  /* Disable a button while a Promise runs; returns the Promise. */
  UI.busy = function (btn, promise) {
    if (!btn) return promise;
    btn.disabled = true; btn.classList.add('is-busy');
    var done = function () { btn.disabled = false; btn.classList.remove('is-busy'); };
    promise.then(done, done);
    return promise;
  };

  var ICONS = {
    home: '<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-6 8-6s8 2 8 6"/>',
    users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c0-3.5 3-5.5 6.5-5.5s6.5 2 6.5 5.5"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7"/><path d="M18 14.7c2.2.6 3.5 2.4 3.5 5.3"/>',
    sliders: '<path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12"/><circle cx="16" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="18" cy="18" r="2"/>',
    shield: '<path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6z"/>',
    logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M16 17l5-5-5-5"/><path d="M21 12H9"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    trash: '<path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M6 6l1 14h10l1-14"/>',
    edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13.5 6.5l4 4"/>',
    check: '<path d="M5 12.5l4.5 4.5L19 7"/>',
    x: '<path d="M6 6l12 12M18 6 6 18"/>',
    chat: '<path d="M21 12a8 8 0 0 1-11.6 7.1L4 20.5l1.4-4.9A8 8 0 1 1 21 12z"/>',
    bell: '<path d="M6 8a6 6 0 1 1 12 0c0 7 3 8 3 8H3s3-1 3-8"/><path d="M10 20a2 2 0 0 0 4 0"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
    moon: '<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/>',
    menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
    arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
    back: '<path d="M19 12H5M11 18l-6-6 6-6"/>',
    mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
    bug: '<rect x="7" y="8" width="10" height="12" rx="5"/><path d="M12 8V5M9 5.5 7.5 4M15 5.5 16.5 4M7 13H3M21 13h-4M7.5 18l-3 2M16.5 18l3 2M7.5 9.5l-3-2M16.5 9.5l3-2"/>',
    bulb: '<path d="M9 18h6M10 21h4"/><path d="M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z"/>',
    star: '<path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z"/>',
    heart: '<path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
    chevron: '<path d="m6 9 6 6 6-6"/>',
    external: '<path d="M14 4h6v6M20 4l-9 9"/><path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>',
    lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
    inbox: '<path d="M3 13h5l1.5 3h5L16 13h5"/><path d="M5 5h14l2 8v6H3v-6z"/>',
    grid: '<rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="7" rx="1.5"/><rect x="4" y="13" width="7" height="7" rx="1.5"/><rect x="13" y="13" width="7" height="7" rx="1.5"/>',
    sparkle: '<path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6"/>',
    database: '<ellipse cx="12" cy="5.5" rx="7.5" ry="2.5"/><path d="M4.5 5.5v13c0 1.4 3.4 2.5 7.5 2.5s7.5-1.1 7.5-2.5v-13"/><path d="M4.5 12c0 1.4 3.4 2.5 7.5 2.5s7.5-1.1 7.5-2.5"/>',
    refresh: '<path d="M20 11a8 8 0 0 0-14.3-4.9L4 8"/><path d="M4 4v4h4"/><path d="M4 13a8 8 0 0 0 14.3 4.9L20 16"/><path d="M20 20v-4h-4"/>',
    calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    map: '<path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2z"/><path d="M9 4v14M15 6v14"/>',
    pin: '<path d="M12 21s7-6.2 7-12a7 7 0 0 0-14 0c0 5.8 7 12 7 12z"/><circle cx="12" cy="9" r="2.5"/>',
    camera: '<path d="M4 8h3l2-3h6l2 3h3v12H4z"/><circle cx="12" cy="13.5" r="3.5"/>',
    image: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="m21 16-5-5-9 9"/>',
    globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.7 3.8 5.7 3.8 9s-1.3 6.3-3.8 9c-2.5-2.7-3.8-5.7-3.8-9S9.5 5.7 12 3z"/>',
    copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/>',
    filter: '<path d="M4 5h16l-6 7.5V19l-4 1.5v-8z"/>',
    more: '<circle cx="5" cy="12" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="19" cy="12" r="1.3"/>'
  };
  UI.ICONS = ICONS;
  UI.icon = function (name, cls) {
    return '<svg class="ui-ic ' + (cls || '') + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" ' +
      'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (ICONS[name] || ICONS.sparkle) + '</svg>';
  };

  /* ------------------------------------------------------------------ toasts, modals */
  UI.toast = function (msg, kind) {
    var box = document.querySelector('.ui-toasts');
    if (!box) { box = document.createElement('div'); box.className = 'ui ui-toasts'; box.setAttribute('aria-live', 'polite'); document.body.appendChild(box); }
    var t = document.createElement('div');
    t.className = 'ui-toast' + (kind ? ' ' + kind : '');
    t.innerHTML = (kind === 'error' ? UI.icon('info') : kind === 'ok' ? UI.icon('check') : '') + '<span>' + UI.esc(msg) + '</span>';
    box.appendChild(t);
    setTimeout(function () { t.classList.add('out'); setTimeout(function () { t.remove(); }, 300); }, kind === 'error' ? 6500 : 3200);
  };
  UI.modal = function (html, opts) {
    opts = opts || {};
    var prev = document.activeElement;
    var wrap = document.createElement('div');
    wrap.className = 'ui ui-modal-wrap';
    wrap.innerHTML = '<div class="ui-modal' + (opts.wide ? ' wide' : '') + '" role="dialog" aria-modal="true">' +
      '<button class="ui-btn ghost icon ui-modal-x" data-close aria-label="Close">' + UI.icon('x') + '</button>' + html + '</div>';
    document.body.appendChild(wrap);
    document.documentElement.classList.add('ui-modal-open');
    function key(e) { if (e.key === 'Escape') close(); }
    function close() {
      if (!wrap.parentNode) return;
      wrap.remove(); document.removeEventListener('keydown', key);
      if (!document.querySelector('.ui-modal-wrap')) document.documentElement.classList.remove('ui-modal-open');
      if (opts.onclose) opts.onclose();
      if (prev && prev.focus) prev.focus();
    }
    document.addEventListener('keydown', key);
    wrap.addEventListener('mousedown', function (e) { if (e.target === wrap) close(); });
    wrap.addEventListener('click', function (e) { if (e.target.closest('[data-close]')) close(); });
    var first = wrap.querySelector('input, textarea, select');
    setTimeout(function () { (first || wrap.querySelector('.ui-modal')).focus && (first || wrap.querySelector('.ui-modal')).focus(); }, 30);
    return { el: wrap.querySelector('.ui-modal'), close: close };
  };
  UI.confirm = function (o) {
    o = typeof o === 'string' ? { title: o } : (o || {});
    return new Promise(function (resolve) {
      var answered = false;
      var m = UI.modal('<h2>' + UI.esc(o.title || 'Are you sure?') + '</h2>' + (o.text ? '<p class="muted">' + UI.esc(o.text) + '</p>' : '') +
        '<div class="ui-row end" style="margin-top:20px"><button class="ui-btn ghost" data-close>' + UI.esc(o.cancel || 'Cancel') + '</button>' +
        '<button class="ui-btn ' + (o.danger ? 'danger solid' : 'primary') + '" data-ok>' + UI.esc(o.ok || 'OK') + '</button></div>',
      { onclose: function () { if (!answered) resolve(false); } });
      m.el.querySelector('[data-ok]').onclick = function () { answered = true; m.close(); resolve(true); };
    });
  };

  /* ------------------------------------------------------------------ theme */
  UI.theme = function () { return UI.store.get('theme', 'auto'); };
  UI.applyTheme = function (t) {
    if (t === 'light' || t === 'dark') document.documentElement.setAttribute('data-theme', t);
    else document.documentElement.removeAttribute('data-theme');
    var dark = t === 'dark' || (t !== 'light' && window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.classList.toggle('ui-dark', !!dark);
  };
  UI.setTheme = function (t) { UI.store.set('theme', t); UI.applyTheme(t); };
  UI.applyTheme(UI.theme());
  if (window.matchMedia) {
    try { matchMedia('(prefers-color-scheme: dark)').addEventListener('change', function () { UI.applyTheme(UI.theme()); }); } catch (e) {}
  }

  /* ------------------------------------------------------------------ server bridge */
  var bridge = null;
  function send(kind, payload) {
    if (!bridge) return Promise.reject(new Error('The app is still starting.'));
    var out;
    try { out = bridge(kind, JSON.stringify(payload || {})); } catch (e) { return Promise.reject(e); }
    return Promise.resolve(out).then(function (r) {
      r = typeof r === 'string' ? JSON.parse(r) : (r || {});
      if (r.error) {
        var err = new Error(r.error); err.uiApi = true; err.denied = !!r.denied;
        if (r.detail) console.error(kind, payload && payload.fn, r.detail);
        if (r.reload) setTimeout(function () { location.reload(); }, 2500);
        throw err;
      }
      return r.result;
    });
  }
  function apiCall(quiet, fn, args) {
    return send('call', { fn: fn, args: args, quiet: quiet }).then(function (res) {
      if (res && typeof res === 'object' && res.ok === false) {
        var err = new Error(res.error || 'That didn\'t work.'); err.uiApi = true; err.expected = true; err.result = res;
        throw err;
      }
      return res;
    });
  }
  UI.api = function (fn) { return apiCall(false, fn, Array.prototype.slice.call(arguments, 1)); };
  UI.apiQuiet = function (fn) { return apiCall(true, fn, Array.prototype.slice.call(arguments, 1)); };
  /* Errors nobody caught become a toast, so a failed action is never silent. */
  window.addEventListener('unhandledrejection', function (e) {
    if (e.reason && e.reason.uiApi) { e.preventDefault(); UI.toast(e.reason.message, 'error'); }
  });

  /* Sign in / up / out. On success it navigates: to where the visitor was heading (UI.after) or home
     after signing in, to the landing page after signing out. */
  UI.auth = function (kind, payload) {
    return send(kind, payload || {}).then(function (r) {
      if (r && r.ok === false) { var err = new Error(r.error); err.uiApi = true; err.expected = true; throw err; }
      if (r && 'me' in r && (r.me || kind === 'logout')) {
        UI.me = r.me || null;
        var target = r.me ? (UI.after || '#' + UI.config.home) : '#' + UI.config.landing;
        UI.after = null;
        if (location.hash === target) route(); else location.hash = target;
      }
      return r;
    });
  };
  /* Update the signed-in user's details (e.g. a new name) and redraw the header, without reloading the page. */
  UI.setMe = function (me) {
    UI.me = me || null;
    if (shellRoot) renderChrome(current.name);
  };

  /* ------------------------------------------------------------------ pages and routing */
  UI.page = function (name, opts, mount) {
    if (typeof opts === 'function') { mount = opts; opts = {}; }
    opts.name = name; opts.mount = mount;
    UI.pages[name] = opts;
  };
  UI.allowed = function (p) {
    if (!p) return false;
    if (p.auth === 'user') return !!UI.me;
    if (p.auth === 'admin') return !!(UI.me && UI.me.is_admin);
    if (p.auth === 'guest') return !UI.me;
    return true;
  };
  UI.navPages = function () {
    return Object.keys(UI.pages).map(function (k) { return UI.pages[k]; })
      .filter(function (p) { return p.nav && UI.allowed(p) && (!p.when || p.when()); })
      .sort(function (a, b) { return (a.order || 50) - (b.order || 50); });
  };
  UI.parseHash = function () {
    var h = (location.hash || '').replace(/^#!?\/?/, '');
    var parts = h.split('?')[0].split('/').filter(function (x) { return x !== ''; }).map(decodeURIComponent);
    return { name: parts[0] || '', args: parts.slice(1) };
  };
  UI.hashFor = function (name) {
    var args = Array.prototype.slice.call(arguments, 1).filter(function (a) { return a != null && a !== ''; });
    return '#' + [name].concat(args.map(encodeURIComponent)).join('/');
  };
  UI.go = function (name) {
    var h = UI.hashFor.apply(null, arguments);
    if (location.hash === h) route(); else location.hash = h;
  };
  UI.refresh = function () { route(); };
  UI.after = null;  // where to go after signing in

  var shellRoot = null, view = null, current = { name: null, destroy: null }, routeSeq = 0;

  function defaultPage() { return UI.me ? UI.config.home : UI.config.landing; }

  function route() {
    var r = UI.parseHash(), name = r.name || defaultPage(), p = UI.pages[name];
    if (!p) { name = defaultPage(); p = UI.pages[name]; r.args = []; }
    if (p.auth === 'guest' && UI.me) { p = UI.pages[UI.config.home]; name = UI.config.home; r.args = []; }
    if ((p.auth === 'user' || p.auth === 'admin') && !UI.me) {
      UI.after = location.hash && location.hash !== '#' ? location.hash : null;
      p = UI.pages.auth; name = 'auth'; r.args = [];
    }
    if (p.auth === 'admin' && !(UI.me && UI.me.is_admin)) {
      UI.toast('That page is for admins only.', 'error');
      p = UI.pages[UI.config.home]; name = UI.config.home; r.args = [];
    }
    var seq = ++routeSeq;
    window.UI_READY = false;
    if (current.destroy) { try { current.destroy(); } catch (e) { console.error(e); } }
    current = { name: name, args: r.args, destroy: null };
    if (shellRoot) {
      shellRoot.className = 'ui ui-shell page-' + name + (UI.me ? ' signed-in' : ' signed-out') + (p.chrome === false ? ' no-chrome' : '');
      renderChrome(name);
    }
    // A fresh element for every page, so listeners a page adds to `view` never pile up.
    var fresh = view.cloneNode(false);
    view.parentNode.replaceChild(fresh, view);
    view = fresh;
    window.scrollTo(0, 0);
    document.title = (p.title ? (typeof p.title === 'function' ? p.title(r.args) : p.title) + ' · ' : '') + UI.config.name;
    var ctx = { name: name, args: r.args, me: UI.me, go: UI.go, api: UI.api, page: p };
    var out;
    try { out = p.mount(view, ctx); } catch (e) { console.error(e); out = Promise.reject(e); }
    var ready = out && typeof out.then === 'function' ? out : (out && out.ready) || Promise.resolve();
    if (out && out.destroy) current.destroy = out.destroy;
    Promise.resolve(ready).then(function () { if (seq === routeSeq) window.UI_READY = true; },
      function (e) {
        if (seq !== routeSeq) return;
        console.error(e);
        if (!view.innerHTML) view.innerHTML = '<div class="ui-wrap"><div class="ui-empty">' + UI.icon('info') +
          '<h3>This page didn\'t load</h3><p class="muted">' + UI.esc(e && e.message || 'Something went wrong.') + '</p>' +
          '<button class="ui-btn" onclick="UI.refresh()">Try again</button></div></div>';
        window.UI_READY = true;
      });
  }
  UI.current = function () { return current; };

  /* The shell's parts come from web/app.js: UI.shell = {header(me, active), footer(me), tabbar(me, active)} */
  function renderChrome(active) {
    var S = UI.shell || {};
    var hd = shellRoot.querySelector('[data-ui-header]'), ft = shellRoot.querySelector('[data-ui-footer]'), tb = shellRoot.querySelector('[data-ui-tabbar]');
    if (hd) hd.innerHTML = S.header ? S.header(UI.me, active) : '';
    if (ft) ft.innerHTML = S.footer ? S.footer(UI.me, active) : '';
    if (tb) tb.innerHTML = S.tabbar ? S.tabbar(UI.me, active) : '';
  }
  UI.renderChrome = function () { if (shellRoot) renderChrome(current.name); };

  /* Called by client_code/Main.py (and by the local harness) once the page is up. */
  UI.start = function (node, bridgeFn, bootJson) {
    bridge = bridgeFn;
    var boot = typeof bootJson === 'string' ? JSON.parse(bootJson || '{}') : (bootJson || {});
    UI.me = boot.me || null;
    var host = node && node.matches && node.matches('[data-ui-app]') ? node : (node && node.querySelector('[data-ui-app]')) || node || document.body;
    host.innerHTML = '<div class="ui ui-shell">' +
      '<header class="ui-header" data-ui-header></header>' +
      '<main class="ui-main" data-ui-view></main>' +
      '<footer class="ui-footer" data-ui-footer></footer>' +
      '<nav class="ui-tabbar" data-ui-tabbar aria-label="Main"></nav></div>';
    shellRoot = host.firstChild;
    view = host.querySelector('[data-ui-view]');
    if (UI.shell && UI.shell.wire) UI.shell.wire(shellRoot);
    window.addEventListener('hashchange', route);
    route();
  };

  /* ------------------------------------------------------------------ feedback form (footer + menu) */
  UI.feedback = function (kind) {
    var kinds = [['bug', 'Something\'s broken', 'bug'], ['idea', 'An idea', 'bulb'], ['question', 'A question', 'info'], ['other', 'Something else', 'chat']];
    var m = UI.modal('<h2>Send feedback</h2><p class="muted">Found a bug or have an idea? It goes straight to the people who make ' + UI.esc(UI.config.name) + '.</p>' +
      '<form class="ui-stack" data-fb>' +
      '<div class="ui-choices">' + kinds.map(function (k) {
        return '<label class="ui-choice"><input type="radio" name="kind" value="' + k[0] + '"' + ((kind || 'bug') === k[0] ? ' checked' : '') + '>' +
          '<span>' + UI.icon(k[2]) + UI.esc(k[1]) + '</span></label>';
      }).join('') + '</div>' +
      '<label class="ui-field"><span>What happened, or what would you like?</span><textarea name="message" rows="5" required minlength="5" placeholder="The more detail, the better."></textarea></label>' +
      (UI.me ? '' : '<label class="ui-field"><span>Your email <em>(optional, if you\'d like a reply)</em></span><input type="email" name="email" autocomplete="email"></label>') +
      '<p class="ui-hint">We also send the page you were on, your screen size and browser, to help us fix bugs.</p>' +
      '<div class="ui-row end"><button type="button" class="ui-btn ghost" data-close>Cancel</button><button class="ui-btn primary" type="submit">' + UI.icon('arrow') + 'Send</button></div></form>');
    var form = m.el.querySelector('[data-fb]');
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var v = UI.formData(form);
      var ctx = { page: location.hash || '#', screen: innerWidth + 'x' + innerHeight, browser: navigator.userAgent.slice(0, 280), theme: UI.theme() };
      UI.busy(form.querySelector('[type=submit]'), UI.api('submit_feedback', v.kind, v.message, v.email || null, ctx)).then(function () {
        m.close(); UI.toast('Thank you! Your message was sent.', 'ok');
      });
    });
    return m;
  };

  /* Shared clicks: [data-go="page/arg"], [data-feedback], [data-theme-set] anywhere in the app. */
  document.addEventListener('click', function (e) {
    var el = e.target.closest && e.target.closest('[data-go],[data-feedback],[data-theme-set]');
    if (!el) return;
    if (el.hasAttribute('data-go')) { e.preventDefault(); UI.go.apply(null, el.getAttribute('data-go').split('/')); }
    else if (el.hasAttribute('data-feedback')) { e.preventDefault(); UI.feedback(el.getAttribute('data-feedback') || null); }
    else if (el.hasAttribute('data-theme-set')) { e.preventDefault(); UI.setTheme(el.getAttribute('data-theme-set')); if (UI.shell && UI.shell.onTheme) UI.shell.onTheme(); }
  });
})();


/* app.js: this app's identity and frame: name, header, footer, phone tab bar.
   Pages live in web/pages/*.html. The engine (window.UI) is web/core.js. */
(function () {
  'use strict';
  UI.configure({
    name: 'MrBigStage',
    key: 'mrbigstage',          // prefix for this app's browser storage
    tagline: 'Rehearse on a big stage. Speak bigger in real life.',   // footer line
    home: 'home',                // first page after signing in
    landing: 'landing'           // first page for visitors who aren't signed in
  });

  var esc = UI.esc;

  // MrBigStage's own icons (24px, stroke)
  Object.assign(UI.ICONS, {
    mic: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21M8.5 21h7"/>',
    play: '<path d="M7 4.5v15l12-7.5z"/>',
    stop: '<rect x="6" y="6" width="12" height="12" rx="2"/>',
    pause: '<path d="M9 5v14M15 5v14"/>',
    gauge: '<path d="M4 17a8 8 0 1 1 16 0"/><path d="M12 17l4.5-5.5"/><circle cx="12" cy="17" r="1.3"/>',
    zap: '<path d="M13 3 5 13.5h6L10 21l8-10.5h-6z"/>',
    volume: '<path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/><path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11"/>',
    wave: '<path d="M3 12h2l2-6 3 12 3-15 3 15 2-6h3"/>',
    anchor: '<circle cx="12" cy="5.5" r="2"/><path d="M12 7.5V21M7 11h10M4.5 14a7.5 7.5 0 0 0 15 0"/>',
    flag: '<path d="M5 21V4M5 4h11l-2 4 2 4H5"/>',
    eye: '<path d="M2.5 12s3.5-6.5 9.5-6.5S21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/>',
    hand: '<path d="M8 13V5.5a1.5 1.5 0 0 1 3 0V11M11 10.5V4a1.5 1.5 0 0 1 3 0v6.5M14 10.5V5.5a1.5 1.5 0 0 1 3 0V14c0 4-2.5 7-6 7-2.5 0-4-1.2-5.5-3.5L3.8 15a1.5 1.5 0 0 1 2.4-1.8L8 15"/>',
    chart: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
    trend: '<path d="M3 17l6-6 4 4 8-8"/><path d="M15 7h6v6"/>',
    layers: '<path d="m12 3 9 5-9 5-9-5z"/><path d="m3 13 9 5 9-5"/>',
    lungs: '<path d="M12 4v8M12 10c-1.5 1-2 2-2 3.5M12 10c1.5 1 2 2 2 3.5"/><path d="M9 7.5C6 7.5 3.5 12 3.5 16c0 2 1 3.5 3 3.5s3.5-1.5 3.5-4V9.5"/><path d="M15 7.5c3 0 5.5 4.5 5.5 8.5 0 2-1 3.5-3 3.5s-3.5-1.5-3.5-4V9.5"/>',
    dice: '<rect x="4" y="4" width="16" height="16" rx="3"/><circle cx="9" cy="9" r="1.1"/><circle cx="15" cy="15" r="1.1"/><circle cx="15" cy="9" r="1.1"/><circle cx="9" cy="15" r="1.1"/>',
    glass: '<path d="M8 3h8l-.5 6a3.5 3.5 0 0 1-7 0z"/><path d="M12 12.5V20M8.5 21h7"/>',
    briefcase: '<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M9 7V5a1.5 1.5 0 0 1 1.5-1.5h3A1.5 1.5 0 0 1 15 5v2M3 12.5h18"/>',
    school: '<path d="m2.5 9 9.5-5 9.5 5-9.5 5z"/><path d="M6.5 11v5c2.5 2.5 8.5 2.5 11 0v-5M21.5 9v6"/>',
    rocket: '<path d="M12 15c-2-1-3-2-4-4 1.5-5 4.5-8 10-8.5-.5 5.5-3.5 8.5-6 12.5z"/><path d="M8 11l-3.5.5L3 15l4.5-.5M13 16l-.5 3.5L9 21l.5-4.5"/><circle cx="14.5" cy="8.5" r="1.4"/>',
    crown: '<path d="M3 8l4.5 4L12 5l4.5 7L21 8l-2 11H5z"/>',
    flame: '<path d="M12 21c-4 0-6.5-2.8-6.5-6.3 0-3.7 3.4-5.5 3.8-9.7 2.4 1.4 3.7 3.4 3.8 5.3 1-.6 1.6-1.6 1.7-2.8 2.2 1.6 3.7 4.2 3.7 7.2 0 3.5-2.5 6.3-6.5 6.3z"/>',
    dumbbell: '<path d="M6.5 6.5v11M17.5 6.5v11M3.5 9v6M20.5 9v6M6.5 12h11"/>',
    repeat: '<path d="M17 2.5 20.5 6 17 9.5"/><path d="M3.5 11.5V10a4 4 0 0 1 4-4h13M7 21.5 3.5 18 7 14.5"/><path d="M20.5 12.5V14a4 4 0 0 1-4 4h-13"/>',
    circle: '<ellipse cx="12" cy="15" rx="9" ry="3.5"/><circle cx="12" cy="6.5" r="2.5"/>',
    stadium: '<ellipse cx="12" cy="8" rx="9.5" ry="3.5"/><path d="M2.5 8v7c0 2 4.3 3.5 9.5 3.5s9.5-1.5 9.5-3.5V8"/>',
    chair: '<path d="M7 3v10h10V3M5 13h14M7 13v8M17 13v8"/>',
    flagpole: '<path d="M5 21V3M5 4h12l-3 3.5 3 3.5H5"/><path d="M3 21h6"/>',
    music: '<path d="M9 18V5l11-2v13"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="17.5" cy="16" r="2.5"/>',
    elevator: '<rect x="5" y="3" width="14" height="18" rx="2"/><path d="m9.5 8.5 2.5-2.5 2.5 2.5M9.5 15.5l2.5 2.5 2.5-2.5"/>',
    headset: '<rect x="2.5" y="8" width="19" height="9" rx="4"/><path d="M9.5 17l1.2-2.5h2.6L14.5 17"/><circle cx="7.5" cy="12.5" r="1.4"/><circle cx="16.5" cy="12.5" r="1.4"/>',
    book: '<path d="M4 4.5A1.5 1.5 0 0 1 5.5 3H20v16H5.5A1.5 1.5 0 0 0 4 20.5z"/><path d="M4 20.5A1.5 1.5 0 0 0 5.5 22H20"/>',
    cards: '<rect x="3" y="6" width="13" height="15" rx="2"/><path d="M8 3h11a2 2 0 0 1 2 2v13"/>'
  });

  function brand() {
    return '<a class="ui-brand" href="#" data-go="' + (UI.me ? UI.config.home : UI.config.landing) + '" aria-label="' + esc(UI.config.name) + ' home">' +
      '<img src="_/theme/icon.svg" alt="" width="32" height="32"><span>Mr<b>Big</b>Stage</span></a>';
  }

  function themeSwitch() {
    var t = UI.theme();
    return '<div class="ui-seg" role="group" aria-label="Appearance">' + [['auto', 'Auto'], ['light', 'Light'], ['dark', 'Dark']].map(function (o) {
      return '<button type="button" data-theme-set="' + o[0] + '" class="' + (t === o[0] ? 'on' : '') + '">' + o[1] + '</button>';
    }).join('') + '</div>';
  }

  function userMenu(me) {
    return '<div class="ui-menu" data-menu hidden>' +
      '<div class="ui-menu-head"><strong>' + esc(me.name) + '</strong><span class="muted small">' + esc(me.email) + '</span></div>' +
      '<a href="#profile" data-go="profile">' + UI.icon('user') + 'Your profile</a>' +
      (me.is_admin ? '<a href="#admin" data-go="admin">' + UI.icon('shield') + 'Admin</a>' : '') +
      '<div class="ui-menu-block"><span class="small muted">Appearance</span>' + themeSwitch() + '</div>' +
      '<button type="button" data-feedback>' + UI.icon('chat') + 'Send feedback</button>' +
      '<button type="button" data-lk-open="overview">' + UI.icon('lock') + 'Privacy &amp; Terms</button>' +
      '<button type="button" data-signout>' + UI.icon('logout') + 'Sign out</button></div>';
  }

  UI.shell = {
    header: function (me, active) {
      var nav = UI.navPages();
      return '<div class="ui-header-in">' + brand() +
        (me ? '<nav class="ui-nav" aria-label="Main">' + nav.map(function (p) {
          return '<a href="#' + p.name + '" class="' + (p.name === active ? 'on' : '') + '">' + UI.icon(p.icon) + '<span>' + esc(p.nav) + '</span></a>';
        }).join('') + '</nav>' : '') +
        '<div class="ui-header-right">' +
        (me ? '<button type="button" class="ui-btn primary sm mb-onstage" data-quickstart>' + UI.icon('mic') + '<span>Go on stage</span></button>' : '') +
        (me ? '<button type="button" class="ui-avatar-btn" data-menu-toggle aria-label="Your account" aria-haspopup="true">' + esc(UI.initials(me.name)) + '</button>' + userMenu(me)
          : (active === 'auth' ? '' : '<a class="ui-btn ghost" href="#auth" data-go="auth">Sign in</a><a class="ui-btn primary" href="#auth/signup" data-go="auth/signup">Get started</a>')) +
        '</div></div>';
    },
    footer: function (me) {
      return '<div class="ui-footer-in"><div class="ui-footer-brand">' + brand() + '<p class="muted small">' + esc(UI.config.tagline) + '</p></div>' +
        '<div class="ui-footer-links">' +
        '<a href="#landing" data-go="landing">About</a>' +
        '<button type="button" data-feedback>Send feedback</button>' +
        '<button type="button" data-lk-open="overview">Privacy &amp; Terms</button>' +
        '</div><p class="ui-footer-legal small muted">© ' + new Date().getFullYear() + ' ' + esc(UI.config.name) + '</p></div>';
    },
    tabbar: function (me, active) {
      var nav = UI.navPages();
      if (!me || nav.length < 2) return '';
      return nav.slice(0, 4).map(function (p) {
        return '<a href="#' + p.name + '" class="' + (p.name === active ? 'on' : '') + '">' + UI.icon(p.icon) + '<span>' + esc(p.nav) + '</span></a>';
      }).join('') + '<a href="#profile" class="' + (active === 'profile' ? 'on' : '') + '">' + UI.icon('user') + '<span>You</span></a>';
    },
    wire: function (root) {
      root.addEventListener('click', function (e) {
        var t = e.target.closest('[data-menu-toggle]');
        var menu = root.querySelector('[data-menu]');
        if (t && menu) { menu.hidden = !menu.hidden; t.setAttribute('aria-expanded', String(!menu.hidden)); return; }
        if (e.target.closest('[data-signout]')) { UI.auth('logout').then(function () { UI.toast('Signed out. See you soon!'); }); }
        if (menu && !menu.hidden && !e.target.closest('[data-menu] .ui-seg')) menu.hidden = true;
      });
      document.addEventListener('keydown', function (e) {
        var menu = root.querySelector('[data-menu]');
        if (e.key === 'Escape' && menu) menu.hidden = true;
      });
    },
    onTheme: function () {  // redraw the menu's Auto/Light/Dark buttons and keep the menu open
      var menu = document.querySelector('[data-menu]'), open = menu && !menu.hidden;
      UI.renderChrome();
      if (open) document.querySelector('[data-menu]').hidden = false;
    }
  };
})();


/* ===== _mb.html ===== */
(function () {
  'use strict';
  var MB = window.MB = window.MB || {};
  var esc = UI.esc;

  /* ------------------------------------------------------------------ content + three */
  var contentP = null;
  MB.content = function () {
    if (!contentP) contentP = UI.apiQuiet('get_content').then(function (c) {
      MB.C = c;
      c.partBy = {}; c.parts.forEach(function (p) { c.partBy[p.key] = p; });
      c.venueBy = {}; c.venues.forEach(function (v) { c.venueBy[v.key] = v; });
      c.drillBy = {}; c.drills.forEach(function (d) { c.drillBy[d.key] = d; });
      c.templateBy = {}; c.templates.forEach(function (t) { c.templateBy[t.key] = t; });
      return c;
    }, function (e) { contentP = null; throw e; });
    return contentP;
  };
  var threeP = null;
  MB.three = function () {
    if (window.THREE) return Promise.resolve(window.THREE);
    if (threeP) return threeP;
    threeP = new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = '_/theme/three.min.js'; s.async = true;
      s.onload = function () { window.THREE ? resolve(window.THREE) : reject(new Error('3D engine missing')); };
      s.onerror = function () { threeP = null; reject(new Error('Could not load the 3D stage. Check your connection.')); };
      document.head.appendChild(s);
    });
    return threeP;
  };

  /* ------------------------------------------------------------------ small helpers */
  MB.fmtSecs = function (s) {
    s = Math.max(0, Math.round(s || 0));
    var m = Math.floor(s / 60), r = s % 60;
    return m + ':' + (r < 10 ? '0' : '') + r;
  };
  MB.fmtMins = function (s) { s = s || 0; return s < 60 ? Math.round(s) + ' s' : (s < 600 ? (s / 60).toFixed(1).replace('.0', '') : Math.round(s / 60)) + ' min'; };
  MB.scoreClass = function (v) { return v == null ? '' : v >= 75 ? 'good' : v >= 50 ? 'mid' : 'low'; };
  MB.num = function (n) { return (n || 0).toLocaleString(); };
  MB.venueName = function (k) { return MB.C && MB.C.venueBy[k] ? MB.C.venueBy[k].name : k; };
  MB.median = function (a) { if (!a.length) return 0; var b = a.slice().sort(function (x, y) { return x - y; }); var m = b.length >> 1; return b.length % 2 ? b[m] : (b[m - 1] + b[m]) / 2; };
  MB.mean = function (a) { if (!a.length) return 0; var s = 0; for (var i = 0; i < a.length; i++) s += a[i]; return s / a.length; };
  MB.std = function (a) { if (a.length < 2) return 0; var m = MB.mean(a), s = 0; for (var i = 0; i < a.length; i++) s += (a[i] - m) * (a[i] - m); return Math.sqrt(s / a.length); };
  MB.pct = function (a, p) { if (!a.length) return 0; var b = a.slice().sort(function (x, y) { return x - y; }); return b[Math.min(b.length - 1, Math.max(0, Math.round(p * (b.length - 1))))]; };

  /* Turn a pasted script into cue cards: blank lines split cards; long paragraphs split by sentences (~45 words). */
  MB.splitScript = function (text, maxWords) {
    maxWords = maxWords || 45;
    var out = [];
    String(text || '').replace(/\r/g, '').split(/\n\s*\n+/).forEach(function (para) {
      para = para.replace(/\s+/g, ' ').trim();
      if (!para) return;
      var sentences = para.match(/[^.!?]+[.!?]+["')\]]*|[^.!?]+$/g) || [para], cur = '';
      sentences.forEach(function (s) {
        s = s.trim();
        var n = (cur + ' ' + s).trim().split(/\s+/).length;
        if (cur && n > maxWords) { out.push(cur); cur = s; } else cur = (cur + ' ' + s).trim();
      });
      if (cur) out.push(cur);
    });
    return out.map(function (t) { return { text: t, slide: '' }; });
  };

  /* ------------------------------------------------------------------ the voice analyser
     Frames of ~23 ms: loudness (dB), pitch (YIN on a 11 kHz copy), clarity (how periodic = how full the voice is),
     zero crossings and spectral centroid (brightness of the timbre). From the frames, live: speaking or not,
     pauses, syllables (loudness peaks in voiced sound -> pace), hesitation sounds (long, flat, steady voiced
     stretches: "uhhh", "ummm", "sooo"), and per phrase whether it ended rising (uptalk) or fading (trailing off).
     summary() turns it all into the metrics the server scores (Scoring.py), timeline() into the report chart. */
  MB.Voice = function (opts) {
    opts = opts || {};
    var V = {
      sr: 48000, t: 0, floor: -60, calibrated: false, muted: false,
      // per-frame arrays
      T: [], DB: [], F0: [], CL: [], CEN: [], ACT: [], ENV: [], ENVA: [],
      events: [], live: { db: -90, level: 0, snr: 0, speaking: false, wpm: 0, fillers: 0, pauses: 0, sincePause: 0, pitch: 0, pitchVar: 0, silence: 0 },
      onEvent: opts.onEvent || null
    };
    var D = 4, fs = 12000, ring = new Float32Array(512), ringN = 0, dsAcc = 0, dsCount = 0;
    var N = 512, maxLag = 0, minLag = 0, dbuf = null, cmnd = null;
    var analyser = null, freqBuf = null, ctx = null, node = null, src = null, stream = null, hp = null, zero = null;
    var HOP = 1024;
    // running state
    var silentRun = 0, speaking = false, firstSpeech = null, lastSpeech = null, pauseStart = null;
    var run = null;              // current voiced run {t0, b0 (first envelope block), st:[], db:[]}
    var utt = null;              // current phrase {t0, frames idx start}
    var phrases = 0, uptalk = 0, trail = 0, fillers = 0, pauses = [], marks = [];
    var calib = [];

    // speech-band filter (300-2500 Hz) for the syllable envelope, in ~5 ms blocks
    var bq = { b0: 0, b1: 0, b2: 0, a1: 0, a2: 0, x1: 0, x2: 0, y1: 0, y2: 0 }, SB = 240, subAcc = 0, subN = 0;
    function setRate(sr) {
      V.sr = sr; D = Math.max(1, Math.round(sr / 11025)); fs = sr / D;
      maxLag = Math.floor(fs / 70); minLag = Math.floor(fs / 420);
      dbuf = new Float32Array(maxLag + 2); cmnd = new Float32Array(maxLag + 2);
      SB = Math.round(sr / 200);
      var w0 = 2 * Math.PI * 900 / sr, alpha = Math.sin(w0) / (2 * 0.55), a0 = 1 + alpha;
      bq.b0 = alpha / a0; bq.b1 = 0; bq.b2 = -alpha / a0; bq.a1 = -2 * Math.cos(w0) / a0; bq.a2 = (1 - alpha) / a0;
    }
    setRate(48000);

    function yin() {
      // ring holds the last N downsampled samples in order (oldest first)
      var W = N - maxLag - 1, tau, j, s, d;
      for (tau = 1; tau <= maxLag; tau++) {
        s = 0;
        for (j = 0; j < W; j++) { d = ring[j] - ring[j + tau]; s += d * d; }
        dbuf[tau] = s;
      }
      var run = 0;
      cmnd[0] = 1;
      for (tau = 1; tau <= maxLag; tau++) { run += dbuf[tau]; cmnd[tau] = run > 0 ? dbuf[tau] * tau / run : 1; }
      var best = -1, minV = 1;
      for (tau = minLag; tau <= maxLag; tau++) {
        if (cmnd[tau] < minV) minV = cmnd[tau];
        if (cmnd[tau] < 0.18) {
          while (tau + 1 <= maxLag && cmnd[tau + 1] < cmnd[tau]) tau++;
          best = tau; break;
        }
      }
      if (best < 0) return { f0: 0, clar: Math.max(0, 1 - minV) };
      var x0 = best > 1 ? cmnd[best - 1] : cmnd[best], x2 = best < maxLag ? cmnd[best + 1] : cmnd[best];
      var den = 2 * (2 * cmnd[best] - x2 - x0), shift = den ? (x2 - x0) / den : 0;
      if (Math.abs(shift) > 1) shift = 0;
      return { f0: fs / (best + shift), clar: Math.max(0, Math.min(1, 1 - cmnd[best])) };
    }

    function centroid() {
      if (!analyser) return 0;
      analyser.getFloatFrequencyData(freqBuf);
      var binHz = V.sr / analyser.fftSize, num = 0, den = 0;
      for (var i = Math.floor(100 / binHz); i < Math.min(freqBuf.length, Math.floor(8000 / binHz)); i++) {
        var mag = Math.pow(10, freqBuf[i] / 20); num += mag * i * binHz; den += mag;
      }
      return den > 0 ? num / den : 0;
    }

    function frame(samples) {
      // loudness
      var sum = 0, i, zc = 0;
      for (i = 0; i < samples.length; i++) { sum += samples[i] * samples[i]; if (i && (samples[i] >= 0) !== (samples[i - 1] >= 0)) zc++; }
      var db = 10 * Math.log10(sum / samples.length + 1e-12);
      // downsample into the ring
      for (i = 0; i < samples.length; i++) {
        dsAcc += samples[i]; dsCount++;
        if (dsCount === D) {
          if (ringN < N) ring[ringN++] = dsAcc / D;
          else { ring.copyWithin(0, 1); ring[N - 1] = dsAcc / D; }
          dsAcc = 0; dsCount = 0;
        }
      }
      var dt = samples.length / V.sr, t = V.t;
      V.t += dt;
      if (V.muted) { V.live.db = db; return; }
      // noise floor: quick to fall, slow to rise (pauses pull it back down)
      if (!V.calibrated) { calib.push(db); if (calib.length > 8) V.floor = MB.median(calib); }
      else if (db < V.floor) V.floor = V.floor * 0.85 + db * 0.15;
      else V.floor += 0.18 * dt;
      if (V.floor < -72) V.floor = -72;   // digital silence (no mic hiss) would make every voice look 90 dB loud
      var thr = Math.max(V.floor + 9, -68);
      var active = db > thr;
      var p = ringN >= N && db > thr - 3 ? yin() : { f0: 0, clar: 0 };
      var voiced = p.f0 > 0 && p.clar > 0.55 && active && zc / samples.length < 0.25;
      var f0 = voiced ? p.f0 : 0;
      var cen = voiced && (V.T.length % 3 === 0) ? centroid() : 0;
      V.T.push(t); V.DB.push(db); V.F0.push(f0); V.CL.push(voiced ? p.clar : 0); V.CEN.push(cen); V.ACT.push(active ? 1 : 0);
      var live = V.live;
      live.db = db; live.snr = active ? db - V.floor : 0; live.level = Math.max(0, Math.min(1, (db - V.floor) / 40));
      live.pitch = f0;

      // speaking / pauses (250 ms hangover so stop consonants don't split words)
      if (active) {
        if (!speaking) {
          speaking = true;
          if (firstSpeech == null) { firstSpeech = t; emit('start', t); }
          if (pauseStart != null) {
            var pd = t - pauseStart;
            if (pd >= 0.5) { pauses.push([pauseStart, pd]); live.pauses++; emit('pause', pauseStart, pd); }
            pauseStart = null;
          }
          if (!utt) utt = { t0: t, i0: V.T.length - 1 };
        }
        silentRun = 0; lastSpeech = t; live.silence = 0;
      } else {
        silentRun += dt;
        if (speaking && silentRun >= 0.25) {
          speaking = false; pauseStart = t - silentRun;
          endVoicedRun(t, true);
        }
        if (utt && silentRun >= 0.35) endPhrase(t - silentRun);
        live.silence = firstSpeech == null ? 0 : silentRun;
      }
      live.speaking = speaking;
      if (speaking) live.sincePause += dt; else if (silentRun >= 0.5) live.sincePause = 0;

      // syllables: prominent peaks of the speech-band loudness (5 ms blocks) while the voice is on
      for (i = 0; i < samples.length; i++) {
        var x = samples[i], y = bq.b0 * x + bq.b1 * bq.x1 + bq.b2 * bq.x2 - bq.a1 * bq.y1 - bq.a2 * bq.y2;
        bq.x2 = bq.x1; bq.x1 = x; bq.y2 = bq.y1; bq.y1 = y;
        subAcc += y * y;
        if (++subN === SB) { subBlock(10 * Math.log10(subAcc / SB + 1e-12), active); subAcc = 0; subN = 0; }
      }

      // voiced runs -> hesitation sounds
      if (voiced) {
        var st = 12 * Math.log2(f0 / 100);
        if (!run) run = { t0: t, b0: Math.max(0, V.ENV.length - Math.round(HOP / SB)), st: [], db: [], pauseBefore: (t - (lastSpeechEnd || -9)) > 0.2 };
        run.st.push(st); run.db.push(db); run.t1 = t;
      } else if (run) endVoicedRun(t, !active);

      // live pace (about once a second, syllables in the last 15 s) + melody
      var cut = t - 15;
      if (V.T.length % 40 === 0) {
        var spoke = firstSpeech == null ? 0 : Math.min(15, (lastSpeech || t) - Math.max(firstSpeech, t - 15)), blocks = Math.round(15 * V.sr / SB);
        live.wpm = spoke > 3 ? nuclei(V.ENV.length - blocks, V.ENV.length).length / 1.45 / (spoke / 60) : 0;
      }
      if (V.T.length % 10 === 0) {
        var sts = [], k = V.T.length - 1;
        while (k >= 0 && V.T[k] > cut) { if (V.F0[k] > 0) sts.push(12 * Math.log2(V.F0[k] / 100)); k--; }
        live.pitchVar = sts.length > 20 ? MB.std(sts) : live.pitchVar;
      }
    }
    var lastSpeechEnd = null;

    function subBlock(e, active) { V.ENV.push(e); V.ENVA.push(active ? 1 : 0); }

    /* Syllable nuclei (after de Jong & Wempe): peaks of the speech-band power, smoothed over 6 blocks (~30 ms),
       that stand at least 2.5 dB above the dips on both sides, while speech is present, at most one per 70 ms.
       Tested on synthetic speech at 110 / 151 / 217 words a minute: 118 / 147 / 185. Returns block indices. */
    var NUC = { box: 6, dip: 2.5, rel: 35, gap: 14 };
    function nuclei(from, to) {
      var E = V.ENV, A = V.ENVA, out = [];
      from = Math.max(0, from); to = Math.min(E.length, to);
      if (to - from < 10) return out;
      var S = new Float32Array(to - from), acc = 0, q = [], k, h = NUC.box >> 1, mx = -200;
      for (k = from; k < Math.min(E.length, to + h); k++) {
        var pw = Math.pow(10, E[k] / 10); q.push(pw); acc += pw; if (q.length > NUC.box) acc -= q.shift();
        var c = k - h;
        if (c >= from && c < to) { S[c - from] = 10 * Math.log10(acc / q.length + 1e-12); if (S[c - from] > mx) mx = S[c - from]; }
      }
      var last = -1e9, n = S.length;
      for (k = 1; k < n - 1; k++) {
        var v = S[k];
        if (!(v >= S[k - 1] && v > S[k + 1]) || v < mx - NUC.rel || !A[from + k]) continue;
        var l = k, lmin = v; while (l > 0 && k - l < 60) { l--; if (S[l] < lmin) lmin = S[l]; if (S[l] > v) break; }
        var r = k, rmin = v; while (r < n - 1 && r - k < 60) { r++; if (S[r] < rmin) rmin = S[r]; if (S[r] > v) break; }
        if (v - lmin < NUC.dip || v - rmin < NUC.dip || k - last < NUC.gap) continue;
        out.push(from + k); last = k;
      }
      return out;
    }
    function blockTime(b) { return (V.t0 || 0) + (b + 1) * SB / V.sr; }

    function endVoicedRun(t, silenceAfter) {
      if (!run) return;
      var r = run; run = null;
      lastSpeechEnd = r.t1 || t;
      var dur = (r.t1 || t) - r.t0 + HOP / V.sr;
      if (dur < 0.32 || r.st.length < 10) return;
      var sStd = MB.std(r.st), dStd = MB.std(r.db);
      var drift = Math.abs(MB.mean(r.st.slice(-4)) - MB.mean(r.st.slice(0, 4)));
      var flat = sStd < 0.75 && drift < 1.4 && dStd < 3.2 && nuclei(r.b0, V.ENV.length).length <= 1;
      if (flat && (dur >= 0.5 || r.pauseBefore || silenceAfter)) {
        fillers++; V.live.fillers++;
        emit('filler', r.t0, Math.round(dur * 10) / 10);
      }
    }

    function endPhrase(tEnd) {
      var u = utt; utt = null;
      if (!u || tEnd - u.t0 < 1.0) return;
      var idx = [], i;
      for (i = u.i0; i < V.T.length && V.T[i] <= tEnd; i++) if (V.F0[i] > 0) idx.push(i);
      if (idx.length < 12) return;
      phrases++;
      var sts = idx.map(function (k) { return 12 * Math.log2(V.F0[k] / 100); });
      var med = MB.median(sts);
      var lastT = V.T[idx[idx.length - 1]], tail = [], tailDb = [], allDb = [];
      idx.forEach(function (k, n) { if (V.T[k] >= lastT - 0.3) { tail.push(sts[n]); tailDb.push(V.DB[k]); } allDb.push(V.DB[k]); });
      var rise = MB.median(tail) - med, early = MB.median(tail.slice(0, Math.max(1, tail.length >> 1))), late = MB.median(tail.slice(tail.length >> 1));
      if (rise >= 2.5 && late - early > 0.3) { uptalk++; emit('uptalk', lastT, Math.round(rise * 10) / 10); }
      else if (MB.median(allDb) - MB.mean(tailDb) >= 8) { trail++; emit('trail', lastT, null); }
    }

    function emit(kind, t, val) {
      V.events.push([Math.round(t * 100) / 100, kind, val == null ? null : val]);
      if (V.onEvent) try { V.onEvent(kind, t, val); } catch (e) { console.error(e); }
    }

    /* ---- inputs */
    V.feed = function (data, sampleRate) {   // offline: Float32Array of mono samples (tests, uploaded audio)
      if (sampleRate && sampleRate !== V.sr) setRate(sampleRate);
      for (var i = 0; i + HOP <= data.length; i += HOP) frame(data.subarray(i, i + HOP));
    };
    V.start = function (mediaStream) {
      stream = mediaStream;
      var AC = window.AudioContext || window.webkitAudioContext;
      ctx = new AC();
      setRate(ctx.sampleRate);
      src = ctx.createMediaStreamSource(stream);
      hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 70;
      analyser = ctx.createAnalyser(); analyser.fftSize = 1024; analyser.smoothingTimeConstant = 0;
      freqBuf = new Float32Array(analyser.frequencyBinCount);
      node = ctx.createScriptProcessor(HOP, 1, 1);
      zero = ctx.createGain(); zero.gain.value = 0;
      src.connect(hp); hp.connect(analyser); hp.connect(node); node.connect(zero); zero.connect(ctx.destination);
      node.onaudioprocess = function (e) { if (!V.paused) frame(e.inputBuffer.getChannelData(0)); };
      if (ctx.state === 'suspended') ctx.resume();
      return V;
    };
    V.stop = function () {
      try { if (node) { node.onaudioprocess = null; node.disconnect(); } if (src) src.disconnect(); } catch (e) {}
      try { if (ctx) ctx.close(); } catch (e) {}
      node = src = ctx = null;
    };
    V.calibrate = function () { if (calib.length > 8) V.floor = Math.max(-72, MB.median(calib)); V.calibrated = true; };
    /* Start counting from now (after the mic check): forget frames and events so far, keep the noise floor. */
    V.reset = function () {
      V.T = []; V.DB = []; V.F0 = []; V.CL = []; V.CEN = []; V.ACT = []; V.ENV = []; V.ENVA = []; V.events = [];
      V.t0 = V.t; run = null; utt = null; phrases = uptalk = trail = fillers = 0; pauses = []; marks = [];
      speaking = false; firstSpeech = lastSpeech = pauseStart = null; silentRun = 0;
      var l = V.live; l.fillers = 0; l.pauses = 0; l.sincePause = 0; l.wpm = 0; l.silence = 0;
      V.calibrated = true;
    };
    V.mark = function (kind, val) { var t = V.t; marks.push([t, kind]); V.events.push([Math.round(t * 100) / 100, kind, val == null ? null : val]); };
    V.now = function () { return V.t - (V.t0 || 0); };

    /* ---- the numbers the server scores */
    V.summary = function (extra) {
      var t0 = V.t0 || 0, secs = Math.max(0, V.t - t0);
      var m = { secs: secs };
      if (firstSpeech == null) { m.speak_secs = 0; return Object.assign(m, extra || {}); }
      var span = Math.max(1, (lastSpeech || V.t) - firstSpeech);
      var syl = nuclei(0, V.ENV.length).map(blockTime);
      var hop = HOP / V.sr, speak = 0, i;
      for (i = 0; i < V.ACT.length; i++) speak += V.ACT[i] * hop;
      m.span_secs = span; m.speak_secs = Math.min(span, speak); m.start_delay = Math.max(0, firstSpeech - t0);
      m.syllables = syl.length; m.art_rate = syl.length / Math.max(1, speak);
      // pace windows (10 s) where at least 4 s were spoken
      var wins = [], w0 = firstSpeech;
      for (var ws = firstSpeech; ws + 10 <= lastSpeech + 0.01; ws += 10) {
        var n = 0; syl.forEach(function (s) { if (s >= ws && s < ws + 10) n++; });
        var sp = 0; for (i = 0; i < V.T.length; i++) if (V.T[i] >= ws && V.T[i] < ws + 10) sp += V.ACT[i] * hop;
        if (sp >= 4) wins.push(n / 1.45 * 6);
      }
      if (wins.length >= 3) {
        m.pace_cv = MB.std(wins) / Math.max(1, MB.mean(wins));
        var third = Math.max(1, Math.floor(wins.length / 3));
        m.rush = MB.mean(wins.slice(-third)) / Math.max(1, MB.mean(wins.slice(0, third)));
      }
      var inSpan = pauses.filter(function (p) { return p[0] >= firstSpeech && p[0] < lastSpeech; });
      m.pauses = inSpan.length;
      m.pause_long = inSpan.filter(function (p) { return p[1] >= 3; }).length;
      m.pause_mean = inSpan.length ? MB.mean(inSpan.map(function (p) { return Math.min(p[1], 6); })) : 0;
      m.pause_longest = inSpan.length ? Math.max.apply(null, inSpan.map(function (p) { return p[1]; })) : 0;
      m.pause_card = inSpan.filter(function (p) {
        return p[1] >= 3 && marks.some(function (k) { return k[1] === 'card' && k[0] <= p[0] + p[1] && k[0] >= p[0] - 2; });
      }).length;
      m.fillers = fillers;
      // loudness over the floor, in half-second windows of speech
      var winDb = [], acc = [], wEnd = null;
      for (i = 0; i < V.T.length; i++) {
        if (wEnd == null || V.T[i] >= wEnd) { if (acc.length >= 8) winDb.push(MB.mean(acc)); acc = []; wEnd = V.T[i] + 0.5; }
        if (V.ACT[i]) acc.push(V.DB[i]);
      }
      if (winDb.length >= 4) {
        m.vol_snr = MB.median(winDb) - V.floor;
        m.vol_var = MB.std(winDb);
        m.quiet_share = winDb.filter(function (d) { return d - V.floor < 12; }).length / winDb.length;
      }
      // pitch: median, spread in semitones (octave slips dropped), flat 10-s stretches, micro-wobble (jitter), loudness wobble (shimmer)
      var f0s = [], cls = [], cens = [];
      for (i = 0; i < V.F0.length; i++) { if (V.F0[i] > 0) { f0s.push(V.F0[i]); cls.push(V.CL[i]); } if (V.CEN[i] > 0) cens.push(V.CEN[i]); }
      if (f0s.length >= 30) {
        var med = MB.median(f0s);
        var sts = f0s.filter(function (f) { return f > med / 1.9 && f < med * 1.9; }).map(function (f) { return 12 * Math.log2(f / med); });
        m.pitch_med = med; m.pitch_std = MB.std(sts); m.pitch_range = MB.pct(sts, 0.9) - MB.pct(sts, 0.1);
        var mono = 0, tot = 0;
        for (var ws2 = firstSpeech; ws2 + 10 <= lastSpeech + 0.01; ws2 += 10) {
          var wst = [];
          for (i = 0; i < V.T.length; i++) if (V.T[i] >= ws2 && V.T[i] < ws2 + 10 && V.F0[i] > med / 1.9 && V.F0[i] < med * 1.9) wst.push(12 * Math.log2(V.F0[i] / med));
          if (wst.length >= 30) { tot++; if (MB.std(wst) < 1.5) mono++; }
        }
        m.monotone_share = tot ? mono / tot : 0;
        var dj = [], ds = [];
        for (i = 1; i < V.F0.length; i++) {
          if (V.F0[i] > 0 && V.F0[i - 1] > 0) {
            var d = Math.abs(12 * Math.log2(V.F0[i] / V.F0[i - 1]));
            if (d < 2) dj.push(d);
            ds.push(Math.abs(V.DB[i] - V.DB[i - 1]));
          }
        }
        m.jitter = MB.median(dj); m.shimmer = MB.median(ds); m.clarity = MB.mean(cls);
        if (cens.length) m.centroid = MB.median(cens);
      }
      m.phrases = phrases; m.uptalk = uptalk; m.trail = trail;
      return Object.assign(m, extra || {});
    };

    /* ---- compact timeline for the report: loudness over floor, pitch, syllables a second, every `step` s */
    V.timeline = function (gaze) {
      var t0 = V.t0 || 0, secs = Math.max(0, V.t - t0);
      var step = secs <= 600 ? 0.5 : secs <= 1800 ? 1 : 2;
      var n = Math.ceil(secs / step), vol = [], pitch = [], rate = [], i = 0, k, syl = nuclei(0, V.ENV.length).map(blockTime);
      for (k = 0; k < n; k++) {
        var a = t0 + k * step, b = a + step, dbs = [], fs2 = [];
        while (i < V.T.length && V.T[i] < b) { if (V.T[i] >= a) { if (V.ACT[i]) dbs.push(V.DB[i]); if (V.F0[i] > 0) fs2.push(V.F0[i]); } i++; }
        vol.push(dbs.length ? Math.round((MB.mean(dbs) - V.floor) * 10) / 10 : 0);
        pitch.push(fs2.length >= 3 ? Math.round(MB.median(fs2)) : 0);
        var c = 0; syl.forEach(function (s) { if (s >= a && s < b) c++; });
        rate.push(Math.round(c / step * 10) / 10);
      }
      var ev = V.events.map(function (e) { return [Math.round((e[0] - t0) * 100) / 100, e[1], e[2]]; }).filter(function (e) { return e[0] >= 0 && e[1] !== 'start'; });
      var out = { step: step, vol: vol, pitch: pitch, rate: rate, events: ev };
      if (gaze && gaze.length) {  // gaze samples [t, code] -> one code per step (most common)
        var g = [], j = 0;
        for (k = 0; k < n; k++) {
          var cnt = [0, 0, 0, 0, 0, 0], end = (k + 1) * step;
          while (j < gaze.length && gaze[j][0] < end) { cnt[gaze[j][1]]++; j++; }
          var best = 0; for (var q = 1; q < 6; q++) if (cnt[q] > cnt[best]) best = q;
          g.push(best);
        }
        out.gaze = g;
      }
      return out;
    };
    return V;
  };

  /* ------------------------------------------------------------------ optional transcript (browser speech service) */
  var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  MB.Transcript = {
    supported: !!SR,
    start: function (fillerList) {
      if (!SR) return null;
      var words = fillerList.split(',').map(function (w) { return w.trim().toLowerCase(); }).filter(Boolean)
        .sort(function (a, b) { return b.length - a.length; });
      var T = { text: '', words: 0, fillers: 0, byWord: {}, alive: true, rec: null };
      function count(chunk) {
        var s = ' ' + chunk.toLowerCase().replace(/[^a-z' ]+/g, ' ').replace(/\s+/g, ' ') + ' ';
        T.words += s.trim() ? s.trim().split(' ').length : 0;
        words.forEach(function (w) {
          var re = new RegExp(' ' + w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?= )', 'g'), n = (s.match(re) || []).length;
          if (n) { T.fillers += n; T.byWord[w] = (T.byWord[w] || 0) + n; s = s.replace(re, ' '); }
        });
      }
      function go() {
        try {
          var r = new SR(); T.rec = r;
          r.continuous = true; r.interimResults = false; r.lang = navigator.language || 'en-US';
          r.onresult = function (e) {
            for (var i = e.resultIndex; i < e.results.length; i++) if (e.results[i].isFinal) { var c = e.results[i][0].transcript; T.text += c + ' '; count(c); }
          };
          r.onend = function () { if (T.alive) setTimeout(go, 150); };
          r.onerror = function (e) { if (e.error === 'not-allowed' || e.error === 'service-not-allowed') T.alive = false; };
          r.start();
        } catch (e) { T.alive = false; }
      }
      go();
      T.stop = function () { T.alive = false; try { T.rec && T.rec.stop(); } catch (e) {} };
      return T;
    }
  };

  /* ------------------------------------------------------------------ recordings kept on this device (IndexedDB) */
  MB.Tapes = (function () {
    var dbP = null, KEEP = 12;
    function db() {
      if (dbP) return dbP;
      dbP = new Promise(function (res, rej) {
        try {
          var r = indexedDB.open('mrbigstage-tapes', 1);
          r.onupgradeneeded = function () { r.result.createObjectStore('tapes', { keyPath: 'id' }); };
          r.onsuccess = function () { res(r.result); };
          r.onerror = function () { rej(r.error); };
        } catch (e) { rej(e); }
      });
      return dbP;
    }
    function tx(mode, fn) {
      return db().then(function (d) {
        return new Promise(function (res, rej) {
          var t = d.transaction('tapes', mode), st = t.objectStore('tapes'), out = fn(st);
          t.oncomplete = function () { res(out && out.result !== undefined ? out.result : out); };
          t.onerror = function () { rej(t.error); };
        });
      });
    }
    return {
      put: function (id, blob, meta) {
        return tx('readwrite', function (st) { st.put({ id: id, blob: blob, meta: meta || {}, at: Date.now() }); })
          .then(function () { return tx('readonly', function (st) { return st.getAll(); }); })
          .then(function (all) {
            all.sort(function (a, b) { return b.at - a.at; });
            var old = all.slice(KEEP);
            if (old.length) return tx('readwrite', function (st) { old.forEach(function (o) { st.delete(o.id); }); });
          }).catch(function () {});
      },
      get: function (id) { return tx('readonly', function (st) { return st.get(id); }).catch(function () { return null; }); },
      del: function (id) { return tx('readwrite', function (st) { st.delete(id); }).catch(function () {}); },
      clear: function () { return tx('readwrite', function (st) { st.clear(); }).catch(function () {}); },
      count: function () { return tx('readonly', function (st) { return st.count(); }).catch(function () { return 0; }); },
      rename: function (from, to) {
        return MB.Tapes.get(from).then(function (r) { if (r) return MB.Tapes.put(to, r.blob, r.meta).then(function () { return MB.Tapes.del(from); }); });
      }
    };
  })();

  /* ------------------------------------------------------------------ charts (SVG) */
  MB.ring = function (score, size, label) {
    size = size || 140;
    var r = size / 2 - 9, c = 2 * Math.PI * r, v = score == null ? 0 : Math.max(0, Math.min(100, score));
    return '<svg class="mb-ring ' + MB.scoreClass(score) + '" width="' + size + '" height="' + size + '" viewBox="0 0 ' + size + ' ' + size + '" role="img" aria-label="Score ' + (score == null ? 'none' : score) + ' out of 100">' +
      '<circle class="trk" cx="' + size / 2 + '" cy="' + size / 2 + '" r="' + r + '" fill="none" stroke-width="10"/>' +
      '<circle class="val" cx="' + size / 2 + '" cy="' + size / 2 + '" r="' + r + '" fill="none" stroke-width="10" stroke-linecap="round" ' +
      'stroke-dasharray="' + c.toFixed(1) + '" stroke-dashoffset="' + (c * (1 - v / 100)).toFixed(1) + '" transform="rotate(-90 ' + size / 2 + ' ' + size / 2 + ')"/>' +
      '<text x="50%" y="' + (label ? '50%' : '54%') + '" text-anchor="middle" dominant-baseline="middle" font-size="' + Math.round(size * 0.3) + '">' + (score == null ? '–' : Math.round(score)) + '</text>' +
      (label ? '<text class="lbl" x="50%" y="' + (size * 0.71) + '" text-anchor="middle" font-size="' + Math.max(9, Math.round(size * 0.075)) + '">' + esc(label) + '</text>' : '') + '</svg>';
  };
  MB.spark = function (vals, w, h, color) {
    w = w || 160; h = h || 44;
    vals = (vals || []).filter(function (v) { return v != null; });
    if (vals.length < 2) return '<svg class="mb-spark" width="' + w + '" height="' + h + '"></svg>';
    var lo = Math.min.apply(null, vals), hi = Math.max.apply(null, vals);
    if (hi - lo < 10) { lo -= 5; hi += 5; }
    var pts = vals.map(function (v, i) { return [(i / (vals.length - 1)) * (w - 8) + 4, h - 5 - (v - lo) / (hi - lo) * (h - 10)]; });
    var d = pts.map(function (p, i) { return (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1); }).join('');
    var last = pts[pts.length - 1];
    return '<svg class="mb-spark" width="' + w + '" height="' + h + '" viewBox="0 0 ' + w + ' ' + h + '" aria-hidden="true">' +
      '<path d="' + d + ' L' + last[0] + ' ' + h + ' L4 ' + h + 'Z" fill="' + (color || 'var(--c-brand)') + '" opacity=".1"/>' +
      '<path d="' + d + '" fill="none" stroke="' + (color || 'var(--c-brand)') + '" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round"/>' +
      '<circle cx="' + last[0] + '" cy="' + last[1] + '" r="4" fill="' + (color || 'var(--c-brand)') + '"/></svg>';
  };
  /* rows: [{key,label,icon,score,mark}] -> horizontal bars (mark = a previous value, drawn as a tick) */
  MB.bars = function (rows) {
    return '<div class="mb-bars">' + rows.map(function (r) {
      var na = r.score == null;
      return '<div class="mb-bar' + (na ? ' na' : '') + '" title="' + esc(r.title || '') + '"><span>' + UI.icon(r.icon || 'sparkle') + '<span>' + esc(r.label) + '</span></span>' +
        '<span class="tr">' + (na ? '' : '<i class="' + MB.scoreClass(r.score) + '" style="width:' + r.score + '%"></i>') +
        (r.mark != null ? '<b style="left:' + r.mark + '%"></b>' : '') + '</span><b>' + (na ? '–' : r.score) + '</b></div>';
    }).join('') + '</div>';
  };
  /* The report's timeline: loudness band, pitch line, pace line, pauses, hesitations, cards, gaze strip */
  MB.timeline = function (tl, opts) {
    opts = opts || {};
    var W = 1000, H = 230, step = tl.step || 1, vol = tl.vol || [], n = vol.length;
    if (!n) return '<p class="muted">No timeline for this session.</p>';
    var secs = n * step, X = function (t) { return 34 + (t / secs) * (W - 44); };
    var vy = function (v) { return 118 - Math.max(0, Math.min(45, v)) / 45 * 92; };
    var pv = (tl.pitch || []).filter(function (p) { return p > 0; }), pmed = MB.median(pv) || 150;
    var py = function (p) { return 118 - Math.max(-9, Math.min(9, 12 * Math.log2(p / pmed))) / 9 * 46 - 46; };
    var o = '<svg class="mb-tl" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Timeline of your talk">';
    o += '<rect x="34" y="20" width="' + (W - 44) + '" height="100" rx="6" fill="var(--c-surface-2)"/>';
    var d = 'M' + X(0) + ' 118';
    vol.forEach(function (v, i) { d += ' L' + X(i * step + step / 2).toFixed(1) + ' ' + vy(v).toFixed(1); });
    d += ' L' + X(secs) + ' 118Z';
    o += '<path d="' + d + '" fill="var(--c-accent)" opacity=".35"/>';
    var pd = '', pen = false;
    (tl.pitch || []).forEach(function (p, i) {
      if (p > 0) { pd += (pen ? ' L' : ' M') + X(i * step + step / 2).toFixed(1) + ' ' + py(p).toFixed(1); pen = true; } else pen = false;
    });
    if (pd) o += '<path d="' + pd + '" fill="none" stroke="var(--c-brand)" stroke-width="1.8" stroke-linejoin="round"/>';
    // pace (3-s rolling syllables/s -> wpm), drawn below
    var rate = tl.rate || [], win = Math.max(1, Math.round(4 / step)), rd = '';
    for (var i = 0; i < rate.length; i++) {
      var a = Math.max(0, i - win), s = 0; for (var j = a; j <= i; j++) s += rate[j];
      var wpm = s / (i - a + 1) / 1.45 * 60;
      var y = 200 - Math.max(0, Math.min(260, wpm)) / 260 * 55;
      rd += (i ? ' L' : 'M') + X(i * step + step / 2).toFixed(1) + ' ' + y.toFixed(1);
    }
    o += '<rect x="34" y="140" width="' + (W - 44) + '" height="62" rx="6" fill="var(--c-surface-2)"/>';
    o += '<rect x="34" y="' + (200 - 165 / 260 * 55).toFixed(1) + '" width="' + (W - 44) + '" height="' + ((165 - 128) / 260 * 55).toFixed(1) + '" fill="var(--c-good)" opacity=".16"/>';
    if (rd) o += '<path d="' + rd + '" fill="none" stroke="var(--c-ink)" stroke-width="1.6" opacity=".8"/>';
    // events
    (tl.events || []).forEach(function (e) {
      var x = X(e[0]).toFixed(1);
      if (e[1] === 'pause') o += '<rect x="' + x + '" y="20" width="' + Math.max(1.5, (e[2] || 0.5) / secs * (W - 44)).toFixed(1) + '" height="100" fill="var(--c-good)" opacity="' + ((e[2] || 0) >= 3 ? '.5' : '.22') + '"/>';
      else if (e[1] === 'filler') o += '<circle cx="' + x + '" cy="12" r="4.5" fill="var(--c-brand)"><title>Hesitation at ' + MB.fmtSecs(e[0]) + '</title></circle>';
      else if (e[1] === 'uptalk') o += '<path d="M' + x + ' 136 l-4 6 h8z" fill="var(--c-accent)"><title>Rising ending</title></path>';
      else if (e[1] === 'trail') o += '<path d="M' + x + ' 142 l-4 -6 h8z" fill="var(--c-muted)"><title>Trailing off</title></path>';
      else if (e[1] === 'card') o += '<line x1="' + x + '" x2="' + x + '" y1="20" y2="202" stroke="var(--c-ink)" stroke-dasharray="2 3" opacity=".35"/>';
      else if (e[1] === 'distract') o += '<text x="' + x + '" y="134" text-anchor="middle">⚡</text>';
      else if (e[1] === 'q') o += '<text x="' + x + '" y="134" text-anchor="middle" fill="var(--c-brand)">?</text>';
    });
    // gaze strip
    if (tl.gaze && tl.gaze.length) {
      var GC = ['transparent', '#5b8def', 'var(--c-good)', '#b46bdf', 'var(--c-faint)', 'var(--c-brand)'];
      tl.gaze.forEach(function (g, i) { if (g) o += '<rect x="' + X(i * step).toFixed(1) + '" y="211" width="' + ((W - 44) / tl.gaze.length + 0.6).toFixed(1) + '" height="9" fill="' + GC[g] + '"/>'; });
      o += '<text x="0" y="219">eyes</text>';
    }
    o += '<text x="0" y="74">voice</text><text x="0" y="176">pace</text>';
    var ticks = secs > 600 ? 120 : secs > 240 ? 60 : secs > 90 ? 30 : 10;
    for (var t = 0; t <= secs; t += ticks) o += '<text x="' + X(t).toFixed(1) + '" y="' + H + '" text-anchor="middle">' + MB.fmtSecs(t) + '</text>';
    if (opts.cursor) o += '<line class="mb-tl-cursor" x1="34" x2="34" y1="16" y2="222" stroke="var(--c-brand)" stroke-width="2"/>';
    return o + '</svg>';
  };
  MB.timelineLegend = function (hasGaze) {
    return '<div class="mb-legend"><span><i style="background:var(--c-accent);opacity:.6"></i>Loudness</span><span><i style="background:var(--c-brand)"></i>Pitch (melody)</span>' +
      '<span><i style="background:var(--c-ink)"></i>Pace (green band = 130–165 wpm)</span><span><i style="background:var(--c-good);opacity:.5"></i>Pauses</span>' +
      '<span><i style="background:var(--c-brand);border-radius:50%"></i>Hesitation</span><span>▲ rising ending</span><span>┆ card</span>' +
      (hasGaze ? '<span><i style="background:#5b8def"></i>Left</span><span><i style="background:var(--c-good)"></i>Centre</span><span><i style="background:#b46bdf"></i>Right</span><span><i style="background:var(--c-faint)"></i>Notes</span><span><i style="background:var(--c-brand)"></i>Back turned</span>' : '') + '</div>';
  };

  /* ------------------------------------------------------------------ "Go on stage" picker */
  MB.pickStage = function () {
    return Promise.all([MB.content(), UI.me ? UI.api('get_talks') : Promise.resolve({ talks: [] })]).then(function (r) {
      var c = r[0], talks = r[1].talks;
      var btn = function (go, icon, title, sub) { return '<button data-go="' + esc(go) + '" data-close>' + UI.icon(icon) + '<span><b>' + esc(title) + '</b><small>' + esc(sub) + '</small></span></button>'; };
      UI.modal('<h2>Go on stage</h2><p class="muted">Pick what you\'ll say. You choose the room, the crowd and your notes next.</p><div class="mb-pick">' +
        (talks.length ? '<h4>Your talks</h4>' + talks.map(function (t) { return btn('stage/' + t.id, 'mic', t.title, t.target_min + ' min · ' + MB.venueName(t.venue) + (t.practiced ? ' · practised ' + UI.plural(t.practiced, 'time') : '')); }).join('') : '') +
        '<h4>Or just talk</h4>' + btn('stage/drill:topics', 'dice', 'Surprise topic', 'Two minutes on a random question') +
        btn('stage/free', 'sparkle', 'Free talk', 'No cards, no topic, just the room') +
        (UI.me ? btn('talks/new', 'plus', 'Write a new talk', 'Start from a template or your own script') : btn('stage/sample', 'play', 'Try the sample talk', 'Six short cards, two minutes')) + '</div>');
    });
  };
  document.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('[data-quickstart]');
    if (b) { e.preventDefault(); MB.pickStage(); }
  });
})();

/* ===== _venue.html ===== */
(function () {
  'use strict';
  var MB = window.MB = window.MB || {};

  /* ------------------------------------------------------------------ geometry helpers */
  function merge(T, parts) {   // [[geometry, x, y, z, rx, ry, rz], ...] -> one non-indexed BufferGeometry
    var pos = [], nor = [];
    parts.forEach(function (p) {
      var g = p[0].index ? p[0].toNonIndexed() : p[0].clone();
      var m = new T.Matrix4().compose(new T.Vector3(p[1] || 0, p[2] || 0, p[3] || 0),
        new T.Quaternion().setFromEuler(new T.Euler(p[4] || 0, p[5] || 0, p[6] || 0)), new T.Vector3(1, 1, 1));
      g.applyMatrix4(m);
      pos.push.apply(pos, g.attributes.position.array); nor.push.apply(nor, g.attributes.normal.array);
    });
    var out = new T.BufferGeometry();
    out.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
    out.setAttribute('normal', new T.Float32BufferAttribute(nor, 3));
    return out;
  }
  // write a yaw/pitch rotation + translation + scale straight into an instanced matrix array (fast)
  function put(arr, i, x, y, z, yaw, pitch, sx, sy, sz) {
    var cy = Math.cos(yaw), sY = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch), o = i * 16;
    arr[o] = cy * sx; arr[o + 1] = 0; arr[o + 2] = -sY * sx; arr[o + 3] = 0;
    arr[o + 4] = sY * sp * sy; arr[o + 5] = cp * sy; arr[o + 6] = cy * sp * sy; arr[o + 7] = 0;
    arr[o + 8] = sY * cp * sz; arr[o + 9] = -sp * sz; arr[o + 10] = cy * cp * sz; arr[o + 11] = 0;
    arr[o + 12] = x; arr[o + 13] = y; arr[o + 14] = z; arr[o + 15] = 1;
  }
  function hide(arr, i) { var o = i * 16; for (var k = 0; k < 16; k++) arr[o + k] = 0; }
  // rotate local offset (lx,ly,lz) by yaw then pitch-frame (body lean) and add to base
  function off(out, bx, by, bz, yaw, pitch, lx, ly, lz) {
    var cp = Math.cos(pitch), sp = Math.sin(pitch);
    var y1 = ly * cp - lz * sp, z1 = ly * sp + lz * cp;
    var cy = Math.cos(yaw), sY = Math.sin(yaw);
    out[0] = bx + lx * cy + z1 * sY; out[1] = by + y1; out[2] = bz - lx * sY + z1 * cy;
    return out;
  }
  function rnd(seed) { var s = seed >>> 0 || 1; return function () { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return ((s >>> 0) % 100000) / 100000; }; }

  MB.canvasTex = function (T, w, h) {
    var c = document.createElement('canvas'); c.width = w; c.height = h;
    var tex = new T.CanvasTexture(c); tex.colorSpace = T.SRGBColorSpace; tex.anisotropy = 4;
    return { canvas: c, ctx: c.getContext('2d'), tex: tex };
  };
  MB.wrapText = function (ctx, text, maxW) {
    var words = String(text || '').split(/\s+/), lines = [], line = '';
    words.forEach(function (w) { var t = line ? line + ' ' + w : w; if (ctx.measureText(t).width > maxW && line) { lines.push(line); line = w; } else line = t; });
    if (line) lines.push(line);
    return lines;
  };

  /* ------------------------------------------------------------------ palettes */
  var SKIN = ['#f6d7c3', '#eac0a2', '#d9a27c', '#c68863', '#a86b47', '#8a5434', '#6b3f26', '#4e2c1a', '#f1c9a8', '#b97a55'];
  var HAIR = ['#1b1512', '#2b1d14', '#4a3020', '#6d4a2b', '#a87a46', '#d8b878', '#8c8c8c', '#d9d4cc', '#3a2418', '#7a2f1e', '#111111'];
  var CLOTHES = {
    theatre: ['#2b2f3a', '#7a1f1f', '#1f3d5a', '#3d3d3d', '#c9b79c', '#5a3d6b', '#22543d', '#8a6d3b', '#e8e2d6', '#3b5c8c', '#b5523b', '#191919'],
    arena: ['#ff3b6b', '#2bd1ff', '#ffd23b', '#7a5cff', '#1a1a1a', '#f2f2f2', '#2ee59d', '#ff8a3d', '#3b3b8c', '#c42b2b'],
    lecture: ['#5a6b7a', '#3b5c3b', '#8c3b3b', '#d9c9a8', '#2b2b2b', '#4a6fa5', '#a5844a', '#6b4a8c', '#e0e0e0', '#3b8c8c'],
    wedding: ['#121212', '#1e2433', '#e8dccb', '#6b1e3b', '#2f4a3a', '#c9a0a0', '#3a3a5a', '#d8b4a0', '#0f0f0f', '#5a2a4a'],
    townhall: ['#6b5a45', '#3b4a5c', '#8c6b3b', '#4a5c3b', '#a53b2b', '#d9cbb0', '#2b3b4a', '#7a7a7a', '#5c3b2b', '#3b6b8c'],
    boardroom: ['#1e2433', '#2b2f3a', '#3a3f4a', '#151a24', '#4a4f5a', '#e6e6e6', '#22324a', '#3d2b2b'],
    interview: ['#1e2433', '#2b2f3a', '#4a3a2b', '#151a24', '#3a4a5a']
  };
  var PANTS = ['#1e2026', '#2b3040', '#3a3226', '#1a1a1a', '#4a4a52', '#26324a'];

  /* ------------------------------------------------------------------ layouts: seats [{x, y, z, yaw, row, aisle, stand}] */
  function arcRows(o) {
    var seats = [];
    for (var r = 0; r < o.rows; r++) {
      var R = o.r0 + r * o.dr, y = o.y0 + r * o.dy, n = Math.floor(R * 2 * o.span / o.gap);
      for (var k = 0; k < n; k++) {
        var th = -o.span + (k + 0.5) * (2 * o.span / n);
        var aisle = (o.aisles || []).some(function (a) { return Math.abs(R * (th - a)) < 0.55; });
        if (aisle) continue;
        var x = R * Math.sin(th), z = -R * Math.cos(th) + (o.zc || 0);
        seats.push({ x: x, y: y, z: z, yaw: Math.atan2(-x, -z), row: r, th: th });
      }
    }
    return seats;
  }
  var LAYOUT = {
    redcircle: function () {
      return { seats: arcRows({ rows: 20, r0: 7.2, dr: 0.95, y0: -1.0, dy: 0.42, span: 1.3, gap: 0.6, aisles: [-0.45, 0.45] }), span: 1.3 };
    },
    arena: function (R) {
      var seats = [];
      for (var i = 0; i < 1300; i++) { var x = (R() - 0.5) * 30, z = -6.5 - R() * 22; seats.push({ x: x, y: -1.6, z: z, yaw: Math.atan2(-x, -z), row: Math.floor((-z - 6) / 2), stand: true }); }
      return { seats: seats.concat(arcRows({ rows: 24, r0: 33, dr: 1.05, y0: -0.4, dy: 0.62, span: 1.65, gap: 0.62 })), span: 1.6 };
    },
    lecture: function () {
      return { seats: arcRows({ rows: 9, r0: 4.6, dr: 1.15, y0: 0, dy: 0.36, span: 0.62, gap: 0.62, aisles: [0] }), span: 0.62 };
    },
    townhall: function () {
      var seats = [];
      for (var r = 0; r < 18; r++) for (var c = 0; c < 22; c++) {
        var x = (c - 10.5) * 0.62 + (c >= 11 ? 0.7 : -0.7), z = -3.6 - r * 1.0;
        seats.push({ x: x, y: -0.6, z: z, yaw: Math.atan2(-x * 0.3, -z), row: r });
      }
      return { seats: seats, span: 0.75 };
    },
    wedding: function (R) {
      var seats = [], tables = [];
      seats.push({ x: -0.4, y: 0, z: -3.2, yaw: 0, row: 0 }, { x: 0.4, y: 0, z: -3.2, yaw: 0, row: 0 });
      tables.push({ x: 0, z: -3.6, r: 0.55, couple: true });
      for (var row = 0; row < 3; row++) for (var c = 0; c < 5; c++) {
        var tx = (c - 2) * 4.0 + (row % 2 ? 1.2 : 0), tz = -6.5 - row * 3.8;
        tables.push({ x: tx, z: tz, r: 0.85 });
        for (var k = 0; k < 9; k++) {
          var a = k / 9 * Math.PI * 2 + 0.2, x = tx + Math.sin(a) * 1.25, z = tz + Math.cos(a) * 1.25;
          var face = Math.atan2(tx - x, tz - z), toSp = Math.atan2(-x, -z), d = Math.atan2(Math.sin(toSp - face), Math.cos(toSp - face));
          seats.push({ x: x, y: 0, z: z, yaw: face + d * 0.75, row: row + 1 });
        }
      }
      return { seats: seats, tables: tables, span: 1.05 };
    },
    boardroom: function () {
      var seats = [];
      for (var i = 0; i < 6; i++) {
        seats.push({ x: -1.25, y: 0, z: -1.9 - i * 1.0, yaw: Math.PI / 2 - 0.45, row: i });
        seats.push({ x: 1.25, y: 0, z: -1.9 - i * 1.0, yaw: -Math.PI / 2 + 0.45, row: i });
      }
      seats.push({ x: 0, y: 0, z: -8.2, yaw: 0, row: 6 });
      return { seats: seats, span: 0.75 };
    },
    interview: function () {
      return { seats: [{ x: -0.85, y: 0, z: -2.5, yaw: 0.3, row: 0 }, { x: 0, y: 0, z: -2.6, yaw: 0, row: 0 }, { x: 0.85, y: 0, z: -2.5, yaw: -0.3, row: 0 },
        { x: 1.7, y: 0, z: -2.3, yaw: -0.55, row: 0 }], span: 0.6 };
    }
  };
  var LOOK = {   // background, fog, floor, walls, light levels, monitor placement, eye height for the flat camera
    redcircle: { bg: '#050506', fog: [20, 48], floor: '#151214', wall: '#0e0e11', amb: 0.3, key: 2.6, aud: 0.75, mon: [0, 0.17, -1.75, 'floor'], eye: 1.68 },
    arena: { bg: '#04040a', fog: [30, 90], floor: '#0c0c14', wall: '#08080e', amb: 0.25, key: 3.0, aud: 0.6, mon: [0, 0.17, -1.9, 'floor'], eye: 1.7 },
    lecture: { bg: '#d9cdb8', fog: [14, 40], floor: '#6b4a2e', wall: '#e8ddc7', amb: 0.75, key: 1.1, aud: 0.9, mon: [0.9, 1.0, -0.5, 'lectern'], eye: 1.66 },
    townhall: { bg: '#2a2016', fog: [16, 45], floor: '#8a6034', wall: '#e9dcc2', amb: 0.6, key: 1.6, aud: 0.9, mon: [0, 1.02, -0.55, 'lectern'], eye: 1.66 },
    wedding: { bg: '#1a1218', fog: [14, 40], floor: '#3a2a22', wall: '#2b2026', amb: 0.45, key: 1.4, aud: 0.75, mon: [0, 0.95, -1.15, 'stand'], eye: 1.66 },
    boardroom: { bg: '#1a2230', fog: [14, 40], floor: '#2a2f38', wall: '#c9ccd2', amb: 0.7, key: 0.9, aud: 0.9, mon: [0.35, 0.765, -1.05, 'laptop'], eye: 1.66 },
    interview: { bg: '#d8d4ca', fog: [10, 30], floor: '#7a6a58', wall: '#e8e4da', amb: 0.8, key: 0.8, aud: 0.95, mon: [0, 0.78, -1.5, 'tablet'], eye: 1.22 }
  };

  /* ------------------------------------------------------------------ the venue */
  MB.Venue = function (T, opts) {
    var key = LAYOUT[opts.key] ? opts.key : 'redcircle', look = LOOK[key];
    var R = rnd(key.length * 977 + (opts.seed || 7));
    var group = new T.Group(), disposables = [];
    function mat(color, extra) { var m = new T.MeshLambertMaterial(Object.assign({ color: color }, extra || {})); disposables.push(m); return m; }
    function basic(color, extra) { var m = new T.MeshBasicMaterial(Object.assign({ color: color }, extra || {})); disposables.push(m); return m; }
    function mesh(g, m, x, y, z, rx, ry, rz) { var o = new T.Mesh(g, m); o.position.set(x || 0, y || 0, z || 0); o.rotation.set(rx || 0, ry || 0, rz || 0); group.add(o); disposables.push(g); return o; }
    function box(w, h, d, m, x, y, z, ry) { return mesh(new T.BoxGeometry(w, h, d), m, x, y + h / 2, z, 0, ry || 0); }

    var layout = LAYOUT[key](R), seats = layout.seats;
    var V = { key: key, group: group, look: look, eyeY: look.eye, span: layout.span, people: [] };

    /* lights */
    var amb = new T.HemisphereLight('#ffffff', '#3a3030', look.amb * (opts.houseLights ? 2.2 : 1));
    group.add(amb);
    var audLight = new T.DirectionalLight('#cfd8ff', look.aud * (opts.houseLights ? 1.6 : 1));
    audLight.position.set(0, 7, 4); audLight.target.position.set(0, 0, -12); group.add(audLight); group.add(audLight.target);
    var spot = new T.SpotLight('#ffe2b8', look.key * 30, 30, 0.42, 0.55, 1.2);
    spot.position.set(0, 9, -5.5); spot.target.position.set(0, 0, 0.2); group.add(spot); group.add(spot.target);
    V.spot = spot;
    var qaSpot = new T.SpotLight('#ffffff', 0, 40, 0.12, 0.5, 1); qaSpot.position.set(0, 12, 2); group.add(qaSpot); group.add(qaSpot.target);

    /* floor you stand on, room */
    var stageMat = mat(key === 'redcircle' || key === 'arena' ? '#17171a' : look.floor);
    mesh(new T.PlaneGeometry(80, 80), mat(look.floor), 0, (key === 'redcircle' ? -1.0 : key === 'arena' ? -1.6 : key === 'townhall' ? -0.6 : 0) - 0.002, 0, -Math.PI / 2);
    var stageFront = 0;
    if (key === 'redcircle') {
      mesh(new T.CylinderGeometry(6.4, 6.6, 1.0, 64, 1, false, Math.PI / 2, Math.PI), stageMat, 0, -0.5, 0);
      box(13.2, 1.0, 7.5, stageMat, 0, -1.0, 4.2);
      var circle = mesh(new T.CircleGeometry(1.75, 64), basic('#d4241a'), 0, 0.006, 0, -Math.PI / 2);
      mesh(new T.RingGeometry(1.75, 1.82, 64), basic('#ff6a5c'), 0, 0.007, 0, -Math.PI / 2);
      V.circle = circle;
      // steps wall + rows
      var rowsGeo = [];
      for (var r = 0; r < 20; r++) {
        var Rr = 7.2 + r * 0.95 - 0.5, y = -1.0 + r * 0.42;
        rowsGeo.push([new T.RingGeometry(Rr, Rr + 0.95, 40, 1, Math.PI / 2 - 1.36, 2.72), 0, y, 0, -Math.PI / 2]);
        rowsGeo.push([new T.CylinderGeometry(Rr + 0.95, Rr + 0.95, 0.42, 40, 1, true, Math.PI - 1.36, 2.72), 0, y + 0.21, 0]);
      }
      mesh(merge(T, rowsGeo), mat('#1d1417', { side: T.DoubleSide }));
      stageFront = -6.4;
    } else if (key === 'arena') {
      box(16, 1.6, 9, stageMat, 0, -1.6, 1.2);
      box(3, 1.6, 4, stageMat, 0, -1.6, -4.5);
      mesh(new T.RingGeometry(1.6, 1.75, 64), basic('#6e5bff'), 0, 0.006, 0, -Math.PI / 2);
      mesh(new T.CircleGeometry(1.6, 64), basic('#141024'), 0, 0.005, 0, -Math.PI / 2);
      var bowl = [];
      for (var r2 = 0; r2 < 24; r2++) {
        var R2 = 33 + r2 * 1.05 - 0.5, y2 = -0.4 + r2 * 0.62;
        bowl.push([new T.RingGeometry(R2, R2 + 1.05, 48, 1, Math.PI / 2 - 1.7, 3.4), 0, y2, 0, -Math.PI / 2]);
        bowl.push([new T.CylinderGeometry(R2 + 1.05, R2 + 1.05, 0.62, 48, 1, true, Math.PI - 1.7, 3.4), 0, y2 + 0.31, 0]);
      }
      mesh(merge(T, bowl), mat('#141420', { side: T.DoubleSide }));
      // trusses + moving beams
      box(18, 0.5, 0.5, mat('#2a2a33'), 0, 9, -1); box(18, 0.5, 0.5, mat('#2a2a33'), 0, 9, 3);
      V.beams = [];
      var beamCols = ['#6e5bff', '#25d0ff', '#ff3b8a', '#ffd23b', '#25d0ff', '#6e5bff'];
      for (var b = 0; b < 6; b++) {
        var cg = new T.ConeGeometry(2.2, 24, 20, 1, true); cg.translate(0, -12, 0);
        var beam = mesh(cg, basic(beamCols[b], { transparent: true, opacity: 0.09, blending: T.AdditiveBlending, depthWrite: false, side: T.DoubleSide }), -7.5 + b * 3, 9, -1);
        beam.userData.ph = b * 1.1; V.beams.push(beam);
      }
    } else if (key === 'townhall') {
      box(10, 0.6, 4.2, mat('#7a5530'), 0, -0.6, 0.6);
      var chairsBack = [];
      box(0.7, 1.05, 0.5, mat('#5a3a1e'), 0, 0, -0.55); // lectern
      mesh(new T.BoxGeometry(0.78, 0.04, 0.55), mat('#6b4426'), 0, 1.07, -0.55, -0.35);
      [-3.6, 3.6].forEach(function (fx, i) {
        box(0.06, 2.6, 0.06, mat('#c9a94a'), fx, 0, 1.2);
        mesh(new T.PlaneGeometry(0.9, 0.6), mat(i ? '#b8322a' : '#2a4d8c', { side: T.DoubleSide }), fx + 0.48, 2.25, 1.2);
      });
      void chairsBack;
    } else if (key === 'lecture') {
      box(1.0, 1.0, 0.6, mat('#6b4426'), 0.9, 0, -0.5);
      mesh(new T.BoxGeometry(1.1, 0.04, 0.7), mat('#7a5030'), 0.9, 1.02, -0.5, -0.3);
    } else if (key === 'boardroom') {
      box(1.7, 0.06, 7.6, mat('#3a2a1e'), 0, 0.72, -4.9);
      box(1.2, 0.72, 6.6, mat('#2a1e16'), 0, 0, -4.9);
      mesh(new T.BoxGeometry(0.34, 0.02, 0.24), mat('#9aa0aa'), 0.35, 0.79, -0.92); // laptop base
    } else if (key === 'interview') {
      box(2.8, 0.05, 0.9, mat('#4a3426'), 0, 0.72, -1.95);
      box(2.7, 0.72, 0.1, mat('#3a2a1e'), 0, 0, -1.55);
      mesh(new T.CylinderGeometry(0.035, 0.03, 0.12, 12), mat('#cfe7f0', { transparent: true, opacity: 0.6 }), -0.7, 0.81, -1.6);
      box(0.4, 0.45, 0.4, mat('#4b2e1c'), 1.9, 0, -0.6);
      mesh(new T.SphereGeometry(0.42, 12, 10), mat('#3d6b3a'), 1.9, 0.85, -0.6);
      box(0.5, 0.45, 0.45, mat('#2b2b30'), 0, 0, 0.35); // your chair
    } else if (key === 'wedding') {
      mesh(new T.PlaneGeometry(7, 5), mat('#5a4030'), 0, 0.004, -0.6, -Math.PI / 2);
      box(0.4, 0.95, 0.4, mat('#2a2a2a'), 0, 0, -1.25);
      (layout.tables || []).forEach(function (t) {
        mesh(new T.CylinderGeometry(t.r, t.r, 0.74, 24), mat('#f2ece2'), t.x, 0.37, t.z);
        mesh(new T.CylinderGeometry(0.05, 0.05, 0.22, 8), basic('#ffd9a0'), t.x, 0.85, t.z);
        mesh(new T.SphereGeometry(0.16, 10, 8), mat(t.couple ? '#f2b8c6' : '#d8e8c8'), t.x + 0.25, 0.86, t.z + 0.1);
      });
      // string lights
      var bulbs = new T.InstancedMesh(new T.SphereGeometry(0.05, 6, 5), basic('#ffd890'), 360), mm = new T.Matrix4(), bi = 0;
      for (var line = 0; line < 9; line++) for (var q = 0; q < 40; q++) {
        var u = q / 39, xx = -16 + u * 32, zz = -2 - line * 2.3, yy = 4.6 - Math.sin(u * Math.PI) * 0.9 - (q % 2) * 0.03;
        mm.makeTranslation(xx, yy, zz); bulbs.setMatrixAt(bi++, mm);
      }
      bulbs.count = bi; group.add(bulbs); disposables.push(bulbs.geometry);
    }
    V.stageFront = stageFront;

    /* walls + ceiling (a big open box around everything) */
    var W = { redcircle: [34, 14, -32, 9], arena: [80, 34, -70, 12], lecture: [11, 7, -16, 4], townhall: [13, 7.5, -22, 4], wedding: [18, 6, -20, 5], boardroom: [5, 3.2, -10, 3], interview: [3.4, 3.0, -4.5, 2.2] }[key];
    var wallMat = mat(look.wall, { side: T.BackSide });
    var room = mesh(new T.BoxGeometry(W[0] * 2, W[1] * 2, W[3] - W[2]), wallMat, 0, W[1] - (key === 'redcircle' ? 1.0 : key === 'arena' ? 1.6 : 0), (W[3] + W[2]) / 2);
    room.renderOrder = -1;
    if (key === 'boardroom') {   // glass wall + skyline at dusk
      var sky = MB.canvasTex(T, 1024, 512), g = sky.ctx, grad = g.createLinearGradient(0, 0, 0, 512);
      grad.addColorStop(0, '#22284a'); grad.addColorStop(0.55, '#c86a5a'); grad.addColorStop(0.75, '#f2b07a'); grad.addColorStop(1, '#2a2430');
      g.fillStyle = grad; g.fillRect(0, 0, 1024, 512);
      for (var bld = 0; bld < 40; bld++) {
        var bw = 20 + R() * 50, bh = 80 + R() * 260, bx = R() * 1024;
        g.fillStyle = '#1a1c28'; g.fillRect(bx, 512 - bh, bw, bh);
        g.fillStyle = 'rgba(255,214,140,.8)';
        for (var wy = 512 - bh + 8; wy < 500; wy += 14) for (var wx = bx + 4; wx < bx + bw - 6; wx += 10) if (R() > 0.55) g.fillRect(wx, wy, 4, 6);
      }
      sky.tex.needsUpdate = true;
      mesh(new T.PlaneGeometry(13, 3.2), basic('#ffffff', { map: sky.tex }), -4.95, 1.6, -5, 0, Math.PI / 2);
      disposables.push(sky.tex);
    }
    if (key === 'lecture' || key === 'townhall' || key === 'interview') {  // windows of light
      for (var wi = 0; wi < (key === 'interview' ? 1 : 4); wi++) mesh(new T.PlaneGeometry(1.6, 2.2), basic('#fff6dc'), -W[0] + 0.02, 2.2, -3 - wi * 4, 0, Math.PI / 2);
    }

    /* the big screen behind you (slides), chalkboard in the lecture hall */
    var scr = MB.canvasTex(T, 1024, 576); disposables.push(scr.tex);
    var SCR = { redcircle: [9, 5.06, 0, 4.4, 7.2], arena: [20, 9, 0, 8, 6], lecture: [6, 2.4, -0.8, 2.0, 3.9], townhall: [5, 2.8, 0, 3.2, 3.9], wedding: [4, 2.25, 3, 2.6, 4.9], boardroom: [2.8, 1.6, 0, 1.6, 2.95], interview: [1.4, 0.9, -0.9, 1.7, 2.15] }[key];
    var screenMesh = mesh(new T.PlaneGeometry(SCR[0], SCR[1]), basic('#ffffff', { map: scr.tex }), SCR[2], SCR[3], SCR[4], 0, Math.PI);
    V.screen = screenMesh;
    var sides = [];
    if (key === 'arena') [-14, 14].forEach(function (sx) { sides.push(mesh(new T.PlaneGeometry(9, 5.06), basic('#ffffff', { map: scr.tex }), sx, 7, 0.5, 0, sx < 0 ? -0.35 : 0.35)); });
    if (key === 'redcircle') {   // big red letters standing on the stage
      var sign = MB.canvasTex(T, 1024, 256); disposables.push(sign.tex);
      sign.ctx.fillStyle = '#e62b1e'; sign.ctx.font = '900 190px Archivo, Arial Black, sans-serif'; sign.ctx.textBaseline = 'middle';
      sign.ctx.fillText('BIG STAGE', 20, 135); sign.tex.needsUpdate = true;
      mesh(new T.PlaneGeometry(5.2, 1.3), basic('#ffffff', { map: sign.tex, transparent: true }), -4.6, 0.68, 4.6, 0, Math.PI - 0.5);
    }
    V.setSlide = function (text, small) {
      var c = scr.ctx, w = 1024, h = 576, chalk = key === 'lecture';
      c.fillStyle = chalk ? '#1f2b24' : '#0b0b0d'; c.fillRect(0, 0, w, h);
      if (!chalk) { c.fillStyle = '#e62b1e'; c.beginPath(); c.arc(70, 70, 18, 0, Math.PI * 2); c.fill(); }
      c.fillStyle = chalk ? '#e8efe6' : '#f3efe8'; c.textAlign = 'center'; c.textBaseline = 'middle';
      var size = 96; c.font = '900 ' + size + 'px Archivo, Arial Black, sans-serif';
      var lines = MB.wrapText(c, text || '', w - 140);
      while (lines.length > 3 && size > 50) { size -= 8; c.font = '900 ' + size + 'px Archivo, Arial Black, sans-serif'; lines = MB.wrapText(c, text || '', w - 140); }
      lines.slice(0, 4).forEach(function (l, i) { c.fillText(l, w / 2, h / 2 + (i - (Math.min(4, lines.length) - 1) / 2) * size * 1.08); });
      if (small) { c.font = '600 30px Inter, Arial, sans-serif'; c.fillStyle = chalk ? '#b9c7b8' : '#a8a199'; c.fillText(small, w / 2, h - 60); }
      c.textAlign = 'right'; c.font = '800 24px Archivo, Arial, sans-serif'; c.fillStyle = chalk ? '#9fb19e' : '#6d6861'; c.fillText('MR BIG STAGE', w - 40, h - 34);
      scr.tex.needsUpdate = true;
    };
    V.setSlide(opts.title || '', opts.subtitle || '');

    /* spotlight beam you can see (theatre + arena) */
    if (key === 'redcircle' || key === 'arena' || key === 'townhall') {
      var cone = new T.ConeGeometry(1.9, 9.8, 32, 1, true); cone.translate(0, -4.9, 0);
      var beamM = mesh(cone, basic('#ffd9a0', { transparent: true, opacity: 0.06, blending: T.AdditiveBlending, depthWrite: false, side: T.DoubleSide }), 0, 9.4, -5.4);
      // the cone's tip is at its origin and it opens downwards (-y): turn -y towards the spot on the floor
      beamM.quaternion.setFromUnitVectors(new T.Vector3(0, -1, 0), new T.Vector3(0, -9.4, 5.7).normalize());
      V.beam = beamM;
    }

    /* the confidence monitor (canvas screen in front of you) */
    var monTex = MB.canvasTex(T, 1024, 576); disposables.push(monTex.tex);
    var mp = look.mon, monW = mp[3] === 'laptop' ? 0.32 : mp[3] === 'tablet' ? 0.3 : mp[3] === 'lectern' ? 0.62 : 0.98, monH = monW * 0.5625;
    var monGroup = new T.Group(); monGroup.position.set(mp[0], mp[1], mp[2]); group.add(monGroup);
    var headY = look.eye, dy = headY - mp[1], dz = -mp[2];
    var tilt = mp[3] === 'lectern' ? -0.35 : -Math.atan2(dy, dz) + 0.08;
    if (mp[3] === 'floor') { var housing = new T.Mesh(new T.BoxGeometry(monW + 0.08, monH + 0.08, 0.12), mat('#1b1b1f')); housing.rotation.x = tilt; housing.position.z = -0.065; monGroup.add(housing); disposables.push(housing.geometry); }
    if (mp[3] === 'stand') { var pole = new T.Mesh(new T.CylinderGeometry(0.02, 0.02, 0.9, 8), mat('#222')); pole.position.y = -0.45; monGroup.add(pole); disposables.push(pole.geometry); }
    var monScreen = new T.Mesh(new T.PlaneGeometry(monW, monH), basic('#ffffff', { map: monTex.tex }));
    monScreen.rotation.x = tilt; if (mp[3] === 'lectern') monScreen.position.y = 0.02;
    monGroup.add(monScreen); disposables.push(monScreen.geometry);
    V.monitor = { tex: monTex, mesh: monScreen, group: monGroup, kind: mp[3] };

    /* hand card (shown on the left controller in VR) */
    var cardTex = MB.canvasTex(T, 768, 480); disposables.push(cardTex.tex);
    var cardMesh = new T.Mesh(new T.PlaneGeometry(0.2, 0.125), basic('#ffffff', { map: cardTex.tex, side: T.DoubleSide }));
    disposables.push(cardMesh.geometry);
    V.card = { tex: cardTex, mesh: cardMesh };

    /* ------------------------------------------------------------ seats + people (instanced) */
    var vSeat;
    if (key === 'redcircle' || key === 'lecture') vSeat = merge(T, [[new T.BoxGeometry(0.5, 0.1, 0.46), 0, 0.42, 0.04], [new T.BoxGeometry(0.5, 0.55, 0.08), 0, 0.72, -0.2, -0.12]]);
    else if (key === 'arena') vSeat = merge(T, [[new T.BoxGeometry(0.46, 0.08, 0.4), 0, 0.42, 0.04], [new T.BoxGeometry(0.46, 0.32, 0.06), 0, 0.6, -0.18]]);
    else vSeat = merge(T, [[new T.BoxGeometry(0.44, 0.05, 0.42), 0, 0.45, 0.02], [new T.BoxGeometry(0.42, 0.46, 0.04), 0, 0.72, -0.2, -0.08],
      [new T.BoxGeometry(0.03, 0.45, 0.03), -0.19, 0.22, 0.18], [new T.BoxGeometry(0.03, 0.45, 0.03), 0.19, 0.22, 0.18], [new T.BoxGeometry(0.03, 0.45, 0.03), -0.19, 0.22, -0.18], [new T.BoxGeometry(0.03, 0.45, 0.03), 0.19, 0.22, -0.18]]);
    var seatCol = { redcircle: '#7a1414', lecture: '#7a5232', arena: '#2a2a3a', townhall: '#4a4a4a', wedding: '#e8dcc8', boardroom: '#1e1e22', interview: '#2b2b30' }[key];
    var seatList = seats.filter(function (s) { return !s.stand; });
    var seatMesh = new T.InstancedMesh(vSeat, mat(seatCol), Math.max(1, seatList.length));
    var sm = seatMesh.instanceMatrix.array;
    seatList.forEach(function (s, i) { put(sm, i, s.x, s.y, s.z, s.yaw, 0, 1, 1, 1); });
    seatMesh.count = seatList.length; seatMesh.frustumCulled = false; group.add(seatMesh); disposables.push(vSeat);

    // who sits where: front rows fill first, then random
    var want = Math.max(1, Math.min(seats.length, Math.round(opts.crowd || seats.length)));
    var order = seats.map(function (s, i) { return [s.row * 0.35 + R() * 4 + (s.stand ? -1.5 : 0), i]; }).sort(function (a, b) { return a[0] - b[0]; }).slice(0, want);
    var P = order.map(function (o) { return seats[o[1]]; });
    var N = P.length;
    V.count = N;

    var gTorso = new T.CylinderGeometry(0.15, 0.18, 0.58, 10); gTorso.scale(1.22, 1, 0.72); gTorso.translate(0, 0.29, 0);
    var gHead = merge(T, [[new T.SphereGeometry(0.105, 12, 9), 0, 0.13, 0], [new T.CylinderGeometry(0.045, 0.05, 0.08, 8), 0, 0.02, 0]]);
    var gHair = new T.SphereGeometry(0.115, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.55); gHair.translate(0, 0.14, -0.008);
    var gLap = merge(T, [[new T.BoxGeometry(0.36, 0.14, 0.44), 0, 0.5, 0.14], [new T.BoxGeometry(0.34, 0.46, 0.12), 0, 0.25, 0.36], [new T.BoxGeometry(0.34, 0.07, 0.22), 0, 0.035, 0.42]]);
    var gLegs = merge(T, [[new T.BoxGeometry(0.14, 0.92, 0.16), -0.09, 0.46, 0], [new T.BoxGeometry(0.14, 0.92, 0.16), 0.09, 0.46, 0], [new T.BoxGeometry(0.34, 0.07, 0.24), 0, 0.035, 0.05]]);
    var gArm = merge(T, [[new T.BoxGeometry(0.08, 0.08, 0.3), 0, 0, 0.15], [new T.SphereGeometry(0.045, 8, 6), 0, 0, 0.31]]);
    var gPhone = new T.PlaneGeometry(0.075, 0.13);
    function inst(g, m, n) { var im = new T.InstancedMesh(g, m, Math.max(1, n)); im.instanceMatrix.setUsage(T.DynamicDrawUsage); im.frustumCulled = false; group.add(im); disposables.push(g); return im; }
    var mTorso = inst(gTorso, mat('#ffffff'), N), mHead = inst(gHead, mat('#ffffff'), N), mHair = inst(gHair, mat('#ffffff'), N);
    var mLap = inst(gLap, mat('#ffffff'), N), mLegs = inst(gLegs, mat('#ffffff'), N), mArm = inst(gArm, mat('#ffffff'), N * 2);
    var mPhone = inst(gPhone, basic('#cfe4ff', { side: T.DoubleSide }), N);
    var col = new T.Color(), pal = CLOTHES[key] || CLOTHES.theatre;
    var A = { torso: mTorso.instanceMatrix.array, head: mHead.instanceMatrix.array, hair: mHair.instanceMatrix.array, lap: mLap.instanceMatrix.array,
      legs: mLegs.instanceMatrix.array, arm: mArm.instanceMatrix.array, phone: mPhone.instanceMatrix.array };
    var people = [];
    var spanEdge = layout.span;
    for (var i = 0; i < N; i++) {
      var s = P[i], skin = SKIN[Math.floor(R() * SKIN.length)];
      var cloth = pal[Math.floor(R() * pal.length)];
      mTorso.setColorAt(i, col.set(cloth)); mHead.setColorAt(i, col.set(skin)); mArm.setColorAt(i * 2, col.set(cloth)); mArm.setColorAt(i * 2 + 1, col.set(cloth));
      mHair.setColorAt(i, col.set(HAIR[Math.floor(R() * HAIR.length)])); mLap.setColorAt(i, col.set(PANTS[Math.floor(R() * PANTS.length)]));
      mLegs.setColorAt(i, col.set(PANTS[Math.floor(R() * PANTS.length)])); mPhone.setColorAt(i, col.set('#cfe4ff'));
      var dx = -s.x, dz = -s.z, ang = Math.atan2(s.x, -s.z);  // ang: + = to your right
      var sec = ang < -spanEdge / 3 ? 1 : ang > spanEdge / 3 ? 3 : 2;
      people.push({ x: s.x, y: s.y, z: s.z, yaw: s.yaw, stand: !!s.stand, standing: !!s.stand, sec: sec, dist: Math.sqrt(dx * dx + dz * dz),
        bias: (R() - 0.5) * 0.36, ph: R() * 6.28, rate: 0.3 + R() * 0.6, hairS: 0.9 + R() * 0.25, longHair: R() < 0.35, bald: R() < 0.08, size: 0.92 + R() * 0.16,
        mode: 'eng', until: 0, hy: 0, hp: 0, lean: 0, ty: 0, tp: 0, tl: 0, nod: 0, clap: 0, arms: 'rest', phone: false, raise: 0, hidden: false, beacon: false });
    }
    ['torso', 'head', 'hair', 'lap', 'legs', 'arm', 'phone'].forEach(function (k) { var m = { torso: mTorso, head: mHead, hair: mHair, lap: mLap, legs: mLegs, arm: mArm, phone: mPhone }[k]; if (m.instanceColor) m.instanceColor.needsUpdate = true; });
    V.people = people;
    var tmp = [0, 0, 0];

    function drawPerson(i, t) {
      var p = people[i];
      if (p.hidden) { hide(A.torso, i); hide(A.head, i); hide(A.hair, i); hide(A.lap, i); hide(A.legs, i); hide(A.arm, i * 2); hide(A.arm, i * 2 + 1); hide(A.phone, i); return; }
      var st = p.standing, sz = p.size, hipY = p.y + (st ? 0.93 : 0.5) * sz;
      var bob = st && p.clap > 0.3 ? Math.abs(Math.sin(t * 7 + p.ph)) * 0.04 : 0;
      put(A.torso, i, p.x, hipY + bob, p.z, p.yaw, p.lean, sz, sz, sz);
      off(tmp, p.x, hipY + bob, p.z, p.yaw, p.lean, 0, 0.6 * sz, 0);
      var nx = tmp[0], ny = tmp[1], nz = tmp[2];
      var hp = p.hp + (p.nod > 0 ? Math.sin(p.nod * 14) * 0.18 : 0);
      put(A.head, i, nx, ny, nz, p.yaw + p.hy, hp, sz, sz, sz);
      if (p.bald) hide(A.hair, i); else put(A.hair, i, nx, ny, nz, p.yaw + p.hy, hp, sz * p.hairS, sz * (p.longHair ? 1.35 : 1), sz * p.hairS);
      if (st) { hide(A.lap, i); put(A.legs, i, p.x, p.y, p.z, p.yaw, 0, sz, sz, sz); }
      else { put(A.lap, i, p.x, p.y, p.z, p.yaw, 0, sz, sz, sz); hide(A.legs, i); }
      // arms: rest on lap, clap, crossed, raised hand
      for (var side = -1; side <= 1; side += 2) {
        var ai = i * 2 + (side > 0 ? 1 : 0), ax, ay, az, ayaw, apitch;
        if (p.raise > 0 && side > 0) { ax = 0.2; ay = 0.5; az = 0.02; ayaw = 0; apitch = -1.45 + Math.sin(t * 3) * 0.08; }
        else if (p.clap > 0.05) {
          var sw = Math.abs(Math.sin(t * (8 + p.rate * 4) + p.ph)) * 0.09 * p.clap;
          ax = side * (0.16 + sw); ay = 0.36; az = 0.12; ayaw = -side * (0.95 - sw * 2); apitch = -0.35;
        } else if (p.arms === 'crossed') { ax = side * 0.15; ay = 0.33; az = 0.13; ayaw = -side * 1.45; apitch = 0; }
        else if (p.phone) { ax = side * 0.12; ay = 0.2; az = 0.08; ayaw = -side * 0.35; apitch = -0.5; }
        else { ax = side * 0.19; ay = st ? 0.05 : 0.02; az = st ? 0.02 : 0.06; ayaw = -side * 0.12; apitch = st ? 1.2 : 0.3; }
        off(tmp, p.x, hipY + bob, p.z, p.yaw, p.lean, ax * sz, ay * sz, az * sz);
        put(A.arm, ai, tmp[0], tmp[1], tmp[2], p.yaw + ayaw, apitch, sz, sz, sz);
      }
      if (p.phone) { off(tmp, p.x, hipY, p.z, p.yaw, p.lean, 0, 0.3 * sz, 0.32 * sz); put(A.phone, i, tmp[0], tmp[1], tmp[2], p.yaw, -0.9, 1, 1, 1); }
      else hide(A.phone, i);
    }
    for (var d = 0; d < N; d++) { var pp = people[d]; pp.ty = 0; pp.tp = lookPitch(pp); pp.hp = pp.tp; drawPerson(d, 0); }
    ['torso', 'head', 'hair', 'lap', 'legs', 'arm', 'phone'].forEach(function (k) { ({ torso: mTorso, head: mHead, hair: mHair, lap: mLap, legs: mLegs, arm: mArm, phone: mPhone })[k].instanceMatrix.needsUpdate = true; });

    function lookPitch(p) {   // head pitch to look at the speaker's face (positive = down)
      var hy = p.y + (p.standing ? 1.62 : 1.2) * p.size;
      return Math.atan2(hy - look.eye, Math.max(0.5, p.dist));
    }
    function lookYaw(p) { var want = Math.atan2(-p.x, -p.z); return Math.max(-1.2, Math.min(1.2, Math.atan2(Math.sin(want - p.yaw), Math.cos(want - p.yaw)))); }

    /* ------------------------------------------------------------ the crowd's mind */
    var base = { warm: 0.82, neutral: 0.66, tough: 0.5 }[opts.mood] || 0.66;
    var crowd = V.crowd = { att: [0, base, base, base], state: 'idle', applause: 0, ovation: false, eye: [0, 0, 0, 0], beacon: -1, asker: -1, cursor: 0 };
    crowd.mood = opts.mood || 'neutral';
    crowd.nod = function (strength) {
      people.forEach(function (p) { if (p.mode === 'eng' && Math.random() < (strength || 0.5)) p.nod = -Math.random() * 0.5; });
    };
    crowd.cough = function () { var i = Math.floor(Math.random() * N), p = people[i]; p.nod = -0.1; p.lean = 0.25; return p; };
    crowd.pick = function (near) {  // someone visible, for Q&A or the lighthouse
      var c = people.map(function (p, i) { return [i, p]; }).filter(function (x) { return !x[1].hidden && (!near || x[1].dist < near); });
      return c.length ? c[Math.floor(Math.random() * c.length)][0] : 0;
    };
    crowd.headPos = function (i, out) {
      var p = people[i]; out = out || new T.Vector3();
      return out.set(p.x, p.y + (p.standing ? 1.62 : 1.2) * p.size + 0.05, p.z);
    };
    crowd.ask = function (i) {   // stand up with a hand raised, spotlight on them
      if (crowd.asker >= 0) { var o = people[crowd.asker]; o.raise = 0; o.standing = o.stand; }
      crowd.asker = i;
      if (i < 0) { qaSpot.intensity = 0; return; }
      var p = people[i]; p.raise = 1; p.standing = true; p.mode = 'eng'; p.until = 1e9;
      var hp = crowd.headPos(i); qaSpot.position.set(hp.x * 0.7, hp.y + 8, hp.z * 0.7 + 2); qaSpot.target.position.copy(hp); qaSpot.intensity = 60;
    };
    var ringG = new T.TorusGeometry(0.22, 0.025, 8, 28), ring = new T.Mesh(ringG, basic('#ffd36a')); ring.visible = false; group.add(ring); disposables.push(ringG);
    crowd.light = function (i) {
      crowd.beacon = i;
      if (i < 0) { ring.visible = false; return; }
      ring.visible = true; crowd.headPos(i, ring.position); ring.position.y += 0.32; ring.rotation.x = Math.PI / 2;
    };
    crowd.applaud = function (level, ovation) { crowd.state = 'applause'; crowd.applause = level; crowd.ovation = !!ovation; };
    crowd.calm = function () { crowd.state = 'talk'; crowd.applause = 0; crowd.ovation = false; };

    // a walker (latecomer / leaver), plain meshes
    var walker = new T.Group();
    var wBody = new T.Mesh(gTorso, mat('#3b5c8c')); wBody.position.y = 0.93; walker.add(wBody);
    var wHead = new T.Mesh(gHead, mat('#d9a27c')); wHead.position.y = 1.52; walker.add(wHead);
    var wLegs = new T.Mesh(gLegs, mat('#1e2026')); walker.add(wLegs);
    walker.visible = false; group.add(walker);
    var walk = null;
    crowd.walk = function (leaving) {
      if (walk) return false;
      var cand = people.map(function (p, i) { return i; }).filter(function (i) { return !people[i].stand && people[i].dist < 22 && !people[i].hidden; });
      if (!cand.length) return false;
      var i = cand[Math.floor(Math.random() * cand.length)], p = people[i];
      var door = new T.Vector3(p.x > 0 ? Math.max(6, p.x + 4) : Math.min(-6, p.x - 4), p.y, p.z);
      walk = { i: i, t: 0, dur: 5, from: leaving ? new T.Vector3(p.x, p.y, p.z) : door, to: leaving ? door : new T.Vector3(p.x, p.y, p.z), leaving: leaving };
      if (leaving) { p.hidden = true; } else { p.hidden = true; }
      walker.visible = true; walker.position.copy(walk.from);
      return true;
    };

    var gazeCool = 0, lastEval = 0;
    V.update = function (dt, t, info) {
      info = info || {};
      // section attention (4 times a second)
      if (t - lastEval > 0.25) {
        var step = t - lastEval; lastEval = t;
        for (var s = 1; s <= 3; s++) {
          crowd.eye[s] = Math.max(0, crowd.eye[s] - step / 7);
          if (info.gaze === s) crowd.eye[s] = 1;
          var target;
          if (crowd.state === 'talk') {
            var q = info.q == null ? 0.6 : info.q;
            target = base + 0.42 * (q - 0.55) + 0.16 * crowd.eye[s] - (info.silence > 4 ? 0.22 : 0) + (info.t < 25 ? 0.1 : 0);
          } else target = 0.85;
          crowd.att[s] += (Math.max(0.05, Math.min(1, target)) - crowd.att[s]) * (1 - Math.exp(-step / (crowd.state === 'talk' ? 6 : 1.5)));
        }
      }
      // people: re-decide moods now and then, ease heads, draw a slice each frame
      var budget = Math.min(N, 520), clapping = crowd.state === 'applause';
      for (var n = 0; n < budget; n++) {
        var i = crowd.cursor; crowd.cursor = (crowd.cursor + 1) % N;
        var p = people[i], pdt = Math.max(dt, N / budget * dt);
        if (t > p.until && p.raise === 0) {
          var a = crowd.att[p.sec] + p.bias + Math.sin(t * p.rate * 0.3 + p.ph) * 0.08;
          if (crowd.state !== 'talk') p.mode = 'eng';
          else p.mode = a > 0.62 ? 'eng' : a > 0.4 ? 'mid' : 'bored';
          p.until = t + 2 + Math.random() * 5;
          var lp = lookPitch(p), ly = lookYaw(p);
          p.phone = false; p.arms = 'rest';
          if (p.mode === 'eng') { p.ty = ly + (Math.random() - 0.5) * 0.08; p.tp = lp + (Math.random() - 0.5) * 0.05; p.tl = 0.1 + Math.random() * 0.06; }
          else if (p.mode === 'mid') { p.ty = ly + (Math.random() - 0.5) * 0.9; p.tp = lp + (Math.random() - 0.3) * 0.25; p.tl = 0; }
          else {
            var r = Math.random();
            if (r < 0.55) { p.phone = true; p.ty = 0; p.tp = 0.75; p.tl = 0.05; }
            else if (r < 0.8) { p.ty = (Math.random() < 0.5 ? -1 : 1) * (0.6 + Math.random() * 0.5); p.tp = 0.1; p.tl = -0.05; }
            else { p.ty = ly * 0.5; p.tp = -0.25; p.tl = -0.16; }
            if (crowd.mood === 'tough' && !p.phone && Math.random() < 0.6) p.arms = 'crossed';
          }
        }
        if (p.raise) { p.ty = lookYaw(p); p.tp = lookPitch(p); }
        var k = 1 - Math.exp(-pdt * 3.5);
        p.hy += (p.ty - p.hy) * k; p.hp += (p.tp - p.hp) * k; p.lean += (p.tl - p.lean) * k;
        if (p.nod !== 0) { p.nod += pdt; if (p.nod > 0.9) p.nod = 0; }
        var wantClap = clapping && (crowd.applause > 0.15 + (p.bias + 0.18) * 0.5 || p.mode === 'eng' && crowd.applause > 0.3) ? Math.min(1, crowd.applause + 0.2) : 0;
        p.clap += (wantClap - p.clap) * Math.min(1, pdt * 4);
        if (wantClap) { p.phone = false; p.arms = 'rest'; p.ty = lookYaw(p); p.tp = lookPitch(p); }
        p.standing = p.stand || p.raise > 0 || (clapping && crowd.ovation && p.bias > -0.12);
        drawPerson(i, t);
      }
      mTorso.instanceMatrix.needsUpdate = mHead.instanceMatrix.needsUpdate = mHair.instanceMatrix.needsUpdate = true;
      mLap.instanceMatrix.needsUpdate = mLegs.instanceMatrix.needsUpdate = mArm.instanceMatrix.needsUpdate = mPhone.instanceMatrix.needsUpdate = true;
      // walker
      if (walk) {
        walk.t += dt;
        var u = Math.min(1, walk.t / walk.dur);
        walker.position.lerpVectors(walk.from, walk.to, u);
        walker.position.y = walk.from.y + Math.abs(Math.sin(walk.t * 6)) * 0.03;
        walker.rotation.y = Math.atan2(walk.to.x - walk.from.x, walk.to.z - walk.from.z);
        if (u >= 1) { walker.visible = false; if (!walk.leaving) people[walk.i].hidden = false; walk = null; }
      }
      // beams + ring + spot glow
      if (V.beams) V.beams.forEach(function (b) { b.rotation.z = Math.sin(t * 0.5 + b.userData.ph) * 0.45; b.rotation.x = Math.cos(t * 0.37 + b.userData.ph) * 0.35; });
      if (ring.visible) { ring.rotation.z = t * 2; ring.scale.setScalar(1 + Math.sin(t * 6) * 0.08); }
      gazeCool = Math.max(0, gazeCool - dt);
    };

    /* where the speaker is looking: dir = unit head forward vector */
    V.gazeOf = function (dir) {
      var yaw = Math.atan2(dir.x, -dir.z), pitch = Math.asin(Math.max(-1, Math.min(1, dir.y)));
      if (Math.abs(yaw) > 1.95) return 5;
      if (pitch < -0.5) return 4;
      if (pitch > 0.75 || Math.abs(yaw) > spanEdge + 0.3) return 0;
      return yaw < -spanEdge / 3 ? 1 : yaw > spanEdge / 3 ? 3 : 2;
    };
    V.flatCam = { y: look.eye, pitch: key === 'redcircle' ? 0.02 : key === 'arena' ? 0.08 : -0.05 };
    V.dispose = function () {
      group.traverse(function (o) { if (o.isInstancedMesh && o.dispose) o.dispose(); });
      disposables.forEach(function (d) { try { d.dispose(); } catch (e) {} });
    };
    return V;
  };

  /* ------------------------------------------------------------------ crowd sounds (Web Audio, synthesised) */
  MB.CrowdAudio = function () {
    var A = { ctx: null, master: null, murmurGain: null, on: true };
    function noiseBuf(ctx, secs, brown) {
      var n = Math.floor(ctx.sampleRate * secs), b = ctx.createBuffer(1, n, ctx.sampleRate), d = b.getChannelData(0), last = 0;
      for (var i = 0; i < n; i++) { var w = Math.random() * 2 - 1; if (brown) { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; } else d[i] = w; }
      return b;
    }
    A.init = function () {
      if (A.ctx) { if (A.ctx.state === 'suspended') A.ctx.resume(); return A; }
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return A;
      var ctx = A.ctx = new AC();
      A.master = ctx.createGain(); A.master.gain.value = 0.8; A.master.connect(ctx.destination);
      A.white = noiseBuf(ctx, 2, false); A.brown = noiseBuf(ctx, 4, true);
      // murmur: brown noise through a voice-band filter, wobbling
      var src = ctx.createBufferSource(); src.buffer = A.brown; src.loop = true;
      var bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 520; bp.Q.value = 0.7;
      A.murmurGain = ctx.createGain(); A.murmurGain.gain.value = 0;
      var lfo = ctx.createOscillator(), lfoG = ctx.createGain(); lfo.frequency.value = 0.35; lfoG.gain.value = 0.06; lfo.connect(lfoG); lfoG.connect(A.murmurGain.gain);
      src.connect(bp); bp.connect(A.murmurGain); A.murmurGain.connect(A.master); src.start(); lfo.start();
      if (ctx.state === 'suspended') ctx.resume();
      return A;
    };
    A.murmur = function (level, secs) { if (!A.ctx) return; var g = A.murmurGain.gain, now = A.ctx.currentTime; g.cancelScheduledValues(now); g.setTargetAtTime(level * 0.5, now, (secs || 1) / 3); };
    function burst(at, dur, freq, q, gain, pan) {
      var ctx = A.ctx, s = ctx.createBufferSource(); s.buffer = A.white;
      var f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = q;
      var g = ctx.createGain(); g.gain.setValueAtTime(0, at); g.gain.linearRampToValueAtTime(gain, at + 0.004); g.gain.exponentialRampToValueAtTime(0.0008, at + dur);
      var p = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
      s.connect(f); f.connect(g);
      if (p) { p.pan.value = pan || 0; g.connect(p); p.connect(A.master); } else g.connect(A.master);
      s.start(at, Math.random() * 1.5, dur + 0.05);
    }
    A.applause = function (level, secs) {   // many short claps, swelling then fading
      if (!A.ctx || !A.on) return;
      var now = A.ctx.currentTime, rate = 25 + level * 260;
      for (var t = 0; t < secs; t += 1 / rate) {
        var env = Math.min(1, t / 0.6) * Math.min(1, (secs - t) / 1.2);
        if (Math.random() > env) continue;
        burst(now + t + Math.random() * 0.01, 0.03 + Math.random() * 0.04, 900 + Math.random() * 1800, 0.9, 0.05 + level * 0.1, Math.random() * 1.6 - 0.8);
      }
    };
    A.cough = function (pan) {
      if (!A.ctx || !A.on) return;
      var now = A.ctx.currentTime;
      burst(now, 0.22, 420 + Math.random() * 200, 1.2, 0.5, pan); burst(now + 0.28, 0.18, 380, 1.2, 0.35, pan);
    };
    A.phone = function () {
      if (!A.ctx || !A.on) return;
      var ctx = A.ctx, now = ctx.currentTime;
      for (var r = 0; r < 3; r++) for (var k = 0; k < 14; k++) {
        var o = ctx.createOscillator(), g = ctx.createGain(), at = now + r * 1.4 + k * 0.06;
        o.type = 'square'; o.frequency.value = k % 2 ? 1320 : 1560;
        g.gain.setValueAtTime(0.03, at); g.gain.setValueAtTime(0, at + 0.055);
        o.connect(g); g.connect(A.master); o.start(at); o.stop(at + 0.06);
      }
    };
    A.squeal = function () {
      if (!A.ctx || !A.on) return;
      var ctx = A.ctx, now = ctx.currentTime, o = ctx.createOscillator(), g = ctx.createGain();
      o.frequency.setValueAtTime(2600, now); o.frequency.linearRampToValueAtTime(3100, now + 1.2);
      g.gain.setValueAtTime(0, now); g.gain.linearRampToValueAtTime(0.06, now + 0.9); g.gain.linearRampToValueAtTime(0, now + 1.3);
      o.connect(g); g.connect(A.master); o.start(now); o.stop(now + 1.4);
    };
    A.chime = function (high) {
      if (!A.ctx) return;
      var ctx = A.ctx, now = ctx.currentTime;
      [0, 0.18].forEach(function (d, i) {
        var o = ctx.createOscillator(), g = ctx.createGain();
        o.type = 'sine'; o.frequency.value = (high ? 1046 : 784) * (i ? 1.5 : 1);
        g.gain.setValueAtTime(0, now + d); g.gain.linearRampToValueAtTime(0.12, now + d + 0.01); g.gain.exponentialRampToValueAtTime(0.001, now + d + 0.9);
        o.connect(g); g.connect(A.master); o.start(now + d); o.stop(now + d + 1);
      });
    };
    A.buzz = function () {
      if (!A.ctx) return;
      var ctx = A.ctx, now = ctx.currentTime, o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'sawtooth'; o.frequency.value = 110;
      g.gain.setValueAtTime(0.05, now); g.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
      o.connect(g); g.connect(A.master); o.start(now); o.stop(now + 0.3);
    };
    A.close = function () { try { if (A.ctx) A.ctx.close(); } catch (e) {} A.ctx = null; };
    return A;
  };
})();

/* ===== admin.html ===== */
(function () {
  var esc = UI.esc;
  var TABS = [['overview', 'Overview', 'grid'], ['stage', 'Stages', 'mic'], ['feedback', 'Feedback', 'inbox'], ['users', 'Users', 'users'], ['demo', 'Demo data', 'database']];

  UI.page('admin', { title: 'Admin', auth: 'admin' }, function (view, ctx) {
    var tab = TABS.some(function (t) { return t[0] === ctx.args[0]; }) ? ctx.args[0] : 'overview';
    var fbFilter = 'new';
    view.innerHTML = '<div class="ui-wrap"><div class="ui-page-head"><div><h1>Admin</h1><p class="muted">Only admins see this page.</p></div></div>' +
      '<nav class="ui-tabs">' + TABS.map(function (t) {
        return '<a href="#admin/' + t[0] + '" class="' + (t[0] === tab ? 'on' : '') + '">' + UI.icon(t[2]) + t[1] + '</a>';
      }).join('') + '</nav><div data-body><div class="ui-skel"></div></div></div>';
    var body = view.querySelector('[data-body]');

    function overview() {
      return UI.api('admin_overview').then(function (d) {
        var stat = function (n, label, go) { return '<a class="ui-card ui-stat" href="#admin/' + go + '" style="text-decoration:none;color:inherit"><b>' + n + '</b><span>' + label + '</span></a>'; };
        body.innerHTML = '<div class="ad-stats">' + stat(d.users, 'people signed up', 'users') + stat(d.admins, UI.plural(d.admins, 'admin').replace(/^\d+ /, ''), 'users') +
          stat(d.feedback_new, 'new feedback', 'feedback') + stat(d.talks, 'talks written', 'stage') + stat(d.sessions, 'sessions on stage', 'stage') + '</div>' +
          '<p class="muted small" style="margin-top:18px">Demo data is <b>' + esc(d.demo.state) + '</b> (' + d.demo.counts.users + ' demo people). Manage it in the Demo data tab.</p>';
      });
    }

    function feedback() {
      return UI.api('list_feedback', null).then(function (d) {
        var items = d.items.filter(function (i) { return fbFilter === 'all' || i.status === fbFilter; });
        body.innerHTML = '<div class="ui-row" style="margin-bottom:16px"><div class="ui-seg">' + [['new', 'New'], ['read', 'Read'], ['done', 'Done'], ['all', 'All']].map(function (f) {
          var n = f[0] === 'all' ? d.items.length : d.counts[f[0]];
          return '<button data-filter="' + f[0] + '" class="' + (fbFilter === f[0] ? 'on' : '') + '">' + f[1] + ' (' + n + ')</button>';
        }).join('') + '</div></div>' +
          (items.length ? '<div class="ad-fb">' + items.map(function (i) {
            var c = i.context || {};
            return '<div class="ui-item" data-id="' + esc(i.id) + '"><div class="meta"><span class="ui-badge ' + (i.kind === 'bug' ? 'bad' : i.kind === 'idea' ? 'brand' : '') + '">' + esc(i.kind_label) + '</span>' +
              '<b>' + esc(i.name) + '</b>' + (i.email ? '<a href="mailto:' + esc(i.email) + '">' + esc(i.email) + '</a>' : '') + '<span>' + esc(UI.fmtDateTime(i.created)) + '</span></div>' +
              '<p class="msg">' + esc(i.message) + '</p>' +
              '<div class="ctx">' + esc([c.page, c.screen, c.theme, c.browser].filter(Boolean).join(' · ')) + '</div>' +
              '<textarea data-note placeholder="Private note (only admins see it)">' + esc(i.note) + '</textarea>' +
              '<div class="ui-row" style="margin-top:10px">' + ['new', 'read', 'done'].map(function (s) {
                return '<button class="ui-btn sm' + (i.status === s ? ' primary' : '') + '" data-status="' + s + '">' + s[0].toUpperCase() + s.slice(1) + '</button>';
              }).join('') + '<span class="ui-spacer"></span><button class="ui-btn sm danger" data-del-fb>' + UI.icon('trash') + 'Delete</button></div></div>';
          }).join('') + '</div>'
            : '<div class="ui-empty">' + UI.icon('inbox') + '<h3>No ' + (fbFilter === 'all' ? '' : fbFilter + ' ') + 'messages</h3><p>Messages from the "Send feedback" form show up here.</p></div>');
      });
    }

    function users(query) {
      return UI.api('list_users', query || null).then(function (d) {
        body.innerHTML = '<form class="ui-row" data-search style="margin-bottom:14px"><input type="search" name="q" placeholder="Search by name or email" value="' + esc(query || '') + '" style="max-width:360px">' +
          '<button class="ui-btn" type="submit">' + UI.icon('search') + 'Search</button><span class="muted small">' + UI.plural(d.total, 'person', 'people') + '</span></form>' +
          '<table class="ad-users"><thead><tr><th>Name</th><th>Email</th><th>Joined</th><th>Admin</th><th>Active</th></tr></thead><tbody>' +
          d.users.map(function (u) {
            return '<tr data-id="' + esc(u.id) + '"><td><b>' + esc(u.name) + '</b></td><td class="email">' + esc(u.email) + '</td><td class="joined muted">' + esc(UI.fmtDate(u.joined)) + '</td>' +
              '<td><label class="ui-check"><input type="checkbox" data-admin' + (u.is_admin ? ' checked' : '') + '> Admin</label></td>' +
              '<td><label class="ui-check"><input type="checkbox" data-enabled' + (u.enabled ? ' checked' : '') + '> Active</label></td></tr>';
          }).join('') + '</tbody></table>';
      });
    }

    function demo() {
      return UI.api('admin_overview').then(function (d) {
        var c = d.demo.counts;
        body.innerHTML = '<div class="ui-card ui-narrow" style="margin:0"><h3>Demo data</h3>' +
          '<p class="muted">Example people and content, so the app never looks empty for the first visitors. Demo rows are flagged, so removing them never touches real data. Once removed, it stays removed until you load it again.</p>' +
          '<p>Status: <b>' + esc(d.demo.state) + '</b> · ' + Object.keys(c).map(function (k) { return c[k] + ' ' + esc(k); }).join(', ') + '</p>' +
          '<div class="ui-row"><button class="ui-btn primary" data-demo="load">' + UI.icon('refresh') + (d.demo.state === 'loaded' ? 'Reload demo data' : 'Load demo data') + '</button>' +
          '<button class="ui-btn danger" data-demo="remove">' + UI.icon('trash') + 'Remove demo data</button></div></div>';
      });
    }

    var withDemo = true;
    function stage() {
      return UI.api('admin_stage_stats', withDemo).then(function (d) {
        var bar = function (n, max) { return '<span style="display:inline-block;height:8px;border-radius:9px;background:var(--c-brand);width:' + Math.round(n / Math.max(1, max) * 160) + 'px;vertical-align:middle;margin-right:8px"></span>'; };
        var vmax = Math.max.apply(null, d.venues.map(function (v) { return v.n; }).concat([1])), dmax = Math.max.apply(null, d.drills.map(function (v) { return v.n; }).concat([1]));
        body.innerHTML = '<label class="ui-check" style="margin-bottom:14px"><input type="checkbox" data-withdemo' + (withDemo ? ' checked' : '') + '> Include demo speakers</label>' +
          '<div class="ad-stats">' + [[d.sessions, 'sessions'], [MB.num(d.minutes), 'minutes on stage'], [d.speakers, 'speakers'], [d.avg == null ? '–' : d.avg, 'average Stage Confidence']].map(function (x) {
            return '<div class="ui-card ui-stat"><b>' + x[0] + '</b><span>' + x[1] + '</span></div>'; }).join('') + '</div>' +
          '<div class="ui-grid two" style="margin-top:16px"><div class="ui-card"><h3>Rooms</h3>' + d.venues.map(function (v) { return '<div class="small" style="margin:6px 0">' + bar(v.n, vmax) + esc(v.name) + ' · ' + v.n + '</div>'; }).join('') +
          '<h3 style="margin-top:16px">Where</h3><p class="small muted">' + Object.keys(d.modes).map(function (k) { return (k === 'vr' ? 'VR' : k === 'ar' ? 'Passthrough' : 'Screen') + ': ' + d.modes[k]; }).join(' · ') + '</p></div>' +
          '<div class="ui-card"><h3>Drills</h3>' + d.drills.map(function (v) { return '<div class="small" style="margin:6px 0">' + bar(v.n, dmax) + esc(v.name) + ' · ' + v.n + '</div>'; }).join('') + '</div></div>' +
          '<div class="ui-card" style="margin-top:16px"><h3>Average score per skill</h3>' + MB.bars(d.parts.map(function (p) { return { label: p.label, icon: MB.C && MB.C.partBy[p.key] ? MB.C.partBy[p.key].icon : 'sparkle', score: p.avg }; })) + '</div>' +
          '<h3 style="margin-top:22px">Latest sessions</h3><table class="ad-users"><thead><tr><th>Speaker</th><th>Talk</th><th>Room</th><th>Score</th></tr></thead><tbody>' +
          d.recent.map(function (r) { return '<tr><td><b>' + esc(r.who) + '</b>' + (r.demo ? ' <span class="ui-badge">Demo</span>' : '') + '<div class="small muted">' + esc(UI.ago(r.created)) + '</div></td><td>' + esc(r.title) + '</td><td class="joined">' + esc(r.venue) + ' · ' + (r.mode || 'flat') + '</td><td><span class="mb-score ' + MB.scoreClass(r.confidence) + '">' + (r.confidence == null ? '–' : r.confidence) + '</span></td></tr>'; }).join('') +
          '</tbody></table>';
      });
    }
    var DRAW = { overview: overview, stage: function () { return MB.content().then(stage); }, feedback: feedback, users: users, demo: demo };

    view.addEventListener('click', function (e) {
      var f = e.target.closest('[data-filter]');
      if (f) { fbFilter = f.getAttribute('data-filter'); feedback(); return; }
      var st = e.target.closest('[data-status]');
      if (st) {
        var card = st.closest('[data-id]');
        UI.api('set_feedback_status', card.getAttribute('data-id'), st.getAttribute('data-status'), card.querySelector('[data-note]').value).then(function () { UI.toast('Saved', 'ok'); feedback(); });
        return;
      }
      var del = e.target.closest('[data-del-fb]');
      if (del) {
        UI.confirm({ title: 'Delete this message?', ok: 'Delete', danger: true }).then(function (yes) {
          if (yes) UI.api('delete_feedback', del.closest('[data-id]').getAttribute('data-id')).then(feedback);
        });
        return;
      }
      var dm = e.target.closest('[data-demo]');
      if (dm) {
        var load = dm.getAttribute('data-demo') === 'load';
        UI.confirm({ title: load ? 'Load the demo data?' : 'Remove the demo data?', text: load ? 'Demo people and content are added (any old demo rows are replaced).' : 'Every demo row is deleted. Real data stays.', ok: load ? 'Load' : 'Remove', danger: !load })
          .then(function (yes) { if (yes) UI.busy(dm, UI.api(load ? 'demo_load' : 'demo_remove')).then(function () { UI.toast('Done', 'ok'); demo(); }); });
      }
    });
    view.addEventListener('change', function (e) {
      if (e.target.matches('[data-withdemo]')) { withDemo = e.target.checked; stage(); return; }
      var row = e.target.closest('tr[data-id]');
      if (!row) return;
      var id = row.getAttribute('data-id'), box = e.target;
      var fn = box.hasAttribute('data-admin') ? 'set_admin' : box.hasAttribute('data-enabled') ? 'set_enabled' : null;
      if (fn) UI.api(fn, id, box.checked).then(function () { UI.toast('Saved', 'ok'); }, function (err) { box.checked = !box.checked; UI.toast(err.message, 'error'); });
    });
    view.addEventListener('submit', function (e) {
      if (e.target.matches('[data-search]')) { e.preventDefault(); users(UI.formData(e.target).q); }
    });
    return DRAW[tab]();
  });
})();

/* ===== auth.html ===== */
(function () {
  var esc = UI.esc;
  function pw(name, auto) {
    return '<div class="au-pw"><input type="password" name="' + name + '" autocomplete="' + auto + '" required minlength="8">' +
      '<button type="button" data-show>Show</button></div>';
  }
  UI.page('auth', { title: 'Sign in', auth: 'guest' }, function (view, ctx) {
    var mode = ['signup', 'reset'].indexOf(ctx.args[0]) >= 0 ? ctx.args[0] : 'login';
    function draw(msg, isErr) {
      var heading = { login: 'Welcome back', signup: 'Create your account', reset: 'Reset your password' }[mode];
      var sub = { login: 'Sign in to continue to ' + esc(UI.config.name) + '.', signup: 'It\'s free and takes a few seconds.',
        reset: 'We\'ll email you a link to choose a new password.' }[mode];
      view.innerHTML = '<div class="au-wrap"><div class="ui-card au-card">' +
        '<h1>' + heading + '</h1><p class="muted">' + sub + '</p>' +
        (mode !== 'reset' ? '<div class="ui-seg" role="tablist"><button type="button" data-mode="login" class="' + (mode === 'login' ? 'on' : '') + '">Sign in</button>' +
          '<button type="button" data-mode="signup" class="' + (mode === 'signup' ? 'on' : '') + '">Create account</button></div>' : '<div style="height:14px"></div>') +
        '<form class="ui-stack" data-form="' + mode + '" novalidate>' +
        (mode === 'signup' ? '<label class="ui-field"><span>Your name</span><input type="text" name="name" autocomplete="name" required maxlength="60"></label>' : '') +
        '<label class="ui-field"><span>Email</span><input type="email" name="email" autocomplete="email" required></label>' +
        (mode === 'login' ? '<label class="ui-field"><span>Password</span>' + pw('password', 'current-password') + '</label>' : '') +
        (mode === 'signup' ? '<label class="ui-field"><span>Password <em>(at least 8 characters)</em></span>' + pw('password', 'new-password') + '</label>' +
          (window.LegalKit ? '<div>' + LegalKit.consentField() + '</div>' : '') : '') +
        '<div data-msg role="alert"' + (msg ? ' class="' + (isErr ? 'ui-error' : 'ui-note') + '">' + esc(msg) : ' hidden>') + '</div>' +
        '<button class="ui-btn primary block" type="submit">' + { login: 'Sign in', signup: 'Create account', reset: 'Send the link' }[mode] + '</button></form>' +
        '<div class="au-links">' + (mode === 'login' ? '<a data-mode="reset">Forgot your password?</a>' : '<a data-mode="login">' + UI.icon('back') + ' Back to sign in</a>') +
        '<a href="#landing" data-go="landing">About ' + esc(UI.config.name) + '</a></div></div></div>';
      var first = view.querySelector('input');
      if (first && !msg) first.focus();
    }
    view.addEventListener('click', function (e) {
      var m = e.target.closest('[data-mode]');
      if (m) { e.preventDefault(); mode = m.getAttribute('data-mode'); history.replaceState(null, '', '#auth' + (mode === 'login' ? '' : '/' + mode)); draw(); return; }
      var s = e.target.closest('[data-show]');
      if (s) { var i = s.parentNode.querySelector('input'); i.type = i.type === 'password' ? 'text' : 'password'; s.textContent = i.type === 'password' ? 'Show' : 'Hide'; }
    });
    view.addEventListener('submit', function (e) {
      e.preventDefault();
      var form = e.target, v = UI.formData(form);
      var problem = !/^\S+@\S+\.\S+$/.test(v.email || '') ? 'Please enter a valid email address.'
        : mode !== 'reset' && (v.password || '').length < (mode === 'signup' ? 8 : 1) ? (mode === 'signup' ? 'Please choose a password of at least 8 characters.' : 'Please enter your password.')
        : mode === 'signup' && (v.name || '').trim().length < 2 ? 'Please tell us your name.' : null;
      if (problem) { say(problem, true); return; }
      if (mode === 'signup' && window.LegalKit && !LegalKit.consentChecked(form)) return;  // the kit shows its own message
      UI.busy(form.querySelector('[type=submit]'), UI.auth(mode, v)).then(function (r) {
        if (mode === 'reset' || (r && !r.me)) { mode = 'login'; draw(r && r.message, false); restore({ email: v.email }); }
        else UI.toast(mode === 'signup' ? 'Welcome to ' + UI.config.name + '!' : 'Welcome back!', 'ok');
      }, function (err) { say(err.message, true); });
    });
    function say(msg, isErr) {
      var box = view.querySelector('[data-msg]');
      box.className = isErr ? 'ui-error' : 'ui-note'; box.textContent = msg; box.hidden = false;
    }
    function restore(v) {
      ['name', 'email'].forEach(function (k) { var i = view.querySelector('[name=' + k + ']'); if (i && v[k]) i.value = v[k]; });
    }
    draw();
  });
})();

/* ===== drills.html ===== */
(function () {
  var esc = UI.esc;
  UI.page('drills', { title: 'Drills', nav: 'Drills', icon: 'dumbbell', order: 30, when: function () { return !!UI.me; } }, function (view, ctx) {
    var tab = ctx.args[0] === 'handbook' ? 'handbook' : 'gym';
    view.innerHTML = '<div class="ui-wrap"><div class="ui-skel" style="height:240px"></div></div>';
    function head(c) {
      return '<div class="ui-page-head"><div><div class="eyebrow">' + (tab === 'gym' ? 'The speaking gym' : 'The speaker\'s handbook') + '</div>' +
        '<h1>' + (tab === 'gym' ? 'Short reps, big gains' : 'Everything they don\'t tell you') + '</h1><p class="muted">' +
        (tab === 'gym' ? 'One to four minutes each. Every drill trains one or two things and shows a live meter for them.' : 'Short, practical advice. Read one, then go and try it on stage.') + '</p></div></div>' +
        '<nav class="ui-tabs"><a href="#drills" class="' + (tab === 'gym' ? 'on' : '') + '">' + UI.icon('dumbbell') + 'Drills</a><a href="#drills/handbook" class="' + (tab === 'handbook' ? 'on' : '') + '">' + UI.icon('book') + 'Handbook</a></nav>';
    }
    function gym(c, prog, home) {
      var done = {};
      (prog && prog.drills || []).forEach(function (k) { done[k] = true; });
      var pick = home && home.weak ? home.weak.drill : null;
      var sorted = c.drills.slice().sort(function (a, b) { return (b.key === pick) - (a.key === pick); });
      return '<div class="dr-grid">' + sorted.map(function (d) {
        return '<article class="ui-card dr-card' + (d.key === pick ? ' pick' : '') + '">' + (d.key === pick ? '<span class="flag">For you</span>' : '') +
          '<div class="top"><span class="ic">' + UI.icon(d.icon) + '</span><div><h3>' + esc(d.name) + '</h3><span class="min">' + (d.minutes < 1 ? Math.round(d.minutes * 60) + ' seconds' : d.minutes + ' min') + ' · ' + esc(MB.venueName(d.venue)) + '</span></div></div>' +
          '<p>' + esc(d.blurb) + '</p>' +
          (d.focus.length ? '<div class="chips">' + d.focus.map(function (k) { var p = c.partBy[k]; return '<span class="ui-badge brand dr-part">' + UI.icon(p.icon) + esc(p.label) + '</span>'; }).join('') + '</div>' : '<div class="chips"><span class="ui-badge good">Calm</span></div>') +
          '<div class="ui-row"><a class="ui-btn primary sm" href="#stage/drill:' + d.key + '" data-go="stage/drill:' + d.key + '">' + UI.icon('play') + 'Start</a>' +
          (done[d.key] ? '<span class="dr-done">' + UI.icon('check') + ' Done before</span>' : '') + '</div></article>';
      }).join('') + '</div>';
    }
    function handbook(c) {
      return '<div class="hb">' + c.handbook.map(function (sec) {
        return '<section class="ui-card hb-sec"><h2>' + UI.icon(sec.icon) + esc(sec.title) + '</h2>' + sec.tips.map(function (t, i) {
          return '<details' + (i === 0 ? ' open' : '') + '><summary>' + esc(t[0]) + '</summary><p>' + esc(t[1]) + '</p></details>';
        }).join('') + '</section>';
      }).join('') + '</div>' +
        '<div class="ui-card" style="margin-top:18px"><h3>What is "confidence", really?</h3><p class="muted" style="margin:0">People hear confidence as a blend: a steady, unhurried pace; pauses that let ideas land; ' +
        'few ums; a voice that carries and moves in pitch; statements that end down and firm; eyes on the room. MrBigStage measures each of these separately (' +
        c.parts.map(function (p) { return esc(p.label.toLowerCase()); }).join(', ') + ') and blends them, weighted by how much listeners notice them, into one Stage Confidence score.</p></div>';
    }
    return Promise.all([MB.content(), ctx.me ? UI.apiQuiet('get_progress') : Promise.resolve(null), ctx.me ? UI.apiQuiet('get_home') : Promise.resolve(null)]).then(function (r) {
      view.innerHTML = '<div class="ui-wrap">' + head(r[0]) + (tab === 'gym' ? gym(r[0], r[1], r[2]) : handbook(r[0])) + '</div>';
    });
  });
})();

/* ===== home.html ===== */
(function () {
  var esc = UI.esc;
  function greet() { var h = new Date().getHours(); return h < 5 ? 'Late night' : h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'; }
  MB.sessRow = function (s) {
    var cls = MB.scoreClass(s.confidence);
    return '<a class="ui-card bs-sess" href="#report/' + esc(s.id) + '" data-go="report/' + esc(s.id) + '"><span class="sc ' + cls + '">' + (s.confidence == null ? '✓' : s.confidence) + '</span>' +
      '<div><b>' + esc(s.title) + '</b><span class="m">' + esc(MB.venueName(s.venue)) + ' · ' + MB.fmtMins(s.seconds) + ' · ' + esc(UI.ago(s.created)) + (s.mode === 'vr' ? ' · VR' : '') + '</span></div>' +
      UI.icon('arrow') + '</a>';
  };

  UI.page('home', { title: 'Backstage', nav: 'Backstage', icon: 'home', auth: 'user', order: 10 }, function (view, ctx) {
    view.innerHTML = '<div class="ui-wrap"><div class="ui-skel" style="height:260px"></div></div>';
    function draw(d, c) {
      var me = ctx.me, first = d.sessions === 0, lv = d.level;
      var pct = lv.to ? Math.round((lv.xp - lv.from) / (lv.to - lv.from) * 100) : 100;
      var talk = d.talks[0];
      var hero = '<section class="bs-hero"><div class="ui-wrap"><div><div class="eyebrow">' + esc(greet()) + ', ' + esc(me.name.split(' ')[0]) + '</div>' +
        '<h1>' + (first ? 'Your stage <em>is ready.</em>' : d.streak > 1 ? 'Day ' + d.streak + '. <em>Keep it going.</em>' : 'Back on <em>the red circle?</em>') + '</h1>' +
        '<p>' + (first ? 'Pick a talk, choose a room from a boardroom to a 5,000-seat arena, and speak. We listen to your pace, pauses, fillers, pitch, volume and where you look, then coach you.'
          : talk ? 'Next up: <b style="color:#f3efe8">' + esc(talk.title) + '</b>' + (talk.best != null ? ', best so far ' + talk.best + '.' : '.') : 'Write a talk, or warm up with a drill.') + '</p>' +
        '<div class="ui-row" style="margin-top:20px">' + (talk ? '<a class="ui-btn primary lg" href="#stage/' + esc(talk.id) + '" data-go="stage/' + esc(talk.id) + '">' + UI.icon('mic') + 'Practise “' + esc(talk.title.length > 22 ? talk.title.slice(0, 21) + '…' : talk.title) + '”</a>'
          : '<a class="ui-btn primary lg" href="#stage/sample" data-go="stage/sample">' + UI.icon('play') + 'Try the sample talk</a>') +
        '<button class="ui-btn lg" data-quickstart>' + UI.icon('sparkle') + 'Something else</button></div></div>' +
        '<div class="bs-level"><div class="lv"><span class="num">' + lv.n + '</span><div><b>' + esc(lv.name) + '</b><span>' + MB.num(lv.xp) + ' XP' + (lv.next ? ' · ' + MB.num(lv.to - lv.xp) + ' to ' + esc(lv.next) : ' · top level') + '</span></div></div>' +
        '<div class="bs-xp"><i style="width:' + pct + '%"></i></div>' +
        '<div class="bs-mini"><div><b>' + (d.streak ? '🔥 ' + d.streak : '0') + '</b><span>day streak</span></div><div><b>' + d.sessions + '</b><span>sessions</span></div><div><b>' + MB.num(d.audience) + '</b><span>people faced</span></div></div>' +
        '<div class="ui-row between" style="color:#a8a199;font-size:.86rem"><span>' + d.badges + ' of ' + d.badges_total + ' badges</span><a href="#progress" data-go="progress" style="color:#ff6a5c">Your progress →</a></div></div></div></section>';

      var left = [], right = [];
      if (first || !d.goal) {
        left.push('<section class="bs-sec"><h2>What brings you to the stage?</h2><div class="bs-goals">' + c.goals.map(function (g) {
          return '<button class="bs-goal' + (d.goal === g.key ? ' on' : '') + '" data-goal="' + g.key + '"><b>' + esc(g.name) + '</b><small>' + esc(g.blurb) + '</small></button>';
        }).join('') + '</div></section>');
      }
      if (first) {
        left.push('<section class="bs-sec"><h2>Three ways to start</h2><div class="bs-first">' +
          '<a class="ui-card" href="#stage/sample" data-go="stage/sample">' + UI.icon('play') + '<b>Sample talk</b><span class="muted small">Six short cards on the Red Circle. Two minutes.</span></a>' +
          '<a class="ui-card" href="#talks/new" data-go="talks/new">' + UI.icon('cards') + '<b>Your own talk</b><span class="muted small">Start from a template or paste your script.</span></a>' +
          '<a class="ui-card" href="#stage/drill:breathe" data-go="stage/drill:breathe">' + UI.icon('lungs') + '<b>Just breathe</b><span class="muted small">Nervous? Two minutes of box breathing in the empty theatre.</span></a></div></section>');
      }
      left.push('<section class="bs-sec"><h2>Your talks <a href="#talks" data-go="talks">All talks (' + d.talk_count + ')</a></h2>' +
        (d.talks.length ? '<div class="ui-list">' + d.talks.map(function (t) {
          return '<div class="ui-card bs-talk"><div><h3>' + esc(t.title) + '</h3><div class="meta"><span>' + t.target_min + ' min</span><span>' + UI.plural(t.cards.length, 'card') + '</span><span>' + esc(MB.venueName(t.venue)) + '</span>' +
            (t.practiced ? '<span>practised ' + UI.plural(t.practiced, 'time') + '</span>' : '<span>not practised yet</span>') + (t.best != null ? '<span class="mb-score ' + MB.scoreClass(t.best) + '">best ' + t.best + '</span>' : '') + '</div></div>' +
            '<a class="ui-btn primary" href="#stage/' + esc(t.id) + '" data-go="stage/' + esc(t.id) + '">' + UI.icon('mic') + 'Practise</a></div>';
        }).join('') + '</div>' : '<div class="ui-empty">' + UI.icon('cards') + '<h3>No talks yet</h3><p>Start from a template: a toast, a pitch, a big-idea talk…</p><a class="ui-btn primary" href="#talks/new" data-go="talks/new">' + UI.icon('plus') + 'New talk</a></div>') + '</section>');
      left.push('<section class="bs-sec"><h2>Recent sessions ' + (d.recent.length ? '<a href="#progress" data-go="progress">History</a>' : '') + '</h2>' +
        (d.recent.length ? '<div class="ui-list">' + d.recent.map(MB.sessRow).join('') + '</div>' : '<div class="ui-empty">' + UI.icon('mic') + '<h3>Nothing yet</h3><p>Your reports show up here after your first time on stage.</p></div>') + '</section>');

      if (d.trend.length >= 2) {
        var lastC = d.trend[d.trend.length - 1], firstC = d.trend[0];
        right.push('<section class="ui-card bs-sec"><h2>Stage Confidence</h2><div class="ui-row between"><div><span class="mb-score ' + MB.scoreClass(lastC) + '" style="font-size:2.2rem">' + lastC + '</span>' +
          '<div class="muted small">' + (lastC >= firstC ? '+' : '') + (lastC - firstC) + ' since ' + UI.plural(d.trend.length, 'session') + ' ago</div></div>' + MB.spark(d.trend, 170, 56) + '</div></section>');
      }
      if (d.weak) {
        var dr = c.drillBy[d.weak.drill];
        right.push('<section class="ui-card bs-sec"><h2>Work on this</h2><div class="bs-work"><span class="big">' + d.weak.avg + '</span><div><b>' + esc(d.weak.label) + '</b><div class="muted small">your lowest score lately</div></div></div>' +
          (dr ? '<p class="muted" style="margin-top:12px">' + esc(dr.blurb) + '</p><a class="ui-btn primary block" href="#stage/drill:' + dr.key + '" data-go="stage/drill:' + dr.key + '">' + UI.icon(dr.icon) + esc(dr.name) + ' · ' + (dr.minutes < 1 ? Math.round(dr.minutes * 60) + ' s' : dr.minutes + ' min') + '</a>' : '') + '</section>');
      }
      if (d.nerves.length >= 2) {
        right.push('<section class="ui-card bs-sec"><h2>Nerves, before → after</h2><div class="bs-nerves">' + d.nerves.map(function (n) {
          return '<div title="' + esc(c.nerves[n[0]] + ' → ' + c.nerves[n[1]]) + '"><i style="height:' + n[0] * 20 + '%"></i><i class="a" style="height:' + n[1] * 20 + '%"></i></div>';
        }).join('') + '</div><p class="muted small" style="margin:8px 0 0">Grey before, green after each session. Shorter green bars = the stage calmed you down.</p></section>');
      }
      right.push('<section class="ui-card bs-sec bs-tip"><div class="eyebrow">Tip of the day</div><h3>' + esc(d.tip.title) + '</h3><p class="muted" style="margin:0">' + esc(d.tip.text) + '</p>' +
        '<a class="small" href="#drills/handbook" data-go="drills/handbook" style="display:inline-block;margin-top:10px">The speaker\'s handbook →</a></section>');

      view.innerHTML = hero + '<div class="ui-wrap"><div class="bs-grid"><div class="bs-col">' + left.join('') + '</div><div class="bs-col">' + right.join('') + '</div></div></div>';
    }
    view.addEventListener('click', function (e) {
      var g = e.target.closest('[data-goal]');
      if (!g) return;
      UI.api('set_goal', g.getAttribute('data-goal')).then(function () {
        view.querySelectorAll('[data-goal]').forEach(function (x) { x.classList.toggle('on', x === g); });
        UI.toast('Goal saved. We\'ll tailor your tips.', 'ok');
      });
    });
    return Promise.all([UI.api('get_home'), MB.content()]).then(function (r) { draw(r[0], r[1]); });
  });
})();

/* ===== landing.html ===== */
(function () {
  var COPY = {
    eyebrow: 'Public speaking, rehearsed in VR',
    title: 'Own the <em>big stage.</em>',
    lead: 'Step onto a theatre stage, a boardroom or a 5,000-seat arena in VR, give your talk to a crowd that reacts, and get coached on how you really sound: pace, pauses, ums, melody, volume and eye contact.',
    cta: 'Start free',
    proof: ['Works on Meta Quest and in any browser', 'Your voice never leaves your device', 'Free'],
    stepsTitle: 'From nervous to keynote, one rep at a time',
    stepsLead: 'Five minutes a day is enough. The stage does the rest.',
    steps: [['Write your talk as cue cards', 'Start from a template (wedding toast, pitch, interview answer, big-idea talk) or paste your script.'],
            ['Walk onto the red circle', 'Pick a room and a crowd: warm, neutral or tough. Breathe in the green room, then speak. Cards in your hand, a monitor at your feet.'],
            ['Get a report, then get better', 'A Stage Confidence score, ten skills, a second-by-second timeline, your recording and three things to try next.']],
    featuresTitle: 'Packed for practice',
    features: [['cards', 'Cue cards & teleprompter', 'Swipe cards on your controller, read a floor monitor, or let a teleprompter follow your voice and wait when you pause.'],
               ['users', 'A crowd that reacts', 'Engaged people lean in and nod. Bored ones check their phones. Look at a section and it wakes up.'],
               ['zap', 'Distractions on demand', 'Coughs, a ringing phone, latecomers, mic squeal. Learn to keep going.'],
               ['hand', 'Q&A from the floor', 'Hands go up at the end. Interview panels ask the questions you dread.'],
               ['dumbbell', 'A speaking gym', 'Eleven short drills: the power pause, filler zapper, pitch ladder, lighthouse eye contact, table topics…'],
               ['lungs', 'Calm before the storm', 'Box breathing in an empty theatre, and a nerves check before and after every talk.'],
               ['trend', 'Progress you can see', 'Levels from Open Mic to Legend, badges, streaks, and how many people you\'ve faced.'],
               ['lock', 'Private by design', 'We analyse your voice inside your browser. Only the numbers are saved; recordings stay on your device.'],
               ['eye', 'VR or not', 'Best in a headset. On a laptop or phone, look around with the mouse and practise all the same.']],
    faq: [['What does "confidence" mean here?', 'Listeners hear confidence as a mix of things, so we measure each one: your pace (words a minute and whether you rush), pauses, hesitation sounds, volume and projection, pitch variety (melody vs monotone), steadiness and timbre (shaky or breathy vs full), how your sentences end (rising like a question or fading), eye contact and gestures, and timing. Each gets a score; the Stage Confidence score blends them, weighted by how much audiences notice them.'],
          ['Do I need a VR headset?', 'No. It\'s built for Meta Quest and other WebXR headsets (open the site in the headset\'s browser and press Enter VR), but it works on any computer or phone too. On a flat screen, eye contact is measured by where you look with the mouse.'],
          ['Is my voice recorded or uploaded?', 'Your microphone is analysed live inside your browser. We save only the numbers (like your pace and how many pauses you made). If you turn on recording, the audio stays in your browser so you can listen back; it is never sent to us.'],
          ['How accurate is it?', 'It\'s a coach, not a lab. Pace and pauses are close; hesitation sounds and sentence endings are good estimates. The most useful thing is the trend: the same measurements, every time, so you can see yourself improve.'],
          ['Can I try it without an account?', 'Yes. Try the sample talk or any drill right now. An account (free) saves your talks, reports and progress.'],
          ['Who is it for?', 'Anyone who has to speak: a wedding toast, a job interview, a class presentation, a team update, a conference talk, or just being less scared of putting your hand up.']],
    bandTitle: 'The audience is waiting.',
    bandLead: 'Two minutes, one sample talk, no account needed.'
  };

  function heroArt() {
    // an inline SVG theatre: spotlight, red circle, a speaker, rows of faces
    var rows = '', R = 7;
    for (var r = 0; r < 6; r++) {
      var y = 318 + r * 36, n = 13 + r * 2, w = 470 + r * 26, x0 = 300 - w / 2;
      for (var k = 0; k < n; k++) {
        var x = x0 + (k + 0.5) * (w / n), hue = (k * 37 + r * 53) % 7, u = (x - 300) / (w / 2), yy = y - u * u * (40 + r * 4);
        var col = ['#2b2f3a', '#7a1f1f', '#1f3d5a', '#3d3d3d', '#5a3d6b', '#22543d', '#8a6d3b'][hue];
        var tone = ['#f1c9a8', '#d9a27c', '#a86b47', '#6b3f26', '#eac0a2'][(k + r * 3) % 5];
        var s = 0.8 + r * 0.12;
        rows += '<g transform="translate(' + x.toFixed(1) + ' ' + yy.toFixed(1) + ') scale(' + s.toFixed(2) + ')"><path d="M-11 22 Q-11 6 0 6 Q11 6 11 22Z" fill="' + col + '"/><circle cy="-1" r="7" fill="' + tone + '"/>' +
          ((k + r) % 9 === 4 ? '<rect x="-4" y="9" width="8" height="11" rx="1.5" fill="#cfe4ff" opacity=".9"/>' : '') + '</g>';
      }
    }
    void R;
    return '<div class="lp-art" aria-hidden="true"><svg viewBox="0 0 600 520"><defs>' +
      '<linearGradient id="lpSpot" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffb547" stop-opacity=".55"/><stop offset="1" stop-color="#ffb547" stop-opacity="0"/></linearGradient>' +
      '<radialGradient id="lpDot" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#ff4a3d"/><stop offset="1" stop-color="#c41e14"/></radialGradient></defs>' +
      '<rect x="40" y="40" width="250" height="140" rx="4" fill="#141417" stroke="#26262c"/><text x="64" y="104" fill="#f3efe8" font-family="Archivo, Arial Black" font-weight="900" font-size="30">Courage is</text><text x="64" y="140" fill="#f3efe8" font-family="Archivo, Arial Black" font-weight="900" font-size="30">a muscle.</text><circle cx="62" cy="64" r="6" fill="#e62b1e"/>' +
      '<text x="360" y="92" fill="#e62b1e" font-family="Archivo, Arial Black" font-weight="900" font-size="40" letter-spacing="-1">BIG STAGE</text>' +
      '<path d="M268 0h64l90 255H178z" fill="url(#lpSpot)"/>' +
      '<ellipse cx="300" cy="250" rx="130" ry="30" fill="url(#lpDot)"/>' +
      '<g transform="translate(300 140)"><circle cy="0" r="16" fill="#f1c9a8"/><path d="M-8 -12 Q0 -22 10 -12 Q14 -4 13 0 Q4 -8 -12 -3Z" fill="#2b1d14"/><path d="M-22 108 L-19 30 Q-17 18 -4 18 H4 Q17 18 19 30 L22 108Z" fill="#f3efe8"/>' +
      '<path d="M19 34 L40 18" stroke="#f3efe8" stroke-width="9" stroke-linecap="round"/><path d="M-19 36 L-30 62" stroke="#f3efe8" stroke-width="9" stroke-linecap="round"/><rect x="-27" y="60" width="16" height="11" rx="2" fill="#fbf7ef" transform="rotate(-20 -19 65)"/></g>' +
      rows + '</svg>' +
      '<div class="lp-score">' + MB.ring(84, 62) + '<div><b>Compelling</b><span>Pace 92 · Pauses 88</span></div></div>' +
      '<div class="lp-nudge">Nice pause ✓</div></div>';
  }

  UI.page('landing', { title: 'Practise speeches in VR' }, function (view, ctx) {
    var me = ctx.me, C = COPY, esc = UI.esc;
    var primary = me ? '<a class="ui-btn primary lg" href="#home" data-go="home">Backstage ' + UI.icon('arrow') + '</a><button class="ui-btn lg" data-quickstart>' + UI.icon('mic') + 'Go on stage</button>'
      : '<a class="ui-btn primary lg" href="#stage/sample" data-go="stage/sample">' + UI.icon('play') + 'Try it now, no account</a>' +
        '<a class="ui-btn lg" href="#auth/signup" data-go="auth/signup">' + esc(C.cta) + '</a>';
    return MB.content().then(function (c) {
      var mix = c.parts.map(function (p, i) { return '<i style="width:' + p.weight + '%;background:' + ['#e62b1e', '#ff6a5c', '#ffb547', '#c27400', '#2ee59d', '#18845a', '#5b8def', '#b46bdf', '#8a847c', '#3d3d3d'][i] + '" title="' + esc(p.label + ' ' + p.weight + '%') + '"></i>'; }).join('');
      view.innerHTML =
        '<section class="lp-hero"><div class="ui-wrap"><div>' +
          '<div class="eyebrow">' + esc(C.eyebrow) + '</div><h1>' + C.title + '</h1><p class="lp-lead">' + esc(C.lead) + '</p>' +
          '<div class="lp-cta">' + primary + '</div>' +
          '<div class="lp-proof">' + C.proof.map(function (p) { return '<span>' + UI.icon('check') + esc(p) + '</span>'; }).join('') + '</div>' +
        '</div>' + heroArt() + '</div>' +
        '<div class="lp-counters"><div class="ui-wrap"><div><b data-c="sessions">–</b><span>talks given</span></div><div><b data-c="minutes">–</b><span>minutes on stage</span></div><div><b data-c="audience">–</b><span>audience members faced</span></div></div></div></section>' +
        '<section class="lp-section"><div class="ui-wrap"><div class="lp-head"><div class="eyebrow">Confidence, decoded</div><h2>Is it the timbre? The cadence? The pauses?</h2>' +
          '<p>All of it. Audiences hear confidence as a blend, so we listen for ten things and weigh them by how much people notice them.</p></div>' +
          '<div class="lp-parts">' + c.parts.map(function (p) { return '<div class="ui-card lp-part">' + UI.icon(p.icon) + '<h3>' + esc(p.label) + '</h3><p>' + esc(p.what) + '</p><div class="w">' + p.weight + '% of the score</div></div>'; }).join('') + '</div>' +
          '<div class="lp-mix" aria-hidden="true">' + mix + '</div></div></section>' +
        '<section class="lp-section" style="padding-top:0"><div class="ui-wrap"><div class="lp-head"><div class="eyebrow">Seven rooms</div><h2>From three people to five thousand</h2><p>Practise where you\'ll actually speak, or somewhere much scarier.</p></div>' +
          '<div class="lp-venues">' + c.venues.map(function (v) { return '<div class="lp-venue" style="background:' + v.colors[0] + ';--dot:' + v.colors[1] + '"><b>' + esc(v.name) + '</b><span>' + MB.num(v.max) + (v.max > 1 ? ' people' : ' person') + '</span></div>'; }).join('') + '</div></div></section>' +
        '<section class="lp-section" id="how" style="padding-top:0"><div class="ui-wrap"><div class="lp-head"><h2>' + esc(C.stepsTitle) + '</h2><p>' + esc(C.stepsLead) + '</p></div>' +
          '<div class="lp-steps">' + C.steps.map(function (s) { return '<div class="ui-card lp-step"><h3>' + esc(s[0]) + '</h3><p class="muted">' + esc(s[1]) + '</p></div>'; }).join('') + '</div></div></section>' +
        '<section class="lp-section" style="padding-top:0"><div class="ui-wrap"><div class="lp-head"><h2>' + esc(C.featuresTitle) + '</h2></div>' +
          '<div class="ui-grid">' + C.features.map(function (f) { return '<div class="ui-card lp-feature">' + UI.icon(f[0]) + '<h3>' + esc(f[1]) + '</h3><p>' + esc(f[2]) + '</p></div>'; }).join('') + '</div></div></section>' +
        '<section class="lp-section" style="padding-top:0"><div class="ui-wrap"><div class="lp-head"><h2>Questions</h2></div><div class="lp-faq">' +
          C.faq.map(function (q) { return '<details><summary>' + esc(q[0]) + '</summary><p>' + esc(q[1]) + '</p></details>'; }).join('') + '</div></div></section>' +
        '<section class="lp-section" style="padding-top:0"><div class="ui-wrap"><div class="lp-band"><div><h2>' + esc(C.bandTitle) + '</h2><p>' + esc(C.bandLead) + '</p></div>' +
          '<a class="ui-btn primary lg" href="#stage/sample" data-go="stage/sample">' + UI.icon('play') + 'Take the stage</a>' +
        '</div></div></section>';
      UI.apiQuiet('stage_stats').then(function (s) {
        ['sessions', 'minutes', 'audience'].forEach(function (k) { var el = view.querySelector('[data-c="' + k + '"]'); if (el) el.textContent = MB.num(s[k]); });
      }).catch(function () {});
    });
  });
})();

/* ===== profile.html ===== */
(function () {
  var esc = UI.esc;
  UI.page('profile', { title: 'Your profile', auth: 'user' }, function (view, ctx) {
    var me = ctx.me;
    view.innerHTML = '<div class="ui-wrap ui-narrow"><div class="pf-head"><span class="ui-avatar">' + esc(UI.initials(me.name)) + '</span>' +
      '<div><h1>' + esc(me.name) + '</h1><div class="muted">' + esc(me.email) + (me.joined ? ' · member since ' + esc(UI.fmtDate(me.joined, { month: 'long', year: 'numeric' })) : '') + '</div></div></div>' +
      '<div class="pf-grid"><form class="ui-card ui-stack" data-name><h3>Your name</h3><label class="ui-field"><span>On your reports and the stage screen</span>' +
      '<input type="text" name="name" value="' + esc(me.name) + '" maxlength="60" required></label><button class="ui-btn primary" type="submit">Save</button></form>' +
      '<div class="ui-card ui-stack"><h3>Appearance</h3><p class="muted small">Follow your device, or pick one.</p><div data-theme-box></div>' +
      '<h3 style="margin-top:22px">Password</h3><p class="muted small">We\'ll email you a link to choose a new one.</p>' +
      '<button class="ui-btn" data-reset>' + UI.icon('mail') + 'Email me a reset link</button></div></div>' +
      '<form class="ui-card ui-stack" style="margin-top:16px" data-speaker><h3>Speaker settings</h3><div data-spbody><div class="ui-skel" style="min-height:120px"></div></div></form>' +
      '<div class="ui-card ui-stack" style="margin-top:16px"><h3>Recordings on this device</h3><p class="muted small" data-tapes>Recordings of your voice stay in this browser and are never uploaded. We keep the last 12.</p>' +
      '<div><button type="button" class="ui-btn danger" data-cleartapes>' + UI.icon('trash') + 'Delete all recordings</button></div></div>' +
      '<div class="ui-card" style="margin-top:16px"><div class="pf-links">' +
      (me.is_admin ? '<a href="#admin" data-go="admin">' + UI.icon('shield') + 'Admin</a>' : '') +
      '<button data-feedback>' + UI.icon('chat') + 'Send feedback</button>' +
      '<button data-lk-open="overview">' + UI.icon('lock') + 'Privacy &amp; Terms, and your data</button>' +
      '<button data-signout-here>' + UI.icon('logout') + 'Sign out</button></div></div></div>';
    function themeBox() {
      var t = UI.theme();
      view.querySelector('[data-theme-box]').innerHTML = '<div class="ui-seg">' + [['auto', 'Auto'], ['light', 'Light'], ['dark', 'Dark']].map(function (o) {
        return '<button type="button" data-theme-pick="' + o[0] + '" class="' + (t === o[0] ? 'on' : '') + '">' + o[1] + '</button>';
      }).join('') + '</div>';
    }
    themeBox();
    function speaker() {
      return Promise.all([UI.apiQuiet('get_home'), MB.content()]).then(function (r) {
        var d = r[0], c = r[1], p = d.prefs;
        var sel = function (name, list, cur) { return '<select name="' + name + '">' + list.map(function (o) { return '<option value="' + o.key + '"' + (o.key === cur ? ' selected' : '') + '>' + esc(o.name) + '</option>'; }).join('') + '</select>'; };
        view.querySelector('[data-spbody]').className = 'ui-stack';
        view.querySelector('[data-spbody]').innerHTML = '<div class="pf-grid">' +
          '<label class="ui-field"><span>Why you’re here</span>' + sel('goal', [{ key: '', name: 'Choose a goal…' }].concat(c.goals), d.goal || '') + '</label>' +
          '<label class="ui-field"><span>Favourite room</span>' + sel('venue', c.venues, p.venue) + '</label>' +
          '<label class="ui-field"><span>Notes on stage</span>' + sel('prompter', c.prompters, p.prompter) + '</label>' +
          '<label class="ui-field"><span>Live coach</span>' + sel('coach', c.coach, p.coach) + '</label></div>' +
          '<label class="ui-field"><span>Filler words to count <em>(with the transcript on)</em></span><input type="text" name="fillers_list" maxlength="300" value="' + esc(p.fillers_list) + '"></label>' +
          '<label class="ui-check"><input type="checkbox" name="record"' + (p.record ? ' checked' : '') + '> Record my voice so I can listen back (kept on this device only)</label>' +
          (MB.Transcript.supported ? '<label class="ui-check"><input type="checkbox" name="transcript"' + (p.transcript ? ' checked' : '') + '> Transcript for filler words (sends your speech to your browser’s speech service while you talk)</label>' : '') +
          '<div><button class="ui-btn primary" type="submit">Save settings</button></div>';
      });
    }
    speaker();
    MB.Tapes.count().then(function (n) { var el = view.querySelector('[data-tapes]'); if (el) el.textContent = UI.plural(n || 0, 'recording') + ' kept in this browser. They are never uploaded. We keep the last 12.'; });
    view.querySelector('[data-speaker]').addEventListener('submit', function (e) {
      e.preventDefault();
      var v = UI.formData(e.target), btn = e.target.querySelector('[type=submit]');
      var calls = [UI.api('save_prefs', { venue: v.venue, prompter: v.prompter, coach: v.coach, fillers_list: v.fillers_list, record: !!v.record, transcript: !!v.transcript })];
      if (v.goal) calls.push(UI.api('set_goal', v.goal));
      UI.busy(btn, Promise.all(calls)).then(function () { UI.toast('Settings saved', 'ok'); });
    });
    view.addEventListener('click', function (e) {
      var t = e.target.closest('[data-theme-pick]');
      if (t) { UI.setTheme(t.getAttribute('data-theme-pick')); themeBox(); UI.renderChrome(); return; }
      if (e.target.closest('[data-reset]')) {
        UI.busy(e.target.closest('[data-reset]'), UI.auth('reset', { email: me.email })).then(function (r) { UI.toast(r.message, 'ok'); });
      }
      if (e.target.closest('[data-signout-here]')) UI.auth('logout');
      if (e.target.closest('[data-cleartapes]')) UI.confirm({ title: 'Delete every recording?', text: 'Only the recordings in this browser. Your reports stay.', ok: 'Delete', danger: true }).then(function (yes) {
        if (yes) MB.Tapes.clear().then(function () { UI.toast('Recordings deleted'); var el = view.querySelector('[data-tapes]'); if (el) el.textContent = 'No recordings kept in this browser.'; });
      });
    });
    view.querySelector('[data-name]').addEventListener('submit', function (e) {
      e.preventDefault();
      var v = UI.formData(e.target);
      UI.busy(e.target.querySelector('[type=submit]'), UI.api('update_profile', v.name)).then(function (r) {
        UI.setMe(r.me); ctx.me = r.me; UI.toast('Saved', 'ok');
        view.querySelector('.pf-head h1').textContent = r.me.name;
      });
    });
  });
})();

/* ===== progress.html ===== */
(function () {
  var esc = UI.esc;
  function trendChart(trend) {
    if (trend.length < 2) return '<p class="muted">Two sessions and your line appears here.</p>';
    var W = 640, H = 200, pad = 28, n = trend.length;
    var X = function (i) { return pad + i / (n - 1) * (W - pad - 10); }, Y = function (v) { return H - 22 - v / 100 * (H - 40); };
    var o = '<svg class="pg-chart" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Stage Confidence over time">';
    [25, 50, 75, 100].forEach(function (g) { o += '<line x1="' + pad + '" x2="' + (W - 10) + '" y1="' + Y(g) + '" y2="' + Y(g) + '" stroke="var(--c-line)"/><text x="0" y="' + (Y(g) + 3) + '">' + g + '</text>'; });
    o += '<rect x="' + pad + '" y="' + Y(100) + '" width="' + (W - pad - 10) + '" height="' + (Y(78) - Y(100)) + '" fill="var(--c-good)" opacity=".07"/>';
    var d = trend.map(function (t, i) { return (i ? 'L' : 'M') + X(i).toFixed(1) + ' ' + Y(t.c).toFixed(1); }).join('');
    o += '<path d="' + d + ' L' + X(n - 1) + ' ' + Y(0) + ' L' + X(0) + ' ' + Y(0) + 'Z" fill="var(--c-brand)" opacity=".08"/><path d="' + d + '" fill="none" stroke="var(--c-brand)" stroke-width="2.5" stroke-linejoin="round"/>';
    trend.forEach(function (t, i) { o += '<circle cx="' + X(i).toFixed(1) + '" cy="' + Y(t.c).toFixed(1) + '" r="4.5" fill="var(--c-surface)" stroke="var(--c-brand)" stroke-width="2" data-go="report/' + esc(t.id) + '"><title>' + esc(t.title) + ': ' + t.c + ' (' + UI.fmtDate(t.when) + ')</title></circle>'; });
    o += '<text x="' + pad + '" y="' + H + '">' + esc(UI.fmtDate(trend[0].when, { day: 'numeric', month: 'short' })) + '</text><text x="' + (W - 10) + '" y="' + H + '" text-anchor="end">' + esc(UI.fmtDate(trend[n - 1].when, { day: 'numeric', month: 'short' })) + '</text>';
    return o + '</svg>';
  }
  function nervesChart(list, c) {
    if (list.length < 2) return '<p class="muted">Rate your nerves before and after a few sessions to see the trend.</p>';
    var W = 360, H = 150, n = list.length, X = function (i) { return 30 + i / (n - 1) * (W - 40); }, Y = function (v) { return 14 + (v - 1) / 4 * (H - 40); };
    var line = function (k, col) { var pts = list.map(function (x, i) { return x[k] ? X(i).toFixed(1) + ',' + Y(x[k]).toFixed(1) : null; }).filter(Boolean); return pts.length > 1 ? '<polyline points="' + pts.join(' ') + '" fill="none" stroke="' + col + '" stroke-width="2.5" stroke-linejoin="round"/>' : ''; };
    var o = '<svg class="pg-chart" viewBox="0 0 ' + W + ' ' + H + '">';
    [1, 3, 5].forEach(function (v) { o += '<text x="0" y="' + (Y(v) + 3) + '">' + ['', '😌', '', '😬', '', '😱'][v] + '</text>'; });
    o += line('before', 'var(--c-faint)') + line('after', 'var(--c-good)') + '</svg>';
    return o + '<div class="mb-legend"><span><i style="background:var(--c-faint)"></i>Before</span><span><i style="background:var(--c-good)"></i>After</span></div>';
  }

  function nervesLine(list) {
    var b = list.filter(function (x) { return x.before; }).map(function (x) { return x.before; }), a = list.filter(function (x) { return x.after; }).map(function (x) { return x.after; });
    if (!b.length || !a.length) return '';
    var mb = MB.mean(b), ma = MB.mean(a);
    return '<p class="muted small">On a scale of 1 (calm) to 5 (terrified): ' + mb.toFixed(1) + ' before, ' + ma.toFixed(1) + ' after.' + (mb - ma >= 0.3 ? ' The stage calms you down.' : '') + '</p>';
  }
  UI.page('progress', { title: 'Progress', nav: 'Progress', icon: 'trend', auth: 'user', order: 40 }, function (view) {
    view.innerHTML = '<div class="ui-wrap"><div class="ui-skel" style="height:240px"></div></div>';
    return Promise.all([UI.api('get_progress'), UI.api('list_sessions', 200), MB.content()]).then(function (r) {
      var d = r[0], hist = r[1], c = r[2], lv = d.level, t = d.totals;
      var pct = lv.to ? Math.round((lv.xp - lv.from) / (lv.to - lv.from) * 100) : 100;
      var stat = function (v, label) { return '<div class="ui-card ui-stat"><b>' + v + '</b><span>' + esc(label) + '</span></div>'; };
      var maxN = Math.max(1, Math.max.apply(null, d.calendar.map(function (x) { return x.n; })));
      var firstDow = new Date(d.calendar[0].day + 'T12:00:00').getDay();
      var cal = '<div class="pg-cal">' + new Array(firstDow + 1).join('<i style="visibility:hidden"></i>') + d.calendar.map(function (x) {
        var l = x.n === 0 ? '' : x.n / maxN > 0.66 ? 'l3' : x.n / maxN > 0.33 ? 'l2' : 'l1';
        return '<i class="' + l + '" title="' + esc(UI.fmtDate(x.day)) + ': ' + UI.plural(x.n, 'session') + '"></i>';
      }).join('') + '</div>';
      var parts = d.parts.map(function (p) { var pp = c.partBy[p.key]; return { label: p.label, icon: pp.icon, score: p.now, mark: p.first }; });
      view.innerHTML = '<div class="ui-wrap"><div class="ui-page-head"><div><div class="eyebrow">Your progress</div><h1>Every rep is evidence</h1>' +
        '<p class="muted">Confidence comes from proof that you can do it. Here\'s yours.</p></div></div>' +
        '<div class="pg-top"><div class="ui-card pg-level"><span class="n">' + lv.n + '</span><div><b>' + esc(lv.name) + '</b><br><span>' + MB.num(lv.xp) + ' XP' + (lv.next ? ' · ' + MB.num(lv.to - lv.xp) + ' to ' + esc(lv.next) : '') + '</span></div><div class="bar"><i style="width:' + pct + '%"></i></div>' +
        '<span>XP: 10 a session, 8 a minute on stage, and a bonus for your score.</span></div>' +
        '<div class="pg-stats">' + stat(t.sessions, 'sessions') + stat(MB.num(t.minutes) + ' min', 'on stage') + stat(MB.num(t.audience), 'people faced') +
        stat(t.best == null ? '–' : t.best, 'best score') + stat((d.streak ? '🔥 ' : '') + d.streak, 'day streak (best ' + d.best_streak + ')') + stat(t.venues + ' / 7', 'rooms played') + '</div></div>' +
        '<div class="pg-two"><section class="ui-card"><h2 style="font-size:1.15rem">Stage Confidence over time</h2>' + trendChart(d.trend) + '</section>' +
        '<section class="ui-card"><h2 style="font-size:1.15rem">Practice calendar</h2>' + cal + '<p class="muted small" style="margin:8px 0 0">The last 12 weeks. Little and often beats a cram the night before.</p></section></div>' +
        '<div class="pg-two"><section class="ui-card"><h2 style="font-size:1.15rem">Your skills, then and now</h2>' + MB.bars(parts) +
        '<p class="muted small" style="margin:10px 0 0">Bars: your last five sessions. Tick: your first five.</p></section>' +
        '<section class="ui-card"><h2 style="font-size:1.15rem">Nerves, before and after</h2>' + nervesChart(d.nerves, c) +
        nervesLine(d.nerves) + '</section></div>' +
        '<section class="pg-sec"><h2>Badges · ' + Object.keys(d.earned).length + ' of ' + d.badges.length + '</h2><div class="pg-badges">' + d.badges.map(function (b) {
          return '<div class="pg-badge' + (b.earned ? ' on' : '') + '"><span class="md">' + UI.icon(b.icon) + '</span><b>' + esc(b.name) + '</b><small>' + (b.earned ? 'Earned ' + esc(UI.fmtDate(b.earned)) : esc(b.how)) + '</small></div>';
        }).join('') + '</div></section>' +
        '<section class="pg-sec"><h2>History · ' + hist.total + '</h2>' + (hist.sessions.length ? '<div class="ui-list">' + hist.sessions.map(MB.sessRow).join('') + '</div>'
          : '<div class="ui-empty">' + UI.icon('mic') + '<h3>No sessions yet</h3><p>Your first talk starts the story.</p><button class="ui-btn primary" data-quickstart>' + UI.icon('mic') + 'Go on stage</button></div>') + '</section></div>';
    });
  });
})();

/* ===== report.html ===== */
(function () {
  var esc = UI.esc;
  UI.page('report', { title: 'Report', auth: null }, function (view, ctx) {
    var id = ctx.args[0] || 'guest', guest = id === 'guest';
    if (!guest && !ctx.me) { UI.after = location.hash; UI.go('auth'); return Promise.resolve(); }
    view.innerHTML = '<div class="ui-wrap"><div class="ui-skel" style="height:300px"></div></div>';

    function fromGuest() {
      var g = null;
      try { g = JSON.parse(sessionStorage.getItem('mb.guestReport') || 'null'); } catch (e) {}
      if (!g) return null;
      var p = g.payload, sc = g.score;
      return { id: 'guest', title: p.title, venue: p.venue, crowd: p.crowd, mode: p.mode, seconds: p.metrics.secs, confidence: sc.confidence, created: new Date().toISOString(),
        parts: sc.parts, metrics: p.metrics, timeline: g.timeline || {}, band: sc.band, tips: sc.tips, strengths: sc.strengths, facts: sc.facts, before: null, reflection: '',
        kind: p.kind, drill: p.drill, talk_id: null, guest: true };
    }

    function draw(d, c) {
      var m = d.metrics || {}, f = d.facts || {}, p = d.parts || {}, before = d.before;
      var delta = before && d.confidence != null && before.confidence != null ? d.confidence - before.confidence : null;
      var again = d.drill ? 'stage/drill:' + d.drill : d.talk_id ? 'stage/' + d.talk_id : d.kind === 'sample' ? 'stage/sample' : 'stage/free';
      var hero = '<section class="rp-hero"><div class="ui-wrap">' + (d.confidence == null ? '<div style="font-size:4rem">🫁</div>' : MB.ring(d.confidence, 150, d.band ? d.band.name : '')) +
        '<div><div class="eyebrow">' + (d.guest ? 'Preview report' : 'Report · ' + esc(UI.fmtDateTime(d.created))) + '</div><h1>' + esc(d.title) + '</h1>' +
        '<p>' + esc(d.band ? d.band.line : 'No voice score for this one.') + '</p>' +
        '<div class="meta"><span>' + esc(MB.venueName(d.venue)) + '</span><span>' + MB.num(d.crowd) + ' people</span><span>' + MB.fmtSecs(d.seconds) + '</span>' +
        '<span>' + (d.mode === 'vr' ? 'In VR' : d.mode === 'ar' ? 'Passthrough' : 'On screen') + '</span>' + (d.mood ? '<span>' + esc(d.mood) + ' crowd</span>' : '') + '</div></div>' +
        (delta != null ? '<div class="rp-delta"><b class="' + (delta >= 0 ? 'up' : 'down') + '">' + (delta >= 0 ? '+' : '') + delta + '</b><span>vs your last run<br>(' + before.confidence + ')</span></div>' : '<div></div>') +
        '</div></section>';

      var rows = c.parts.map(function (pp) {
        return { key: pp.key, label: pp.label, icon: pp.icon, score: p[pp.key] == null ? null : p[pp.key], mark: before && before.parts && before.parts[pp.key] != null ? before.parts[pp.key] : null };
      });
      var partsHtml = '<section class="ui-card rp-sec rp-parts"><h2>What we heard and saw</h2>' + MB.bars(rows).replace(/<div class="mb-bar(?!s)/g, '<div data-part class="mb-bar') +
        '<p class="muted small" style="margin:12px 0 0">Tap a line to see what it measures. ' + (before ? 'The thin tick is your previous run. ' : '') + 'A dash means it couldn\'t be judged this time (for example eye contact needs VR or looking around with the mouse).</p></section>';

      var tl = d.timeline || {};
      var timeline = '<section class="ui-card rp-sec" style="grid-column:1/-1"><h2>Your talk, second by second</h2>' + '<div class="mb-tlwrap">' + MB.timeline(tl, { cursor: true }) + '</div>' + MB.timelineLegend(!!(tl.gaze && tl.gaze.length)) +
        '<div class="rp-audio" data-audio></div></section>';

      var tips = (d.tips || []).length ? '<section class="ui-card rp-sec"><h2>Your coach says</h2><div class="rp-tips">' + d.tips.map(function (t) {
        var dr = c.drillBy[t.drill];
        return '<div class="rp-tip"><span class="sc">' + t.score + '</span><div><b>' + esc(t.label) + '</b><p>' + esc(t.text) + '</p>' +
          (dr ? '<a class="ui-btn sm" href="#stage/drill:' + dr.key + '" data-go="stage/drill:' + dr.key + '">' + UI.icon(dr.icon) + 'Drill: ' + esc(dr.name) + '</a>' : '') + '</div></div>';
      }).join('') + '</div>' + ((d.strengths || []).length ? '<h3 style="margin-top:18px">Keep doing</h3><div class="rp-strip">' + d.strengths.map(function (s) { return '<span class="ui-badge good">' + esc(s.label) + ' ' + s.score + '</span>'; }).join('') + '</div>' : '') + '</section>'
        : '<section class="ui-card rp-sec"><h2>Your coach says</h2><p class="muted">' + (d.confidence == null ? 'Nothing to coach here: this one was about calming down.' : 'Every part scored 88 or more. Spellbinding. Try a tougher crowd or a bigger room.') + '</p></section>';

      var num = function (v, label) { return '<div class="rp-num"><b>' + v + '</b><span>' + esc(label) + '</span></div>'; };
      var r1 = function (x, k) { return x == null ? '–' : (Math.round(x * Math.pow(10, k || 0)) / Math.pow(10, k || 0)); };
      var nums = [num(f.wpm != null ? f.wpm : '–', 'words a minute'), num(r1(f.fillers_pm, 1), 'hesitations a minute'), num(r1(f.pauses_pm, 1), 'pauses a minute'),
        num(m.pause_longest != null ? r1(m.pause_longest, 1) + ' s' : '–', 'longest pause'), num(m.start_delay != null ? r1(m.start_delay, 1) + ' s' : '–', 'before your first word'),
        num(f.speak_share != null ? Math.round(f.speak_share * 100) + '%' : '–', 'of the time speaking'),
        num(m.pitch_med ? Math.round(m.pitch_med) + ' Hz' : '–', 'voice pitch' + (f.voice ? ' (' + f.voice + ')' : '')), num(m.pitch_range != null ? r1(m.pitch_range, 1) + ' st' : '–', 'pitch range (semitones)'),
        num(m.monotone_share != null ? Math.round(m.monotone_share * 100) + '%' : '–', 'flat, monotone stretches'),
        num(m.vol_snr != null ? Math.round(m.vol_snr) + ' dB' : '–', 'above the room noise'), num(f.timbre ? esc(f.timbre) : '–', 'timbre (brightness)'),
        num(m.clarity != null ? Math.round(m.clarity * 100) + '%' : '–', 'voice clarity (vs breathy)'),
        num(m.phrases ? (m.uptalk || 0) + ' / ' + m.phrases : '–', 'sentences rising like a question'), num(m.phrases ? (m.trail || 0) + ' / ' + m.phrases : '–', 'sentences fading out')];
      if (m.distractions) nums.push(num((m.recovered || 0) + ' / ' + m.distractions, 'distractions you talked through'));
      if (m.questions) nums.push(num(m.questions, 'questions answered'));
      if (m.beacons) nums.push(num((m.beacons_hit || 0) + ' / ' + m.beacons, 'lighthouse people found'));
      if (m.tracked_hands) nums.push(num(Math.round((m.gest_share || 0) * 100) + '%', 'time gesturing'), num(r1(m.sway, 2) + ' m/s', 'swaying'));
      var eyes = '';
      if (m.tracked_gaze) {
        var col = function (v) { return 'rgba(230,43,30,' + (0.15 + v * 0.85).toFixed(2) + ')'; };
        eyes = '<h3 style="margin-top:18px">Where you looked</h3><div class="rp-eyes">' + [['Left', m.gaze_l], ['Centre', m.gaze_c], ['Right', m.gaze_r]].map(function (x) {
          return '<div style="background:' + col(x[1] || 0) + '">' + x[0] + '<br>' + Math.round((x[1] || 0) * 100) + '%</div>';
        }).join('') + '</div><p class="muted small" style="margin:0">' + Math.round((m.gaze_aud || 0) * 100) + '% of the time on the audience, ' + Math.round((m.gaze_down || 0) * 100) + '% on your notes' +
          (m.gaze_back ? ', ' + Math.round(m.gaze_back) + ' s with your back turned' : '') + '. ' + r1(m.holds_pm, 1) + ' held looks a minute.</p>';
      }
      var fw = m.filler_words && Object.keys(m.filler_words).length ? '<h3 style="margin-top:18px">Filler words (transcript)</h3><div class="rp-strip">' +
        Object.keys(m.filler_words).sort(function (a, b) { return m.filler_words[b] - m.filler_words[a]; }).map(function (w) { return '<span class="ui-badge warn">“' + esc(w) + '” × ' + m.filler_words[w] + '</span>'; }).join('') + '</div>' : '';
      var numbers = '<section class="ui-card rp-sec"><h2>The numbers</h2><div class="rp-nums">' + nums.join('') + '</div>' + eyes + fw + '</section>';

      var nerves = d.nerves_before || d.nerves_after ? '<div class="rp-nv">' + (d.nerves_before ? '<span>Before <b>' + ['', '😌', '🙂', '😬', '😰', '😱'][d.nerves_before] + '</b></span>' : '') +
        (d.nerves_after ? '<span>→ After <b>' + ['', '😌', '🙂', '😬', '😰', '😱'][d.nerves_after] + '</b></span>' : '') + '</div>' : '';
      var reflect = d.guest ? '<section class="ui-card rp-sec"><h2>Save your progress</h2><p class="muted">This report lives only in this tab. With a free account every run is saved, compared with the last one and counted towards levels and badges.</p>' +
        '<a class="ui-btn primary" href="#auth/signup" data-go="auth/signup">' + UI.icon('arrow') + 'Create a free account</a></section>'
        : '<section class="ui-card rp-sec"><h2>Notes to self</h2>' + nerves + '<form data-reflect class="ui-stack" style="margin-top:10px"><textarea name="text" maxlength="1000" placeholder="What went well? One thing to change next time?">' + esc(d.reflection || '') + '</textarea>' +
          '<div class="ui-row"><button class="ui-btn" type="submit">' + UI.icon('check') + 'Save note</button><span class="ui-spacer"></span><button type="button" class="ui-btn ghost danger sm" data-delrep>' + UI.icon('trash') + 'Delete report</button></div></form></section>';

      view.innerHTML = hero + '<div class="ui-wrap"><div class="ui-row" style="margin-bottom:16px"><a class="ui-btn primary" href="#' + again + '" data-go="' + again + '">' + UI.icon('refresh') + 'Practise again</a>' +
        (d.guest ? '' : '<a class="ui-btn" href="#progress" data-go="progress">' + UI.icon('trend') + 'All progress</a>') + '</div>' +
        '<div class="rp-grid">' + partsHtml + tips + timeline + numbers + reflect + '</div></div>';

      // part explanations
      view.querySelectorAll('[data-part]').forEach(function (el, i) {
        el.addEventListener('click', function () {
          var nx = el.nextElementSibling;
          if (nx && nx.classList.contains('rp-why')) { nx.remove(); return; }
          var pp = c.parts[i], w = document.createElement('div');
          w.className = 'rp-why';
          w.innerHTML = '<p><b>What it measures.</b> ' + esc(pp.what) + '</p><p style="margin:0"><b>What good sounds like.</b> ' + esc(pp.ideal) + '</p>';
          el.parentNode.insertBefore(w, el.nextSibling);
        });
      });
      // the recording kept on this device
      MB.Tapes.get(d.id).then(function (rec) {
        var box = view.querySelector('[data-audio]'); if (!box) return;
        if (!rec || !rec.blob) { box.innerHTML = '<span class="muted small">' + UI.icon('mic') + ' Recordings are kept in this browser only. Turn on "Record my voice" before a talk to listen back here.</span>'; return; }
        var url = URL.createObjectURL(rec.blob);
        box.innerHTML = '<audio controls preload="metadata" src="' + url + '" data-aud></audio><button class="ui-btn ghost sm" data-deltape>' + UI.icon('trash') + 'Delete recording</button>';
        var au = box.querySelector('[data-aud]'), cur = view.querySelector('.mb-tl-cursor'), secs = (tl.vol || []).length * (tl.step || 1);
        au.addEventListener('timeupdate', function () {
          if (!cur || !secs || !isFinite(au.currentTime)) return;
          var x = 34 + Math.min(1, au.currentTime / secs) * (1000 - 44);
          cur.setAttribute('x1', x); cur.setAttribute('x2', x);
        });
        box.querySelector('[data-deltape]').onclick = function () { MB.Tapes.del(d.id).then(function () { URL.revokeObjectURL(url); box.innerHTML = '<span class="muted small">Recording deleted.</span>'; }); };
      });
    }

    view.addEventListener('submit', function (e) {
      if (!e.target.matches('[data-reflect]')) return;
      e.preventDefault();
      UI.busy(e.target.querySelector('[type=submit]'), UI.api('set_reflection', id, e.target.text.value)).then(function () { UI.toast('Note saved', 'ok'); });
    });
    view.addEventListener('click', function (e) {
      if (!e.target.closest('[data-delrep]')) return;
      UI.confirm({ title: 'Delete this report?', text: 'Its score leaves your progress too. This can\'t be undone.', ok: 'Delete', danger: true }).then(function (yes) {
        if (yes) UI.api('delete_session', id).then(function () { MB.Tapes.del(id); UI.toast('Deleted'); UI.go('progress'); });
      });
    });

    if (guest) {
      return MB.content().then(function (c) {
        var g = fromGuest();
        if (!g) { view.innerHTML = '<div class="ui-wrap"><div class="ui-empty">' + UI.icon('mic') + '<h3>No report yet</h3><p>Give a talk first: it takes two minutes.</p><a class="ui-btn primary" href="#stage/sample" data-go="stage/sample">Try the sample talk</a></div></div>'; return; }
        draw(g, c);
      });
    }
    return Promise.all([UI.api('get_report', id), MB.content()]).then(function (r) { draw(r[0].report, r[1]); });
  });
})();

/* ===== stage.html ===== */
(function () {
  'use strict';
  var esc = UI.esc;
  var NERVE_FACES = ['', '😌', '🙂', '😬', '😰', '😱'];

  UI.page('stage', { title: 'On stage', chrome: false }, function (view, ctx) {
    var ref = ctx.args[0] || 'sample';
    var isPublic = ref === 'sample' || ref === 'free' || ref.indexOf('drill:') === 0;
    if (!isPublic && !ctx.me) { UI.after = '#stage/' + ref; UI.go('auth'); return Promise.resolve(); }
    var TEST = window.MB_TEST || null;

    view.innerHTML = '<div class="st" data-st><canvas class="st-cv" data-cv></canvas>' +
      '<div class="st-top" data-hud hidden><span class="st-live"><i></i>Live</span><span class="st-title" data-ttl></span>' +
      '<span class="st-clock" data-clock>0:00</span><button class="st-btn red" data-end>' + UI.icon('check') + 'Finish</button></div>' +
      '<div class="st-coach" data-coach hidden></div><div class="st-nudge" data-nudge></div><div class="st-center" data-center></div>' +
      '<div class="st-cue" data-cue hidden><button class="st-btn" data-prev aria-label="Previous card">' + UI.icon('back') + '</button>' +
      '<div class="st-cuecard" data-cuecard></div><button class="st-btn" data-next aria-label="Next card">' + UI.icon('arrow') + '</button></div>' +
      '<div class="st-look" data-look hidden>Drag to look around the room · ← → cards · E to finish</div>' +
      '<div class="st-panel" data-panel><div class="st-card"><div class="st-eyebrow"><i></i>Loading the stage</div><h1>Setting up the room…</h1><p>Lights, seats, a crowd of people. One moment.</p></div></div></div>';
    var $ = function (s) { return view.querySelector(s); };
    var cv = $('[data-cv]'), panel = $('[data-panel]');

    var alive = true, T, C, info, S, talk, drill, cards = [], renderer, scene, camera, venue = null, audio = MB.CrowdAudio();
    var state = 'loading', mode = 'flat', session = null, xrOK = { vr: false, ar: false };
    var voice = null, stream = null, recorder = null, chunks = [], tape = null, transcript = null;
    var nervesBefore = null, nervesAfter = null, listeners = [];
    var look = { yaw: 0, pitch: 0, drag: null }, clock = { t0: 0, now: 0 };
    var R = null;   // the running talk
    function on(target, ev, fn, opt) { target.addEventListener(ev, fn, opt); listeners.push([target, ev, fn, opt]); }

    /* ---------------------------------------------------------------- settings */
    function guestPrefs() { return UI.store.get('guestPrefs', {}); }
    function savePrefs() {
      var p = { venue: S.venue, mood: S.mood, prompter: S.prompter, coach: S.coach, fill: S.fill, distractions: S.distractions, qa: S.qa,
        record: S.record, transcript: S.transcript, house_lights: S.house_lights, applause: S.applause };
      if (ctx.me) UI.apiQuiet('save_prefs', p).catch(function () {}); else UI.store.set('guestPrefs', p);
    }
    function venueInfo() { return C.venueBy[S.venue] || C.venues[0]; }
    function crowdCount() { var v = venueInfo(); return Math.max(v.min, Math.round(v.max * S.fill)); }

    /* ---------------------------------------------------------------- 3D */
    function init3D() {
      renderer = new T.WebGLRenderer({ canvas: cv, antialias: true, alpha: true, powerPreference: 'high-performance' });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.outputColorSpace = T.SRGBColorSpace;
      renderer.xr.enabled = true;
      renderer.xr.setReferenceSpaceType('local-floor');
      try { renderer.xr.setFoveation(1); } catch (e) {}
      scene = new T.Scene();
      camera = new T.PerspectiveCamera(66, 1, 0.05, 260);
      scene.add(camera);
      resize();
      on(window, 'resize', resize);
      renderer.setAnimationLoop(frame);
    }
    function buildVenue() {
      if (venue) { scene.remove(venue.group); venue.dispose(); }
      venue = MB.Venue(T, { key: S.venue, crowd: crowdCount(), mood: S.mood, houseLights: S.house_lights,
        title: drill ? drill.name : talk.title, subtitle: ctx.me ? ctx.me.name : '' });
      scene.add(venue.group);
      var bg = new T.Color(venue.look.bg);
      scene.background = mode === 'ar' ? null : bg;
      scene.fog = mode === 'ar' ? null : new T.Fog(bg, venue.look.fog[0], venue.look.fog[1]);
      renderer.setClearColor(0x000000, mode === 'ar' ? 0 : 1);
      venue.group.traverse(function (o) { if (mode === 'ar' && o.isMesh && !o.isInstancedMesh && o.geometry && o.geometry.type === 'BoxGeometry' && o.material.side === T.BackSide) o.visible = false; });
      look.pitch = venue.flatCam.pitch;
      drawMonitor(true);
    }
    function resize() {
      if (!renderer || renderer.xr.isPresenting) return;
      var w = view.clientWidth || innerWidth, h = innerHeight;
      renderer.setSize(w, h, false);
      camera.aspect = w / h; camera.fov = w < h ? 82 : 64; camera.updateProjectionMatrix();
    }
    var tmpV, tmpV2, headV, dirV, quat;
    function headPos() { return renderer.xr.isPresenting ? renderer.xr.getCamera().getWorldPosition(headV) : camera.getWorldPosition(headV); }
    function headDir() {
      var cam = renderer.xr.isPresenting ? renderer.xr.getCamera() : camera;
      cam.getWorldQuaternion(quat);
      return dirV.set(0, 0, -1).applyQuaternion(quat);
    }

    /* ---------------------------------------------------------------- the main loop */
    var lastT = performance.now(), mon = { at: 0 };
    function frame() {
      if (!alive) return;
      var nowMs = performance.now(), dt = Math.min(0.1, (nowMs - lastT) / 1000); lastT = nowMs;
      var t = nowMs / 1000;
      if (mode === 'flat' || !renderer.xr.isPresenting) {
        if (state === 'setup' || state === 'mic' || state === 'loading') look.yaw = Math.sin(t * 0.12) * 0.32;
        camera.position.set(0, venue ? venue.flatCam.y : 1.66, 0);
        camera.rotation.set(0, 0, 0, 'YXZ'); camera.rotation.order = 'YXZ';
        camera.rotation.y = -look.yaw; camera.rotation.x = look.pitch;
      }
      if (session) { waitForHead(); xrInput(dt); }
      if (state === 'talk' || state === 'qa') tickTalk(dt);
      else if (state === 'breathe') tickBreathe(dt);
      if (venue) venue.update(dt, t, R ? { gaze: R.gazeNow, q: R.q, silence: voice ? voice.live.silence : 0, t: R.t } : {});
      if (state === 'mic' && voice) micMeter();
      if (vrp.mesh) vrHover();
      if (venue && t - mon.at > 0.15) { mon.at = t; drawMonitor(); }
      renderer.render(scene, camera);
    }

    /* ---------------------------------------------------------------- setup panel */
    function showSetup() {
      state = 'setup';
      $('[data-hud]').hidden = true; $('[data-cue]').hidden = true; $('[data-coach]').hidden = true; $('[data-look]').hidden = true;
      var title = drill ? drill.name : talk.title;
      var cardsN = cards.length;
      var sr = MB.Transcript.supported;
      var venueBtns = C.venues.map(function (v) {
        return '<button class="st-venue' + (v.key === S.venue ? ' on' : '') + '" data-venue="' + v.key + '"><span class="sw">' + v.colors.map(function (c) { return '<i style="background:' + c + '"></i>'; }).join('') + '</span>' +
          '<b>' + esc(v.name) + '</b><small>' + MB.num(v.max) + ' seats</small></button>';
      }).join('');
      var seg = function (name, list, cur) { return '<div class="st-seg" data-seg="' + name + '">' + list.map(function (o) { return '<button data-v="' + o.key + '" class="' + (o.key === cur ? 'on' : '') + '" title="' + esc(o.blurb || '') + '">' + esc(o.name) + '</button>'; }).join('') + '</div>'; };
      var v = venueInfo(), cur = function (list, k) { return (list.filter(function (o) { return o.key === k; })[0] || {}).blurb || ''; };
      var prev = info.previous;
      panel.hidden = false;
      panel.innerHTML = '<div class="st-card" data-setup><div class="st-eyebrow"><i></i>' + (drill ? 'Drill' : ref === 'sample' ? 'Sample talk' : ref === 'free' ? 'Free talk' : 'Your talk') + '</div>' +
        '<h1>' + esc(title) + '</h1>' +
        '<p>' + esc(drill ? drill.blurb : cardsN ? UI.plural(cardsN, 'card') + (talk.target_min ? ' · aim for ' + talk.target_min + ' min' : '') : 'No cards: just you, the room and the clock.') +
        (prev ? ' · Last time <b>' + (prev.last == null ? '–' : prev.last) + '</b>, best <b>' + (prev.best == null ? '–' : prev.best) + '</b>.' : '') + '</p>' +
        (drill && drill.breathing ? '' :
        '<h3>The room</h3><div class="st-venues">' + venueBtns + '</div><p class="st-hint" data-vblurb>' + esc(v.blurb) + '</p>' +
        '<div class="st-grid2"><div><h3>Crowd size: <span data-crowdn>' + MB.num(crowdCount()) + '</span></h3><input class="st-range" type="range" min="0.2" max="1" step="0.05" value="' + S.fill + '" data-fill aria-label="Crowd size"></div>' +
        '<div><h3>The crowd is</h3>' + seg('mood', C.moods, S.mood) + '<p class="st-hint" data-hint-mood>' + esc(cur(C.moods, S.mood)) + '</p></div></div>' +
        '<div class="st-grid2"><div><h3>Your notes</h3>' + seg('prompter', C.prompters, S.prompter) + '<p class="st-hint" data-hint-prompter>' + esc(cur(C.prompters, S.prompter)) + '</p></div>' +
        '<div><h3>Live coach</h3>' + seg('coach', C.coach, S.coach) + '<p class="st-hint" data-hint-coach>' + esc(cur(C.coach, S.coach)) + '</p></div></div>' +
        '<h3>Extras</h3><div class="st-grid2">' +
        '<div>' + C.distractions.map(function (d) { return '<label class="st-check"><input type="checkbox" data-dis="' + d.key + '"' + (S.distractions.indexOf(d.key) >= 0 ? ' checked' : '') + '>' + esc(d.name) + '</label>'; }).join('') + '</div>' +
        '<div><label class="st-check"><input type="checkbox" data-opt="qa"' + (S.qa || (drill && drill.qa) ? ' checked' : '') + (drill && drill.qa ? ' disabled' : '') + '>Questions from the audience at the end</label>' +
        '<label class="st-check"><input type="checkbox" data-opt="applause"' + (S.applause ? ' checked' : '') + '>Applause when you walk on and off</label>' +
        '<label class="st-check"><input type="checkbox" data-opt="house_lights"' + (S.house_lights ? ' checked' : '') + '>House lights up (see faces better)</label>' +
        '<label class="st-check"><input type="checkbox" data-opt="record"' + (S.record ? ' checked' : '') + '>Record my voice to listen back (stays on this device)</label>' +
        (sr ? '<label class="st-check"><input type="checkbox" data-opt="transcript"' + (S.transcript ? ' checked' : '') + '>Transcript for filler words (uses your browser\'s speech service)</label>' : '') +
        '</div></div>') +
        '<div class="st-actions"><button class="st-btn ghost" data-leave>' + UI.icon('back') + 'Leave</button>' +
        '<button class="st-btn red big" data-tomic>' + (drill && drill.breathing ? 'Begin' : 'Next: mic check') + ' ' + UI.icon('arrow') + '</button></div></div>';
    }
    function refreshHints() {
      ['mood', 'prompter', 'coach'].forEach(function (k) {
        var list = k === 'mood' ? C.moods : k === 'prompter' ? C.prompters : C.coach, el = panel.querySelector('[data-hint-' + k + ']');
        if (el) el.textContent = (list.filter(function (o) { return o.key === S[k]; })[0] || {}).blurb || '';
      });
    }
    var rebuildTimer = null;
    function rebuildSoon() { clearTimeout(rebuildTimer); rebuildTimer = setTimeout(function () { if (alive) buildVenue(); }, 180); }

    /* ---------------------------------------------------------------- mic check + green room */
    var mic = { phase: 0, t0: 0, heard: 0, ok: false, err: null, lastDraw: 0 };
    function showMic() {
      state = 'mic';
      panel.hidden = false;
      panel.innerHTML = '<div class="st-card"><div class="st-eyebrow"><i></i>Green room</div><h1>Mic check</h1>' +
        '<div data-micerr></div>' +
        '<div class="st-steps"><div class="st-step on" data-s1><b>1</b>Stay quiet for two seconds while we listen to the room.</div>' +
        '<div class="st-step" data-s2><b>2</b>Now say your first line out loud, like you mean it.</div></div>' +
        '<div class="st-meter"><i data-meter></i></div><p class="st-hint" data-micnote>Listening…</p>' +
        '<h3>How do you feel right now?</h3><div class="st-nerves" data-nerves="before">' + [1, 2, 3, 4, 5].map(function (n) {
          return '<button data-n="' + n + '" class="' + (nervesBefore === n ? 'on' : '') + '"><span>' + NERVE_FACES[n] + '</span>' + esc(C.nerves[n]) + '</button>';
        }).join('') + '</div>' +
        '<label class="st-check" style="margin-top:12px"><input type="checkbox" data-breathefirst>Breathe first: one minute of box breathing in the empty room</label>' +
        '<div class="st-actions"><button class="st-btn ghost" data-backsetup>' + UI.icon('back') + 'Back</button>' +
        (xrOK.ar ? '<button class="st-btn" data-go-ar disabled>' + UI.icon('globe') + 'Audience in my room</button>' : '') +
        (xrOK.vr ? '<button class="st-btn red big" data-go-vr disabled>' + UI.icon('eye') + 'Enter VR</button>' : '') +
        '<button class="st-btn ' + (xrOK.vr ? '' : 'red big') + '" data-go-flat disabled>' + UI.icon('play') + 'Start on this screen</button></div>' +
        (xrOK.vr ? '' : '<p class="st-hint" style="text-align:right">Open this page in a VR headset\'s browser (like Meta Quest) to step onto the stage in VR.</p>') + '</div>';
      mic = { phase: 1, t0: performance.now(), heard: 0, ok: false, lastDraw: 0 };
      if (voice) { enableStart(); return; }
      getMic().then(function () {
        if (!alive) return;
        mic.t0 = performance.now();
      }, function (e) {
        mic.err = e;
        var box = panel.querySelector('[data-micerr]');
        if (box) box.innerHTML = '<div class="st-error"><b>We can\'t hear you.</b> ' + esc(micError(e)) + '</div>';
        var note = panel.querySelector('[data-micnote]'); if (note) note.textContent = 'No microphone.';
      });
    }
    function micError(e) {
      var n = e && e.name;
      if (n === 'NotAllowedError' || n === 'SecurityError') return 'Your browser blocked the microphone. Allow it for this site (the lock or camera icon in the address bar), then try again.';
      if (n === 'NotFoundError') return 'No microphone found. Plug one in or use your headset\'s built-in mic.';
      return 'The microphone didn\'t start (' + (e && e.message || 'unknown error') + ').';
    }
    function getMic() {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return Promise.reject(new Error('This browser has no microphone access.'));
      return navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: false, autoGainControl: false, channelCount: 1 } }).then(function (s) {
        stream = s;
        voice = MB.Voice({ onEvent: onVoiceEvent });
        voice.start(stream);
      });
    }
    function micMeter() {
      var now = performance.now();
      if (now - mic.lastDraw < 60) return;
      mic.lastDraw = now;
      var m = panel.querySelector('[data-meter]'); if (!m) return;
      m.style.width = Math.round(voice.live.level * 100) + '%';
      var el = function (s) { return panel.querySelector(s); };
      if (mic.phase === 1 && now - mic.t0 > (TEST ? 600 : 2000)) {
        voice.calibrate(); mic.phase = 2;
        el('[data-s1]').className = 'st-step ok'; el('[data-s2]').className = 'st-step on';
        el('[data-micnote]').textContent = 'Room noise measured. Now speak.';
        if (TEST) { mic.phase = 3; mic.ok = true; enableStart(); }
      } else if (mic.phase === 2) {
        if (voice.live.speaking && voice.live.snr > 10) mic.heard += 60; else mic.heard = Math.max(0, mic.heard - 20);
        if (mic.heard > 700) {
          mic.phase = 3; mic.ok = true;
          el('[data-s2]').className = 'st-step ok';
          var f = voice.live.pitch, kind = f ? (f < 140 ? 'a low voice' : f < 210 ? 'a middle voice' : 'a high voice') : '';
          el('[data-micnote]').textContent = 'Sounds great' + (kind ? ': ' + kind + ', about ' + Math.round(f) + ' Hz' : '') + '. You\'re ready.';
          enableStart();
        }
      }
    }
    function enableStart() { ['[data-go-vr]', '[data-go-flat]', '[data-go-ar]'].forEach(function (s) { var b = panel.querySelector(s); if (b) b.disabled = false; }); }

    /* ---------------------------------------------------------------- voice events -> crowd, coach, timeline */
    function onVoiceEvent(kind, t, val) {
      if (!R) return;
      if (kind === 'filler') {
        R.fillerTimes.push(t);
        if (S.coach !== 'off' || (drill && drill.live === 'fillers')) { if (drill && drill.key === 'zapper') audio.buzz(); }
        if (S.coach === 'full') nudge('Pause instead of um', false, 'filler');
      } else if (kind === 'pause') {
        if (val >= 0.9 && val <= 2.6 && R.q > 0.5 && Math.random() < 0.6) venue.crowd.nod(0.5);
        if (S.coach === 'full' && val >= 1 && val <= 2.6 && Math.random() < 0.35) nudge('Nice pause', true, 'pause');
      }
    }

    /* ---------------------------------------------------------------- starting */
    function begin(kind) {
      mode = kind;
      if (drill && drill.breathing) return startBreathe();
      if (kind === 'flat') { panel.hidden = true; afterWalkOn(); }
    }
    var wantBreathe = false;
    function afterWalkOn() {
      if (wantBreathe) { wantBreathe = false; return startBreathe(true); }
      walkOn();
    }
    function walkOn() {
      state = 'intro';
      panel.hidden = true;
      audio.init();
      $('[data-look]').hidden = mode !== 'flat';
      var center = $('[data-center]');
      venue.crowd.state = 'intro';
      if (S.applause) { audio.applause(0.55, 3.2); venue.crowd.applaud(0.6, false); voice && (voice.muted = true); }
      else audio.murmur(0.25, 1);
      center.innerHTML = '<div><div class="big">' + esc(drill ? drill.name : talk.title) + '</div><div class="sub">' + (S.applause ? 'They\'re welcoming you. Breathe, smile, find a friendly face.' : 'The room settles. Find a friendly face.') + '</div></div>';
      setTimeout(function () {
        if (!alive || state !== 'intro') return;
        venue.crowd.calm(); audio.murmur(0, 1.5);
        center.innerHTML = '<div><div class="big">Begin when ready</div><div class="sub">The clock starts now.</div></div>';
        setTimeout(function () { if (alive && state === 'intro') startTalk(); }, TEST ? 200 : 1300);
      }, TEST ? 300 : (S.applause ? 3600 : 1800));
    }
    function startTalk() {
      state = 'talk';
      if (voice) { voice.muted = false; voice.reset(); }
      var impromptu = drill && drill.impromptu;
      R = { t: 0, card: 0, gaze: [], gazeNow: 0, gazeCount: [0, 0, 0, 0, 0, 0], gazeSamples: 0, lastGazeAt: 0, hold: { dir: null, since: 0, counted: false }, holds: 0,
        hands: { active: 0, samples: 0 }, sway: { last: null, dist: 0, secs: 0 }, q: 0.65, qs: [], fillerTimes: [], nudgeAt: {}, coachAt: 0, scroll: 0,
        distractNext: 20 + Math.random() * 25, distractions: 0, recovered: 0, pendingRecover: [], target: 0, topic: null, beacon: null, beacons: 0, beaconsHit: 0,
        qa: null, questions: 0, answerSecs: 0, chimed: false, endHold: 0, backSecs: 0 };
      if (impromptu) {
        R.topic = C.topics[Math.floor(Math.random() * C.topics.length)];
        cards = [{ text: 'Your topic: ' + R.topic + ' Point, reason, example, point.', slide: R.topic }];
      }
      R.target = drill ? drill.minutes * 60 : (talk.target_min || 0) * 60;
      if (drill && drill.qa) { cards = []; }
      if (S.record && stream && window.MediaRecorder) {
        try { chunks = []; recorder = new MediaRecorder(stream); recorder.ondataavailable = function (e) { if (e.data && e.data.size) chunks.push(e.data); }; recorder.start(1000); } catch (e) { recorder = null; }
      }
      if (S.transcript && MB.Transcript.supported) transcript = MB.Transcript.start(S.fillers_list || '');
      $('[data-center]').innerHTML = '';
      $('[data-hud]').hidden = mode !== 'flat'; $('[data-ttl]').textContent = drill ? drill.name : talk.title;
      $('[data-coach]').hidden = mode !== 'flat' || (S.coach === 'off' && !(drill && drill.live));
      $('[data-cue]').hidden = mode !== 'flat' || S.prompter === 'none' || (!cards.length && !impromptu);
      if (drill && drill.beacons) nextBeacon();
      showCard(0, true);
      audio.chime(false);
      if (drill && drill.qa) startQA();
    }

    /* ---------------------------------------------------------------- cards */
    function cardText(c) { return (c && c.text) || ''; }
    function showCard(i, first) {
      if (!R) return;
      var n = cards.length;
      i = Math.max(0, Math.min(n, i));   // n = the "finish" card
      if (i === R.card && !first) return;
      var dir = i > R.card ? 'slide-l' : 'slide-r';
      R.card = i;
      if (!first && voice) voice.mark('card', i);
      var c = cards[i];
      if (c && c.slide) venue.setSlide(c.slide);
      else if (first) venue.setSlide(drill ? drill.name : talk.title, ctx.me ? ctx.me.name : '');
      if (R.topic && first) venue.setSlide(R.topic);
      // the cue card on this screen
      var box = $('[data-cuecard]');
      if (box) {
        box.className = 'st-cuecard' + (S.prompter === 'scroll' ? ' scroll' : '') + (first ? '' : ' ' + dir);
        if (S.prompter === 'scroll') drawScrollCue();
        else box.innerHTML = i < n
          ? '<div class="n"><span><i></i>Card ' + (i + 1) + ' of ' + n + '</span><span>' + (drill ? esc(drill.name) : '') + '</span></div><div class="tx">' + cueHtml(cardText(c)) + '</div>' +
            (cards[i + 1] ? '<div class="next">Next › ' + esc(cardText(cards[i + 1]).slice(0, 90)) + '</div>' : '<div class="next">Next › finish</div>')
          : '<div class="n"><span><i></i>The end</span></div><div class="tx">Land your last line, pause, smile. Press <b>→</b> again (or Finish) when you\'re done.</div>';
      }
      drawHandCard();
      drawMonitor(true);
    }
    function cueHtml(t) { return esc(t).replace(/ \/ /g, ' <span class="sl">●</span> ').replace(/\(([^)]{2,60})\)/g, '<mark>($1)</mark>'); }
    function nextCard() {
      if (!R) return;
      if (state === 'qa') return nextQuestion();
      if (R.card >= cards.length) return endTalk();
      showCard(R.card + 1);
    }
    function prevCard() { if (R && state === 'talk') showCard(R.card - 1); }
    var scrollWords = null;
    function scriptWords() {
      if (!scrollWords) { scrollWords = []; cards.forEach(function (c, ci) { cardText(c).split(/\s+/).forEach(function (w) { if (w) scrollWords.push([w, ci]); }); }); }
      return scrollWords;
    }
    function drawScrollCue() {
      var box = $('[data-cuecard]'); if (!box || !R) return;
      var W = scriptWords(), p = Math.floor(R.scroll), from = Math.max(0, p - 6), to = Math.min(W.length, p + 40);
      box.innerHTML = '<div class="n"><span><i></i>Teleprompter · follows your voice</span><span>' + Math.min(100, Math.round(p / Math.max(1, W.length) * 100)) + '%</span></div><div class="tx">' +
        W.slice(from, to).map(function (w, k) { var idx = from + k; return idx < p ? '<span style="color:#a8a199">' + esc(w[0]) + '</span>' : idx < p + 4 ? '<mark>' + esc(w[0]) + '</mark>' : esc(w[0]); }).join(' ') + '</div>';
    }

    /* ---------------------------------------------------------------- canvas: monitor + hand card */
    function drawMonitor(force) {
      if (!venue) return;
      var c = venue.monitor.tex.ctx, w = 1024, h = 576;
      c.fillStyle = '#0b0b0d'; c.fillRect(0, 0, w, h);
      c.textBaseline = 'top'; c.textAlign = 'left';
      var secs = R ? R.t : 0, target = R ? R.target : 0;
      // clock
      var shown = target ? target - secs : secs, over = target && secs > target;
      c.font = '900 92px Archivo, Arial Black, sans-serif'; c.textAlign = 'right';
      c.fillStyle = over ? '#ff3b2e' : target && target - secs < 60 ? '#ffb547' : '#f3efe8';
      c.fillText((over ? '+' : '') + MB.fmtSecs(Math.abs(shown)), w - 36, 26);
      c.textAlign = 'left';
      c.fillStyle = '#e62b1e'; c.beginPath(); c.arc(50, 64, 14, 0, 7); c.fill();
      c.font = '800 26px Inter, Arial, sans-serif'; c.fillStyle = '#a8a199';
      var label = state === 'qa' ? 'QUESTION ' + (R.qa.i + 1) + ' OF ' + R.qa.list.length : !R ? (S.venue === 'redcircle' ? 'STAND ON THE RED CIRCLE' : 'READY WHEN YOU ARE') : S.prompter === 'none' ? 'NO NOTES' : cards.length ? (R.card < cards.length ? 'CARD ' + (R.card + 1) + ' / ' + cards.length : 'FINISH') : (drill ? drill.name.toUpperCase() : 'FREE TALK');
      c.fillText(label, 80, 50);
      var text = '';
      if (state === 'qa') text = R.qa.list[R.qa.i];
      else if (R && S.prompter !== 'none' && (S.prompter === 'monitor' || S.prompter === 'scroll' || mode === 'flat' || !handCardShown())) {
        if (S.prompter === 'scroll') {
          var W = scriptWords(), p = Math.floor(R.scroll);
          text = W.slice(p, p + 28).map(function (x) { return x[0]; }).join(' ');
        } else text = R.card < cards.length ? cardText(cards[R.card]) : 'Land it. Pause. Press A to finish.';
      } else if (!R) text = drill ? drill.blurb : talk.title;
      if (R && R.topic && state === 'talk') text = 'Topic: ' + R.topic;
      if (R && R.beacon != null && state === 'talk') text = (text ? text + '  ' : '') + '👁 Find the glowing person.';
      c.fillStyle = '#f3efe8';
      var size = 50; c.font = '700 ' + size + 'px Inter, Arial, sans-serif';
      var lines = MB.wrapText(c, text, w - 80);
      while (lines.length > 6 && size > 30) { size -= 4; c.font = '700 ' + size + 'px Inter, Arial, sans-serif'; lines = MB.wrapText(c, text, w - 80); }
      lines.slice(0, 7).forEach(function (l, i) { c.fillText(l, 40, 140 + i * size * 1.18); });
      // coach lights
      if (R && state === 'talk' && (S.coach !== 'off' || (drill && drill.live))) {
        var L = R.lights || {}, items = [['PACE', L.pace], ['VOLUME', L.vol], ['UM', L.fill], ['EYES', L.eyes]];
        items.forEach(function (it, i) {
          var x = 40 + i * 180, y = h - 66;
          c.fillStyle = it[1] === 'g' ? '#2ee59d' : it[1] === 'a' ? '#ffb547' : it[1] === 'r' ? '#ff3b2e' : '#3a3a40';
          c.beginPath(); c.arc(x + 12, y + 14, 12, 0, 7); c.fill();
          c.fillStyle = '#a8a199'; c.font = '800 24px Inter, Arial, sans-serif'; c.fillText(it[0], x + 32, y + 2);
        });
        if (R.nudgeText && performance.now() - R.nudgeAt0 < 3500) { c.textAlign = 'right'; c.fillStyle = '#ffb547'; c.font = '900 34px Archivo, Arial, sans-serif'; c.fillText(R.nudgeText, w - 36, h - 68); c.textAlign = 'left'; }
      }
      if (R && R.endHold > 0) { c.fillStyle = '#e62b1e'; c.fillRect(0, h - 10, w * Math.min(1, R.endHold / 1.5), 10); }
      venue.monitor.tex.tex.needsUpdate = true;
    }
    function handCardShown() { return mode !== 'flat' && S.prompter === 'cards' && handGrip && handGrip.visible; }
    function drawHandCard() {
      if (!venue) return;
      var c = venue.card.tex.ctx, w = 768, h = 480;
      c.fillStyle = '#fbf7ef'; c.fillRect(0, 0, w, h);
      c.fillStyle = '#e62b1e'; c.fillRect(0, 0, w, 10);
      c.textBaseline = 'top'; c.textAlign = 'left';
      c.font = '800 24px Inter, Arial, sans-serif'; c.fillStyle = '#9b958d';
      var n = cards.length, i = R ? R.card : 0;
      c.fillText(state === 'qa' ? 'QUESTION' : i < n ? 'CARD ' + (i + 1) + ' / ' + n : 'FINISH', 30, 30);
      c.textAlign = 'right'; c.fillText('A / X next · B / Y back', w - 30, 30); c.textAlign = 'left';
      var text = state === 'qa' ? R.qa.list[R.qa.i] : i < n ? cardText(cards[i]) : 'Land it. Pause. Smile. Press A to finish.';
      c.fillStyle = '#121212';
      var size = 40; c.font = '700 ' + size + 'px Inter, Arial, sans-serif';
      var lines = MB.wrapText(c, text, w - 60);
      while (lines.length > 7 && size > 24) { size -= 3; c.font = '700 ' + size + 'px Inter, Arial, sans-serif'; lines = MB.wrapText(c, text, w - 60); }
      lines.slice(0, 8).forEach(function (l, k) { c.fillText(l, 30, 80 + k * size * 1.2); });
      venue.card.tex.tex.needsUpdate = true;
    }

    /* ---------------------------------------------------------------- while talking */
    function tickTalk(dt) {
      R.t = voice ? voice.now() : R.t + dt;
      var t = R.t, live = voice ? voice.live : { wpm: 0, snr: 0, speaking: false, silence: 0, pitchVar: 0 };
      // eyes: sample ten times a second
      if (t - R.lastGazeAt >= 0.1) {
        R.lastGazeAt = t;
        var d = headDir(), code = venue.gazeOf(d);
        R.gaze.push([t, code]); R.gazeCount[code]++; R.gazeSamples++;
        R.gazeNow = code >= 1 && code <= 3 ? code : 0;
        if (code === 5) R.backSecs += 0.1;
        // holds: head steady within ~6 degrees for 1.5 s while on the audience
        if (R.gazeNow) {
          if (!R.hold.dir || R.hold.dir.angleTo(d) > 0.1) { R.hold.dir = d.clone(); R.hold.since = t; R.hold.counted = false; }
          else if (!R.hold.counted && t - R.hold.since >= 1.5) { R.holds++; R.hold.counted = true; }
        } else R.hold.dir = null;
        if (session) trackBody();
        if (R.beacon != null) tickBeacon(d, 0.1);
      }
      // scrolling teleprompter follows your voice
      if (S.prompter === 'scroll' && live.speaking) {
        R.scroll = Math.min(scriptWords().length, R.scroll + Math.max(1.6, (live.wpm || 140) / 60) * dt);
        if (Math.floor(R.scroll * 2) !== R.lastScrollDraw) { R.lastScrollDraw = Math.floor(R.scroll * 2); if (mode === 'flat') drawScrollCue(); }
      }
      // live quality (feeds the crowd) + coach, twice a second
      if (t - R.coachAt >= 0.5) { R.coachAt = t; coach(live, t); }
      // distractions
      if (S.distractions.length && t >= R.distractNext && state === 'talk') distract(t);
      R.pendingRecover = R.pendingRecover.filter(function (p) {
        if (t >= p.check) { if (voice && voice.live.silence < 3) R.recovered++; return false; }
        return true;
      });
      // the clock
      $('[data-clock]').textContent = R.target ? (t > R.target ? '+' : '') + MB.fmtSecs(Math.abs(R.target - t)) : MB.fmtSecs(t);
      $('[data-clock]').className = 'st-clock' + (R.target && t > R.target ? ' over' : R.target && R.target - t < 60 ? ' warn' : '');
      if (R.target && !R.chimed && t >= R.target) { R.chimed = true; audio.chime(true); if (S.coach !== 'off') nudge('Time! Land your last line', false, 'time'); }
      if (drill && (drill.impromptu || drill.key === 'elevator') && t >= R.target + (drill.key === 'elevator' ? 5 : 3) && state === 'talk') endTalk();
      if (state === 'qa' && R.qa) R.answerSecs += dt;
    }
    function coach(live, t) {
      var recentF = R.fillerTimes.filter(function (x) { return x > (voice ? voice.t : 0) - 60; }).length;
      var gs = R.gaze.slice(-100), onAud = gs.filter(function (g) { return g[1] >= 1 && g[1] <= 3; }).length / Math.max(1, gs.length);
      var w = live.wpm, talkingLong = t > 6;
      var pace = !talkingLong || !w ? 0.7 : w >= 125 && w <= 170 ? 1 : w < 125 ? Math.max(0.2, 1 - (125 - w) / 60) : Math.max(0.2, 1 - (w - 170) / 60);
      var mel = live.pitchVar >= 2 ? 1 : live.pitchVar >= 1.2 ? 0.75 : 0.5;
      var vol = live.speaking ? (live.snr >= 18 ? 1 : live.snr >= 12 ? 0.75 : 0.45) : (R.lastVol || 0.8);
      if (live.speaking) R.lastVol = vol;
      var q = 0.28 * pace + 0.24 * mel + 0.2 * vol + 0.28 * onAud - 0.06 * Math.max(0, recentF - 1);
      if (live.silence > 4) q -= 0.2;
      R.q = Math.max(0, Math.min(1, R.q * 0.7 + q * 0.3)); R.qs.push(R.q);
      R.lights = { pace: !talkingLong || !w ? '' : pace >= 0.95 ? 'g' : pace >= 0.6 ? 'a' : 'r', vol: !live.speaking ? (R.lights && R.lights.vol) || '' : vol >= 1 ? 'g' : vol >= 0.75 ? 'a' : 'r',
        fill: recentF === 0 ? 'g' : recentF <= 2 ? 'a' : 'r', eyes: !session && mode === 'flat' && R.gazeSamples < 30 ? '' : onAud >= 0.65 ? 'g' : onAud >= 0.4 ? 'a' : 'r' };
      if (mode === 'flat') drawCoach(live, recentF, onAud);
      if (S.coach !== 'full' || !talkingLong) return;
      if (w > 178 && live.speaking) nudge('Slow down', false, 'fast');
      else if (w && w < 105 && live.speaking && t > 15) nudge('A little more energy', false, 'slow');
      else if (live.sincePause > 22) nudge('Breathe. Pause.', false, 'breath');
      else if (live.speaking && live.snr < 11) nudge('Louder: reach the back row', false, 'quiet');
      else if (t > 20 && live.pitchVar < 1.1 && live.speaking) nudge('Add some melody', false, 'mono');
      else if (onAud < 0.35 && t > 10) nudge('Look up at them', false, 'eyes');
      else {
        var cnt = [0, 0, 0, 0]; gs.forEach(function (g) { if (g[1] >= 1 && g[1] <= 3) cnt[g[1]]++; });
        if (t > 25 && R.gaze.length > 200) {
          var long = R.gaze.slice(-250), lc = [0, 0, 0, 0]; long.forEach(function (g) { if (g[1] >= 1 && g[1] <= 3) lc[g[1]]++; });
          if (lc[1] < 8) nudge('Look to the left side', false, 'left'); else if (lc[3] < 8) nudge('Look to the right side', false, 'right');
        }
      }
    }
    function drawCoach(live, recentF, onAud) {
      var box = $('[data-coach]'); if (box.hidden) return;
      var L = R.lights, dot = function (k) { return '<i class="' + (k || '') + '"></i>'; };
      var w = Math.round(live.wpm || 0), pv = Math.min(100, Math.max(0, (w - 60) / 160 * 100));
      var pitchSvg = '';
      if (voice && (drill && drill.live === 'pitch' || S.coach === 'full')) {
        var pts = [], n = voice.F0.length, from = Math.max(0, n - 220);
        for (var i = from; i < n; i += 2) if (voice.F0[i] > 0) pts.push([(i - from) / 220 * 140, 30 - Math.max(-12, Math.min(12, 12 * Math.log2(voice.F0[i] / (voice.live.pitch || voice.F0[i] || 150)))) - 15]);
        pitchSvg = '<svg viewBox="0 0 140 34"><polyline fill="none" stroke="#ff6a5c" stroke-width="2" points="' + pts.map(function (p) { return p[0].toFixed(0) + ',' + p[1].toFixed(0); }).join(' ') + '"/></svg>';
      }
      box.innerHTML =
        '<div class="st-gauge">Pace<b>' + (w ? w + ' wpm' : '–') + dot(L.pace) + '</b><div class="bar"><span class="zone" style="left:' + ((125 - 60) / 160 * 100) + '%;width:' + (45 / 160 * 100) + '%"></span><i style="width:' + pv + '%"></i></div></div>' +
        '<div class="st-gauge">Volume<b>' + (live.speaking ? Math.round(live.snr) + ' dB' : '…') + dot(L.vol) + '</b><div class="bar"><i style="width:' + Math.round(live.level * 100) + '%"></i></div></div>' +
        '<div class="st-gauge">Um / uh<b>' + (voice ? voice.live.fillers : 0) + (transcript ? ' + ' + transcript.fillers : '') + dot(L.fill) + '</b></div>' +
        '<div class="st-gauge">Pauses<b>' + (voice ? voice.live.pauses : 0) + dot(voice && voice.live.sincePause > 20 ? 'a' : 'g') + '</b></div>' +
        (pitchSvg ? '<div class="st-gauge">Melody' + pitchSvg + '</div>' : '') +
        (R.beacon != null || (drill && drill.beacons) ? '<div class="st-gauge">Lighthouse<b>' + R.beaconsHit + ' / ' + R.beacons + dot('g') + '</b></div>' : '');
    }
    function nudge(text, good, key) {
      var now = performance.now();
      if (R.nudgeAt[key] && now - R.nudgeAt[key] < (key === 'filler' ? 15000 : 9000)) return;
      if (R.lastNudge && now - R.lastNudge < 3500) return;
      R.nudgeAt[key] = now; R.lastNudge = now; R.nudgeText = text; R.nudgeAt0 = now;
      if (mode === 'flat') {
        var n = $('[data-nudge]');
        n.innerHTML = '<span class="' + (good ? 'good' : '') + '">' + esc(text) + '</span>';
        setTimeout(function () { if (alive && n.firstChild && R && R.nudgeText === text) n.innerHTML = ''; }, 3000);
      }
    }
    function distract(t) {
      var kinds = S.distractions, k = kinds[Math.floor(Math.random() * kinds.length)];
      R.distractNext = t + 30 + Math.random() * 35;
      var mute = 0;
      if (k === 'cough') { var p = venue.crowd.cough(); audio.cough(Math.max(-1, Math.min(1, p.x / 10))); mute = 0.8; }
      else if (k === 'phone') { audio.phone(); mute = 4.4; }
      else if (k === 'feedback') { audio.squeal(); mute = 1.5; }
      else if (k === 'late') { if (!venue.crowd.walk(false)) return; }
      else if (k === 'leave') { if (!venue.crowd.walk(true)) return; }
      R.distractions++;
      if (voice) {
        voice.mark('distract', k);
        if (mute) { voice.muted = true; setTimeout(function () { if (voice) voice.muted = false; }, mute * 1000); }
      }
      R.pendingRecover.push({ check: t + mute + 3 });
    }

    /* ---------------------------------------------------------------- lighthouse beacons */
    function nextBeacon() {
      var side = R.beacons % 3, cand = venue.people.map(function (p, i) { return i; }).filter(function (i) {
        var p = venue.people[i]; return !p.hidden && p.sec === [1, 3, 2][side] && p.dist < 24;
      });
      var i = cand.length ? cand[Math.floor(Math.random() * cand.length)] : venue.crowd.pick(20);
      R.beacon = { i: i, held: 0, age: 0 }; R.beacons++;
      venue.crowd.light(i);
    }
    function tickBeacon(d, dt) {
      var b = R.beacon; if (!b) return;
      b.age += dt;
      var hp = venue.crowd.headPos(b.i, tmpV2), eye = headPos();
      var to = hp.sub(eye).normalize();
      if (to.angleTo(d) < 0.13) b.held += dt; else b.held = Math.max(0, b.held - dt * 0.5);
      if (b.held >= 2.2) { R.beaconsHit++; audio.chime(true); R.beacon = null; venue.crowd.light(-1); setTimeout(function () { if (alive && R && state === 'talk') nextBeacon(); }, 1200); }
      else if (b.age > 10) { R.beacon = null; venue.crowd.light(-1); setTimeout(function () { if (alive && R && state === 'talk') nextBeacon(); }, 600); }
    }

    /* ---------------------------------------------------------------- Q&A */
    function questionSet() {
      var key = S.venue === 'interview' ? 'interview' : S.venue === 'boardroom' ? 'boardroom' : S.venue === 'townhall' ? 'townhall' : 'general';
      var list = (C.questions[key] || []).concat(key === 'general' ? [] : C.questions.general.slice(0, 4)), out = [];
      while (out.length < 3 && list.length) out.push(list.splice(Math.floor(Math.random() * list.length), 1)[0]);
      return out;
    }
    function startQA() {
      state = 'qa';
      R.qa = { list: questionSet(), i: -1 };
      cards = []; $('[data-cue]').hidden = mode !== 'flat';
      nextQuestion();
    }
    function nextQuestion() {
      R.qa.i++;
      if (R.qa.i >= R.qa.list.length) { venue.crowd.ask(-1); return finish(); }
      R.questions++;
      var q = R.qa.list[R.qa.i], who = venue.crowd.pick(S.venue === 'arena' ? 30 : 16);
      venue.crowd.ask(who);
      venue.setSlide('Q&A', '');
      if (voice) voice.mark('q', q.slice(0, 80));
      var box = $('[data-cuecard]');
      if (box) box.innerHTML = '<div class="n"><span><i></i>Question ' + (R.qa.i + 1) + ' of ' + R.qa.list.length + '</span><span>Pause, answer, land it</span></div><div class="tx">“' + esc(q) + '”</div><div class="next">Press → when you\'ve answered</div>';
      drawHandCard(); drawMonitor(true);
      speak(q);
    }
    function speak(text) {
      if (!window.speechSynthesis || TEST) return;
      try {
        var u = new SpeechSynthesisUtterance(text);
        var vs = speechSynthesis.getVoices().filter(function (v) { return /^en/i.test(v.lang); });
        if (vs.length) u.voice = vs[Math.floor(Math.random() * vs.length)];
        u.rate = 1; u.pitch = 0.9 + Math.random() * 0.3;
        if (voice) voice.muted = true;
        u.onend = u.onerror = function () { setTimeout(function () { if (voice) voice.muted = false; }, 300); };
        speechSynthesis.cancel(); speechSynthesis.speak(u);
      } catch (e) { if (voice) voice.muted = false; }
    }

    /* ---------------------------------------------------------------- body (VR): gestures + sway */
    function trackBody() {
      var h = headPos();
      if (R.sway.last) { var dx = h.x - R.sway.last.x, dz = h.z - R.sway.last.z; R.sway.dist += Math.sqrt(dx * dx + dz * dz); R.sway.secs += 0.1; }
      R.sway.last = { x: h.x, z: h.z };
      var active = false, any = false;
      grips.forEach(function (g) {
        if (!g.grip.visible) return;
        any = true;
        g.grip.getWorldPosition(tmpV);
        var sp = g.prev ? tmpV.distanceTo(g.prev) / 0.1 : 0;
        g.prev = (g.prev || new T.Vector3()).copy(tmpV);
        if (tmpV.y > h.y - 0.72 && sp > 0.12) active = true;
      });
      if (any) { R.hands.samples++; if (active) R.hands.active++; }
    }

    /* ---------------------------------------------------------------- ending */
    function endTalk() {
      if (state !== 'talk') return;
      if ((S.qa || (drill && drill.qa)) && !(R.qa)) { audio.applause(0.35, 2); venue.crowd.applaud(0.35, false); setTimeout(function () { if (alive && R) { venue.crowd.calm(); startQA(); } }, 2200); state = 'between'; return; }
      finish();
    }
    function finish() {
      if (state === 'outro' || state === 'saving' || state === 'results') return;
      state = 'outro';
      var avgQ = R.qs.length ? MB.mean(R.qs.slice(-60)) : 0.6;
      if (voice) voice.muted = true;
      if (transcript) transcript.stop();
      var stopRec = new Promise(function (res) {
        if (!recorder || recorder.state === 'inactive') return res(null);
        recorder.onstop = function () { res(new Blob(chunks, { type: recorder.mimeType || 'audio/webm' })); };
        try { recorder.stop(); } catch (e) { res(null); }
      });
      if (S.applause) { audio.applause(Math.min(1, 0.35 + avgQ * 0.8), avgQ > 0.72 ? 6 : 4); venue.crowd.applaud(Math.min(1, 0.3 + avgQ), avgQ > 0.72); }
      $('[data-cue]').hidden = true; $('[data-coach]').hidden = true; $('[data-nudge]').innerHTML = '';
      $('[data-center]').innerHTML = '<div><div class="big">' + (avgQ > 0.72 ? 'Standing ovation!' : avgQ > 0.5 ? 'Thank you!' : 'Thank you.') + '</div><div class="sub">Counting the claps and crunching your numbers…</div></div>';
      var payload = buildPayload();
      setTimeout(function () {
        if (!alive) return;
        state = 'saving';
        stopRec.then(function (blob) {
          tape = blob;
          var call = ctx.me ? UI.api('save_session', payload) : UI.api('score_preview', payload);
          return call.then(function (res) { showResults(res, payload); }, function (e) {
            state = 'results';
            $('[data-center]').innerHTML = '';
            panel.hidden = false;
            panel.innerHTML = '<div class="st-card"><h1>That didn\'t save</h1><div class="st-error">' + esc(e.message) + '</div><div class="st-actions"><button class="st-btn" data-leave>Leave</button><button class="st-btn red" data-again>Go again</button></div></div>';
          });
        });
      }, TEST ? 400 : (S.applause ? 2600 : 900));
    }
    function buildPayload() {
      var tot = Math.max(1, R.gazeSamples), aud = R.gazeCount[1] + R.gazeCount[2] + R.gazeCount[3];
      var extra = { target_secs: R.target || 0, cards: cards.length, distractions: R.distractions, recovered: R.recovered, questions: R.questions, answer_secs: R.answerSecs,
        tracked_gaze: mode !== 'flat' || R.gazeSamples > 50, gaze_aud: aud / tot, gaze_l: R.gazeCount[1] / Math.max(1, aud), gaze_c: R.gazeCount[2] / Math.max(1, aud),
        gaze_r: R.gazeCount[3] / Math.max(1, aud), gaze_down: R.gazeCount[4] / tot, gaze_back: R.backSecs, holds_pm: R.holds / Math.max(0.2, R.t / 60) };
      if (mode === 'flat') {   // on a flat screen the mouse is your head: only count eyes if you actually looked around
        var moved = R.gaze.some(function (g) { return g[1] !== R.gaze[0][1]; });
        if (!moved) extra.tracked_gaze = false;
      }
      if (R.hands.samples > 30) { extra.tracked_hands = true; extra.gest_share = R.hands.active / R.hands.samples; extra.sway = R.sway.secs ? R.sway.dist / R.sway.secs : 0; }
      if (R.beacons) { extra.beacons = R.beacons; extra.beacons_hit = R.beaconsHit; }
      if (transcript) { extra.transcript = true; extra.words = transcript.words; extra.word_fillers = transcript.fillers; extra.filler_words = transcript.byWord; }
      var metrics = voice ? voice.summary(extra) : Object.assign({ secs: R.t }, extra);
      var tl = voice ? voice.timeline(R.gaze.map(function (g) { return [g[0], g[1]]; })) : { step: 1, events: [] };
      return { kind: drill ? 'drill' : ref === 'sample' ? 'sample' : ref === 'free' ? 'impromptu' : 'talk', drill: drill ? drill.key : null,
        talk_id: drill || isPublic ? null : talk.id, title: drill ? drill.name + (R.topic ? ': ' + R.topic : '') : talk.title, venue: S.venue, crowd: crowdCount(), mood: S.mood,
        mode: mode, nerves_before: nervesBefore, nerves_after: nervesAfter, metrics: metrics, timeline: tl };
    }

    /* ---------------------------------------------------------------- results */
    var saved = null;
    function showResults(res, payload) {
      state = 'results';
      saved = { res: res, payload: payload };
      var sc = res.score, id = res.id || null;
      if (tape) MB.Tapes.put(id || 'guest', tape, { title: payload.title, when: Date.now() });
      if (!id) { try { sessionStorage.setItem('mb.guestReport', JSON.stringify({ score: sc, timeline: res.timeline, payload: { title: payload.title, venue: payload.venue, crowd: payload.crowd, mode: payload.mode, metrics: payload.metrics, kind: payload.kind, drill: payload.drill } })); } catch (e) {} }
      $('[data-center]').innerHTML = ''; $('[data-hud]').hidden = true; $('[data-look]').hidden = true;
      if (session) { vrResults(sc); }
      drawFlatResults(sc, res, id);
      if (venue) { venue.crowd.calm(); venue.crowd.state = 'idle'; }
    }
    function drawFlatResults(sc, res, id) {
      panel.hidden = false;
      var badges = (res.new_badges || []).map(function (b) { return '<span class="st-chip badge">★ ' + esc(b.name) + '</span>'; }).join('');
      var strengths = (sc.strengths || []).map(function (s) { return '<span class="st-chip good">' + esc(s.label) + ' ' + s.score + '</span>'; }).join('');
      var noScore = sc.confidence == null;
      panel.innerHTML = '<div class="st-card"><div class="st-eyebrow"><i></i>' + (noScore ? 'Done' : 'Stage Confidence') + '</div>' +
        '<div class="st-res">' + (noScore ? '<div style="font-size:4rem">🫁</div>' : MB.ring(sc.confidence, 150, sc.band ? sc.band.name : '')) + '<div>' +
        '<h1>' + (noScore ? (drill && drill.breathing ? 'Nicely breathed.' : 'Too short to score') : esc(sc.band.name)) + '</h1>' +
        '<p>' + (noScore ? (drill && drill.breathing ? 'Your nervous system thanks you. Notice how you feel now.' : 'Speak for at least ten seconds so we can hear your voice properly.') : esc(sc.band.line)) +
        (sc.facts && sc.facts.wpm ? ' ' + sc.facts.wpm + ' words a minute, ' + sc.facts.fillers_pm + ' hesitations a minute.' : '') + '</p>' +
        '<div class="st-chips">' + strengths + badges + (res.xp_gained ? '<span class="st-chip">+' + res.xp_gained + ' XP</span>' : '') +
        (res.level_up ? '<span class="st-chip badge">Level up: ' + esc(res.level.name) + '</span>' : '') + (res.streak > 1 ? '<span class="st-chip">🔥 ' + res.streak + '-day streak</span>' : '') + '</div></div></div>' +
        ((sc.tips || []).length ? '<div class="st-tips">' + sc.tips.map(function (t) { return '<div class="st-tip"><b>' + esc(t.label) + ' · ' + t.score + '</b>' + esc(t.text) + '</div>'; }).join('') + '</div>' : '') +
        '<h3>How do you feel now?</h3><div class="st-nerves" data-nerves="after">' + [1, 2, 3, 4, 5].map(function (n) {
          return '<button data-n="' + n + '" class="' + (nervesAfter === n ? 'on' : '') + '"><span>' + NERVE_FACES[n] + '</span>' + esc(C.nerves[n]) + '</button>';
        }).join('') + '</div>' + (nervesBefore ? '<p class="st-hint">Before: ' + NERVE_FACES[nervesBefore] + ' ' + esc(C.nerves[nervesBefore]) + '</p>' : '') +
        (id ? '<h3>One line for next time</h3><textarea data-reflect maxlength="1000" placeholder="What went well? One thing to change?"></textarea>' : '') +
        '<div class="st-actions"><button class="st-btn ghost" data-leave>' + UI.icon('back') + 'Leave</button><button class="st-btn" data-again>' + UI.icon('refresh') + 'Go again</button>' +
        (noScore && drill && drill.breathing ? '' : '<button class="st-btn red big" data-report>' + UI.icon('chart') + 'Full report</button>') + '</div>' +
        (!ctx.me ? '<p class="st-hint" style="text-align:right;margin-top:10px">This was a preview. <a href="#auth/signup" data-go="auth/signup" style="color:#ff6a5c">Create a free account</a> to save your talks, reports and progress.</p>' : '') + '</div>';
    }
    function saveReflection() {
      if (!saved || !saved.res.id) return Promise.resolve();
      var ta = panel.querySelector('[data-reflect]'), text = ta ? ta.value : '';
      if (!text && !nervesAfter) return Promise.resolve();
      return UI.apiQuiet('set_reflection', saved.res.id, text, nervesAfter).catch(function () {});
    }

    /* ---------------------------------------------------------------- box breathing */
    var B = null;
    function startBreathe(thenTalk) {
      state = 'breathe';
      panel.hidden = true;
      audio.init(); audio.murmur(0, 0.5);
      venue.crowd.state = 'idle';
      B = { t: 0, phase: -1, then: !!thenTalk, total: thenTalk ? 64 : (drill ? drill.minutes * 60 : 120) };
      if (TEST) B.total = 3;
      $('[data-center]').innerHTML = '<div><div class="st-breath" data-ring>…</div><div class="big" data-bword>Breathe</div><div class="sub" data-bsub>Follow the circle. In through the nose, out through the mouth.</div></div>';
      $('[data-hud]').hidden = mode !== 'flat'; $('[data-ttl]').textContent = 'Box breathing';
      R = null;
    }
    function tickBreathe(dt) {
      B.t += dt;
      var ph = Math.floor(B.t / 4) % 4, left = 4 - Math.floor(B.t % 4);
      var words = ['Breathe in', 'Hold', 'Breathe out', 'Hold'];
      if (ph !== B.phase) {
        B.phase = ph;
        var ring = $('[data-ring]'); if (ring) ring.classList.toggle('big', ph === 0 || ph === 1);
        var bw = $('[data-bword]'); if (bw) bw.textContent = words[ph];
        venue.setSlide(words[ph], 'Box breathing · ' + MB.fmtSecs(B.total - B.t) + ' left');
        if (ph === 0) audio.chime(false);
      }
      var r2 = $('[data-ring]'); if (r2) r2.textContent = left;
      $('[data-clock]').textContent = MB.fmtSecs(Math.max(0, B.total - B.t));
      if (B.t >= B.total) {
        $('[data-center]').innerHTML = '';
        if (B.then) { B = null; walkOn(); return; }
        state = 'outro';
        var payload = { kind: 'drill', drill: drill.key, title: drill.name, venue: S.venue, crowd: 1, mood: S.mood, mode: mode, nerves_before: nervesBefore, nerves_after: null,
          metrics: { secs: B.t }, timeline: { step: 1, events: [] } };
        B = null;
        (ctx.me ? UI.api('save_session', payload) : UI.api('score_preview', payload)).then(function (res) { showResults(res, payload); });
      }
    }

    /* ---------------------------------------------------------------- VR */
    var grips = [], handGrip = null, vrp = { mesh: null, buttons: [], hover: null, waitHead: 0, waited: 0, redo: null }, ray = null, lasers = [];
    function setupXRControllers() {
      if (grips.length) return;
      for (var i = 0; i < 2; i++) (function (i) {
        var grip = renderer.xr.getControllerGrip(i); scene.add(grip);
        var g = { grip: grip, hand: null, source: null, prev: null, mesh: null };
        var pad = new T.Mesh(new T.BoxGeometry(0.04, 0.03, 0.11), new T.MeshLambertMaterial({ color: '#2a2a30' })); grip.add(pad);
        grip.addEventListener('connected', function (e) {
          g.source = e.data; g.hand = e.data.handedness;
          if (g.hand === 'left') { handGrip = grip; venue.card.mesh.position.set(0.02, 0.09, -0.04); venue.card.mesh.rotation.set(-0.95, 0, 0); grip.add(venue.card.mesh); drawHandCard(); }
        });
        grip.addEventListener('disconnected', function () { if (grip === handGrip) { grip.remove(venue.card.mesh); handGrip = null; } g.source = null; });
        var ctl = renderer.xr.getController(i); scene.add(ctl);
        var lg = new T.BufferGeometry().setFromPoints([new T.Vector3(0, 0, 0), new T.Vector3(0, 0, -3)]);
        var laser = new T.Line(lg, new T.LineBasicMaterial({ color: '#ff6a5c' })); laser.visible = false; ctl.add(laser); lasers.push(laser);
        ctl.addEventListener('select', function () { vrSelect(ctl); });
        g.ctl = ctl;
        grips.push(g);
      })(i);
    }
    var pads = {};
    function xrInput(dt) {
      if (!session) return;
      var srcs = session.inputSources || [];
      for (var k = 0; k < srcs.length; k++) {
        var s = srcs[k], gp = s.gamepad; if (!gp) continue;
        var h = s.handedness, p = pads[h] || (pads[h] = { a: false, b: false, flick: 0, hold: 0 });
        var a = gp.buttons[4] && gp.buttons[4].pressed, b = gp.buttons[5] && gp.buttons[5].pressed;
        var ax = gp.axes.length >= 4 ? gp.axes[2] : gp.axes[0] || 0, ay = gp.axes.length >= 4 ? gp.axes[3] : gp.axes[1] || 0;
        if (state === 'talk' || state === 'qa') {
          if (a && !p.a) nextCard();
          if (b && !p.b && state === 'talk') prevCard();
          if (b) { p.hold += dt; R.endHold = p.hold; if (p.hold > 1.5) { p.hold = 0; R.endHold = 0; if (state === 'qa') finish(); else endTalk(); } } else if (p.hold) { p.hold = 0; R.endHold = 0; }
          if (Math.abs(ax) > 0.75 && !p.flick) { p.flick = 1; if (ax > 0) nextCard(); else prevCard(); }
          if (Math.abs(ax) < 0.3) p.flick = 0;
          if (S.prompter === 'scroll' && Math.abs(ay) > 0.3 && R) R.scroll = Math.max(0, Math.min(scriptWords().length, R.scroll - ay * dt * 6));
        } else if (vrp.mesh && a && !p.a) { var act = vrp.buttons.filter(function (x) { return x.primary; })[0]; if (act) act.action(); }
        p.a = a; p.b = b;
      }
    }
    function enterXR(kind) {
      audio.init();
      var init = { optionalFeatures: ['local-floor', 'bounded-floor', 'hand-tracking'] };
      navigator.xr.requestSession(kind === 'ar' ? 'immersive-ar' : 'immersive-vr', init).then(function (s) {
        if (!alive) { s.end(); return; }
        session = s;
        setupXRControllers();
        renderer.xr.setSession(s).then(function () {
          mode = kind; buildVenue();
          panel.hidden = false;
          panel.innerHTML = '<div class="st-card"><div class="st-eyebrow"><i></i>In the headset</div><h1>You\'re on stage</h1><p>Take the headset off or press the menu button to come back here.</p></div>';
          camera.position.set(0, -5, 0); camera.updateMatrixWorld(true);
          vrp.waited = 0; vrp.waitHead = 3; vrp.redo = vrReady;
        });
        s.addEventListener('end', onXREnd);
      }, function (e) { UI.toast('Couldn\'t start VR: ' + (e && e.message || 'the headset said no'), 'error'); });
    }
    function onXREnd() {
      session = null; vrp.waitHead = 0; vrClear();
      if (!alive) return;
      var was = mode; mode = 'flat';
      buildVenue(); resize();
      if (state === 'talk' || state === 'qa') { mode = was; finish(); return; }
      if (state === 'results' && saved) { drawFlatResults(saved.res.score, saved.res, saved.res.id); return; }
      if (state !== 'results') showMic();
    }
    function waitForHead() {
      if (!vrp.waitHead) return;
      vrp.waited++;
      if (renderer.xr.isPresenting && headPos().y > 0.3) vrp.waitHead--;
      if (vrp.waitHead <= 0 || vrp.waited > 90) { vrp.waitHead = 0; if (vrp.redo) vrp.redo(); }
    }
    function vrClear() { if (vrp.mesh) { scene.remove(vrp.mesh); vrp.mesh.geometry.dispose(); vrp.mesh.material.map.dispose(); vrp.mesh.material.dispose(); vrp.mesh = null; } vrp.buttons = []; lasers.forEach(function (l) { l.visible = false; }); }
    /* a floating panel in front of the head with buttons you point at and trigger */
    function vrPanel(w, h, draw, buttons) {
      vrClear();
      var ct = MB.canvasTex(T, 1024, Math.round(1024 * h / w)), c = ct.ctx;
      c.fillStyle = 'rgba(14,14,17,0.96)'; c.fillRect(0, 0, ct.canvas.width, ct.canvas.height);
      c.fillStyle = '#e62b1e'; c.fillRect(0, 0, ct.canvas.width, 8);
      draw(c, ct.canvas.width, ct.canvas.height);
      vrp.buttons = buttons;
      buttons.forEach(function (b) {
        c.fillStyle = b.primary ? '#e62b1e' : 'rgba(255,255,255,.1)';
        roundRect(c, b.x, b.y, b.w, b.h, 18); c.fill();
        c.fillStyle = '#ffffff'; c.font = '800 40px Inter, Arial, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
        c.fillText(b.label, b.x + b.w / 2, b.y + b.h / 2 + 2);
      });
      ct.tex.needsUpdate = true;
      var m = new T.Mesh(new T.PlaneGeometry(w, h), new T.MeshBasicMaterial({ map: ct.tex, transparent: true, side: T.DoubleSide }));
      var hp = headPos().clone(), d = headDir().clone(); d.y = 0; if (d.lengthSq() < 0.01) d.set(0, 0, -1); d.normalize();
      m.position.copy(hp).addScaledVector(d, 1.5); m.position.y = hp.y - 0.05;
      m.lookAt(hp.x, m.position.y, hp.z);
      m.userData.canvas = ct.canvas;
      scene.add(m); vrp.mesh = m;
      lasers.forEach(function (l) { l.visible = true; });
    }
    function roundRect(c, x, y, w, h, r) { c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); }
    function vrHit(ctl) {
      if (!vrp.mesh) return null;
      ray = ray || new T.Raycaster();
      var m = new T.Matrix4().extractRotation(ctl.matrixWorld);
      ray.ray.origin.setFromMatrixPosition(ctl.matrixWorld); ray.ray.direction.set(0, 0, -1).applyMatrix4(m);
      var hit = ray.intersectObject(vrp.mesh)[0];
      if (!hit || !hit.uv) return null;
      var cw = vrp.mesh.userData.canvas.width, ch = vrp.mesh.userData.canvas.height, x = hit.uv.x * cw, y = (1 - hit.uv.y) * ch;
      return vrp.buttons.filter(function (b) { return x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h; })[0] || null;
    }
    function vrHover() { /* lasers already show where you point */ }
    function vrSelect(ctl) { var b = vrHit(ctl); if (b) b.action(); }
    function vrReady() {
      vrPanel(1.1, 0.62, function (c, w) {
        c.textAlign = 'left'; c.textBaseline = 'top'; c.fillStyle = '#ff6a5c'; c.font = '800 30px Inter, Arial, sans-serif'; c.fillText('YOU\'RE ON STAGE', 60, 50);
        var ttl = drill ? drill.name : talk.title, fs = 64; c.fillStyle = '#f3efe8';
        do { c.font = '900 ' + fs + 'px Archivo, Arial Black, sans-serif'; fs -= 4; } while (c.measureText(ttl).width > w - 120 && fs > 30);
        c.fillText(ttl, 60, 100);
        c.fillStyle = '#c9c3ba'; c.font = '600 32px Inter, Arial, sans-serif';
        MB.wrapText(c, (S.venue === 'redcircle' ? 'Stand on the red circle. ' : '') + 'Your notes are ' + (S.prompter === 'cards' ? 'in your left hand' : S.prompter === 'none' ? 'in your head' : 'on the floor monitor') + '. A / X = next card, B / Y = back, hold B / Y to finish. Pull the trigger on START when ready.', w - 120).forEach(function (l, i) { c.fillText(l, 60, 200 + i * 42); });
      }, [{ x: 60, y: 440, w: 420, h: 110, label: 'START', primary: true, action: function () { vrClear(); afterWalkOn(); } },
          { x: 520, y: 440, w: 420, h: 110, label: 'EXIT VR', action: function () { session && session.end(); } }]);
      vrp.redo = vrReady;
    }
    function vrResults(sc) {
      vrPanel(1.1, 0.7, function (c, w) {
        c.textAlign = 'left'; c.textBaseline = 'top';
        c.fillStyle = '#ff6a5c'; c.font = '800 30px Inter, Arial, sans-serif'; c.fillText(sc.confidence == null ? 'DONE' : 'STAGE CONFIDENCE', 60, 50);
        c.fillStyle = '#f3efe8'; c.font = '900 150px Archivo, Arial Black, sans-serif'; c.fillText(sc.confidence == null ? '✓' : String(sc.confidence), 60, 90);
        c.font = '900 52px Archivo, Arial Black, sans-serif'; c.fillText(sc.band ? sc.band.name : 'Nicely done', 380, 120);
        c.fillStyle = '#c9c3ba'; c.font = '600 30px Inter, Arial, sans-serif';
        (sc.tips || []).slice(0, 2).forEach(function (t, i) { MB.wrapText(c, t.label + ': ' + t.text, w - 120).slice(0, 2).forEach(function (l, k) { c.fillText(l, 60, 270 + i * 90 + k * 36); }); });
      }, [{ x: 60, y: 560, w: 420, h: 110, label: 'GO AGAIN', action: function () { again(); } },
          { x: 520, y: 560, w: 420, h: 110, label: 'SEE REPORT', primary: true, action: function () { session && session.end(); } }]);
      vrp.redo = function () { vrResults(sc); };
    }

    /* ---------------------------------------------------------------- again / leave */
    function again() {
      saveReflection();
      R = null; tape = null; saved = null; recorder = null; transcript = null; nervesAfter = null; scrollWords = null;
      cards = drill ? (drill.cards || []).slice() : (talk.cards || []).slice();
      buildVenue();
      if (session) { vrReady(); state = 'ready'; return; }
      showMic();
    }
    function leave() {
      saveReflection().then(function () { UI.go(ctx.me ? (drill ? 'drills' : isPublic ? 'home' : 'talks') : 'landing'); });
    }

    /* ---------------------------------------------------------------- DOM events */
    view.addEventListener('click', function (e) {
      var b;
      if ((b = e.target.closest('[data-venue]'))) { S.venue = b.getAttribute('data-venue'); panel.querySelectorAll('[data-venue]').forEach(function (x) { x.classList.toggle('on', x === b); }); panel.querySelector('[data-vblurb]').textContent = venueInfo().blurb; panel.querySelector('[data-crowdn]').textContent = MB.num(crowdCount()); savePrefs(); rebuildSoon(); return; }
      if ((b = e.target.closest('[data-seg] button'))) {
        var k = b.parentNode.getAttribute('data-seg'); S[k] = b.getAttribute('data-v');
        b.parentNode.querySelectorAll('button').forEach(function (x) { x.classList.toggle('on', x === b); });
        refreshHints(); savePrefs(); if (k === 'mood') rebuildSoon(); return;
      }
      if ((b = e.target.closest('[data-nerves] button'))) {
        var n = +b.getAttribute('data-n'), which = b.parentNode.getAttribute('data-nerves');
        if (which === 'before') nervesBefore = n; else { nervesAfter = n; if (saved && saved.res.id) UI.apiQuiet('set_reflection', saved.res.id, (panel.querySelector('[data-reflect]') || {}).value || '', n).catch(function () {}); }
        b.parentNode.querySelectorAll('button').forEach(function (x) { x.classList.toggle('on', x === b); });
        return;
      }
      if (e.target.closest('[data-tomic]')) { if (drill && drill.breathing) { mode = 'flat'; startBreathe(false); } else showMic(); return; }
      if (e.target.closest('[data-backsetup]')) { showSetup(); return; }
      var bf = panel.querySelector('[data-breathefirst]');
      if (e.target.closest('[data-go-vr]')) { wantBreathe = !!(bf && bf.checked); enterXR('vr'); return; }
      if (e.target.closest('[data-go-ar]')) { wantBreathe = !!(bf && bf.checked); enterXR('ar'); return; }
      if (e.target.closest('[data-go-flat]')) { wantBreathe = !!(bf && bf.checked); begin('flat'); return; }
      if (e.target.closest('[data-end]')) { if (state === 'qa') finish(); else if (state === 'breathe') { B.t = B.total; } else endTalk(); return; }
      if (e.target.closest('[data-next]')) { nextCard(); return; }
      if (e.target.closest('[data-prev]')) { prevCard(); return; }
      if (e.target.closest('[data-again]')) { again(); return; }
      if (e.target.closest('[data-leave]')) { leave(); return; }
      if (e.target.closest('[data-report]')) {
        saveReflection().then(function () { if (saved && saved.res.id) UI.go('report', saved.res.id); else UI.go('report', 'guest'); });
      }
    });
    view.addEventListener('change', function (e) {
      var t = e.target;
      if (t.matches('[data-fill]')) { S.fill = +t.value; panel.querySelector('[data-crowdn]').textContent = MB.num(crowdCount()); savePrefs(); rebuildSoon(); }
      else if (t.matches('[data-dis]')) { var k = t.getAttribute('data-dis'); S.distractions = S.distractions.filter(function (x) { return x !== k; }); if (t.checked) S.distractions.push(k); savePrefs(); }
      else if (t.matches('[data-opt]')) { S[t.getAttribute('data-opt')] = t.checked; savePrefs(); if (t.getAttribute('data-opt') === 'house_lights') rebuildSoon(); }
    });
    view.addEventListener('input', function (e) { if (e.target.matches('[data-fill]')) panel.querySelector('[data-crowdn]').textContent = MB.num(Math.max(venueInfo().min, Math.round(venueInfo().max * +e.target.value))); });
    // looking around with the mouse or a finger
    cv.addEventListener('pointerdown', function (e) { look.drag = { x: e.clientX, y: e.clientY, yaw: look.yaw, pitch: look.pitch }; try { cv.setPointerCapture(e.pointerId); } catch (x) {} });
    cv.addEventListener('pointermove', function (e) {
      if (!look.drag || state === 'setup' || state === 'mic') return;
      look.yaw = Math.max(-2.6, Math.min(2.6, look.drag.yaw - (e.clientX - look.drag.x) * 0.005));
      look.pitch = Math.max(-1.1, Math.min(0.7, look.drag.pitch - (e.clientY - look.drag.y) * 0.004));
    });
    cv.addEventListener('pointerup', function () { look.drag = null; });
    cv.addEventListener('wheel', function (e) { if (R && S.prompter === 'scroll') { R.scroll = Math.max(0, R.scroll + (e.deltaY > 0 ? 3 : -3)); drawScrollCue(); } }, { passive: true });
    // swipe the cue card on a phone
    var sw = null;
    view.addEventListener('touchstart', function (e) { var c = e.target.closest('[data-cuecard]'); if (c) sw = { x: e.touches[0].clientX }; }, { passive: true });
    view.addEventListener('touchend', function (e) { if (!sw) return; var dx = e.changedTouches[0].clientX - sw.x; sw = null; if (dx < -40) nextCard(); else if (dx > 40) prevCard(); });
    view.addEventListener('dblclick', function (e) { if (e.target.closest('[data-cuecard]')) nextCard(); });
    on(document, 'keydown', function (e) {
      if (e.target.matches && e.target.matches('input, textarea')) return;
      if (state === 'talk' || state === 'qa') {
        if (e.key === 'ArrowRight' || e.key === ' ' || e.key === 'PageDown') { e.preventDefault(); nextCard(); }
        else if (e.key === 'ArrowLeft' || e.key === 'PageUp') { e.preventDefault(); prevCard(); }
        else if (e.key === 'ArrowUp' && R) { R.scroll = Math.max(0, R.scroll - 4); drawScrollCue(); }
        else if (e.key === 'ArrowDown' && R) { R.scroll += 4; drawScrollCue(); }
        else if (e.key === 'e' || e.key === 'E') { if (state === 'qa') finish(); else endTalk(); }
      }
    });

    /* ---------------------------------------------------------------- load */
    var fontsP = (document.fonts && document.fonts.load) ? Promise.race([Promise.all([document.fonts.load('900 40px Archivo'), document.fonts.load('700 30px Inter')]), new Promise(function (r) { setTimeout(r, 1500); })]).catch(function () {}) : Promise.resolve();
    var xrP = navigator.xr && navigator.xr.isSessionSupported ? Promise.all([
      navigator.xr.isSessionSupported('immersive-vr').catch(function () { return false; }),
      navigator.xr.isSessionSupported('immersive-ar').catch(function () { return false; })]).then(function (r) { xrOK = { vr: !!r[0], ar: !!r[1] }; }) : Promise.resolve();
    function destroy() {
      alive = false;
      clearTimeout(rebuildTimer);
      try { if (session) session.end(); } catch (e) {}
      try { if (recorder && recorder.state !== 'inactive') recorder.stop(); } catch (e) {}
      try { if (transcript) transcript.stop(); } catch (e) {}
      try { if (voice) voice.stop(); } catch (e) {}
      try { if (stream) stream.getTracks().forEach(function (t) { t.stop(); }); } catch (e) {}
      try { if (window.speechSynthesis) speechSynthesis.cancel(); } catch (e) {}
      audio.close();
      listeners.forEach(function (l) { l[0].removeEventListener(l[1], l[2], l[3]); });
      try { if (renderer) { renderer.setAnimationLoop(null); if (venue) venue.dispose(); renderer.dispose(); } } catch (e) {}
      window.MB_STAGE = null;
    }
    var ready = Promise.all([MB.content(), UI.apiQuiet('get_stage', ref), MB.three(), fontsP, xrP]).then(function (r) {
      if (!alive) return;
      C = r[0]; info = r[1]; T = r[2];
      tmpV = new T.Vector3(); tmpV2 = new T.Vector3(); headV = new T.Vector3(); dirV = new T.Vector3(); quat = new T.Quaternion();
      S = Object.assign({}, info.prefs, ctx.me ? {} : guestPrefs());
      talk = info.talk || { title: 'Talk', cards: [], target_min: 0, venue: S.venue };
      drill = info.drill || null;
      if (drill) S.venue = drill.venue; else if (talk.venue && !isPublic) S.venue = talk.venue;
      if (!C.venueBy[S.venue]) S.venue = 'redcircle';
      cards = drill ? (drill.cards || []).slice() : (talk.cards || []).slice();
      init3D();
      buildVenue();
      showSetup();
      window.MB_STAGE = { state: function () { return state; }, R: function () { return R; }, voice: function () { return voice; }, venue: function () { return venue; },
        S: function () { return S; }, begin: begin, endTalk: endTalk, finish: finish, nextCard: nextCard, vrPreview: function (w) { if (w === 'results' && saved) vrResults(saved.res.score); else vrReady(); } };
    }, function (e) {
      panel.hidden = false;
      panel.innerHTML = '<div class="st-card"><h1>The stage didn\'t open</h1><div class="st-error">' + esc(e && e.message || 'Something went wrong.') + '</div><div class="st-actions"><button class="st-btn" data-leave>Leave</button></div></div>';
      if (e && e.denied) { UI.after = '#stage/' + ref; UI.go('auth'); }
    });
    return { ready: ready, destroy: destroy };
  });
})();

/* ===== talks.html ===== */
(function () {
  var esc = UI.esc;
  var WPM = 140;
  function words(t) { return (String(t || '').trim().match(/\S+/g) || []).length; }

  UI.page('talks', { title: 'Talks', nav: 'Talks', icon: 'cards', auth: 'user', order: 20 }, function (view, ctx) {
    var arg = ctx.args[0];
    view.innerHTML = '<div class="ui-wrap"><div class="ui-skel" style="height:240px"></div></div>';

    /* ---------------------------------------------------------------- list */
    function list() {
      return Promise.all([UI.api('get_talks'), MB.content()]).then(function (r) {
        var talks = r[0].talks, c = r[1];
        view.innerHTML = '<div class="ui-wrap"><div class="ui-page-head"><div><div class="eyebrow">Your talks</div><h1>What will you say?</h1>' +
          '<p class="muted">Each talk is a set of cue cards. Practise it as often as you like; every run gets a report.</p></div>' +
          '<a class="ui-btn primary" href="#talks/new" data-go="talks/new">' + UI.icon('plus') + 'New talk</a></div>' +
          (talks.length ? '<div class="tk-grid">' + talks.map(function (t) {
            var occ = c.templateBy[t.occasion];
            return '<article class="ui-card tk-card" data-id="' + esc(t.id) + '">' + (t.best != null ? '<span class="best">' + MB.ring(t.best, 48) + '</span>' : '') +
              '<h3>' + esc(t.title) + '</h3><div class="meta"><span class="ui-badge">' + esc(occ ? occ.name : 'Talk') + '</span><span class="ui-badge">' + t.target_min + ' min</span>' +
              '<span class="ui-badge">' + UI.plural(t.cards.length, 'card') + '</span><span class="ui-badge">' + esc(MB.venueName(t.venue)) + '</span></div>' +
              '<div class="first">' + esc(t.cards[0] ? t.cards[0].text : 'No cards yet.') + '</div>' +
              '<div class="small muted">' + (t.practiced ? 'Practised ' + UI.plural(t.practiced, 'time') + (t.last ? ', last ' + esc(UI.ago(t.last.when)) : '') : 'Not practised yet') + '</div>' +
              '<div class="ui-row"><a class="ui-btn primary sm" href="#stage/' + esc(t.id) + '" data-go="stage/' + esc(t.id) + '">' + UI.icon('mic') + 'Practise</a>' +
              '<a class="ui-btn sm" href="#talks/' + esc(t.id) + '" data-go="talks/' + esc(t.id) + '">' + UI.icon('edit') + 'Edit</a><span class="ui-spacer"></span>' +
              '<button class="ui-btn ghost icon sm" data-dup aria-label="Duplicate" title="Duplicate">' + UI.icon('copy') + '</button>' +
              '<button class="ui-btn ghost icon sm" data-del aria-label="Delete" title="Delete">' + UI.icon('trash') + '</button></div></article>';
          }).join('') + '</div>' : '<div class="ui-empty">' + UI.icon('cards') + '<h3>No talks yet</h3><p>Pick a template (toast, pitch, interview answer…) or paste a script you already have.</p>' +
            '<a class="ui-btn primary" href="#talks/new" data-go="talks/new">' + UI.icon('plus') + 'New talk</a></div>') + '</div>';
      });
    }

    /* ---------------------------------------------------------------- new: templates */
    function gallery() {
      return MB.content().then(function (c) {
        view.innerHTML = '<div class="ui-wrap"><a class="ui-btn ghost sm" href="#talks" data-go="talks">' + UI.icon('back') + 'Talks</a>' +
          '<div class="ui-page-head" style="margin-top:10px"><div><div class="eyebrow">New talk</div><h1>Start from a shape that works</h1>' +
          '<p class="muted">Each template is a proven structure with example cards. Replace the words with yours.</p></div></div>' +
          '<div class="tk-grid">' +
          '<button class="ui-card tk-tpl" data-paste>' + UI.icon('copy') + '<h3>Paste my script</h3><p>Already written it? Paste it and we\'ll cut it into cue cards.</p></button>' +
          '<button class="ui-card tk-tpl" data-blank>' + UI.icon('edit') + '<h3>Blank talk</h3><p>Start with an empty card and build it your way.</p></button>' +
          c.templates.map(function (t) {
            return '<button class="ui-card tk-tpl" data-tpl="' + t.key + '">' + UI.icon(t.icon) + '<h3>' + esc(t.name) + '</h3><p>' + esc(t.blurb) + '</p>' +
              '<div class="ui-row"><span class="ui-badge">' + t.minutes + ' min</span><span class="ui-badge">' + UI.plural(t.cards.length, 'card') + '</span><span class="ui-badge">' + esc(MB.venueName(t.venue)) + '</span></div></button>';
          }).join('') + '</div></div>';
      });
    }
    function pasteModal() {
      var m = UI.modal('<h2>Paste your script</h2><p class="muted">Blank lines start a new card. Long paragraphs are split into cards of about 45 words.</p>' +
        '<form class="ui-stack" data-pasteform><label class="ui-field"><span>Title</span><input type="text" name="title" required maxlength="120" placeholder="My talk"></label>' +
        '<label class="ui-field"><span>Script</span><textarea name="script" rows="10" required placeholder="Paste or type your talk here…"></textarea></label>' +
        '<p class="ui-hint" data-pastecount>0 words</p>' +
        '<div class="ui-row end"><button type="button" class="ui-btn ghost" data-close>Cancel</button><button class="ui-btn primary" type="submit">' + UI.icon('cards') + 'Make cards</button></div></form>', { wide: true });
      var f = m.el.querySelector('form');
      f.script.addEventListener('input', function () { var w = words(f.script.value); m.el.querySelector('[data-pastecount]').textContent = w + ' words · about ' + MB.fmtSecs(w / WPM * 60) + ' at ' + WPM + ' wpm · ' + UI.plural(MB.splitScript(f.script.value).length, 'card'); });
      f.addEventListener('submit', function (e) {
        e.preventDefault();
        var cards = MB.splitScript(f.script.value), w = words(f.script.value);
        UI.busy(f.querySelector('[type=submit]'), UI.api('save_talk', null, { title: f.title.value, occasion: 'other', target_min: Math.max(1, Math.round(w / WPM)), venue: 'redcircle', cards: cards }))
          .then(function (r) { m.close(); UI.go('talks', r.talk.id); });
      });
    }

    /* ---------------------------------------------------------------- editor */
    function editor(id) {
      return Promise.all([UI.api('get_talk', id), MB.content()]).then(function (r) {
        var t = r[0].talk, c = r[1], dirty = false;
        var tpl = c.templateBy[t.occasion];
        view.innerHTML = '<div class="ui-wrap"><a class="ui-btn ghost sm" href="#talks" data-go="talks">' + UI.icon('back') + 'Talks</a>' +
          '<div class="tk-ed" style="margin-top:12px"><form data-ed><div class="tk-fields">' +
          '<label class="ui-field wide"><span>Title</span><input type="text" name="title" value="' + esc(t.title) + '" maxlength="120" required></label>' +
          '<label class="ui-field"><span>Occasion</span><select name="occasion">' + c.occasions.map(function (o) { return '<option value="' + o.key + '"' + (o.key === t.occasion ? ' selected' : '') + '>' + esc(o.name) + '</option>'; }).join('') + '</select></label>' +
          '<label class="ui-field"><span>Target (min)</span><input type="number" name="target_min" min="0.5" max="60" step="0.5" value="' + t.target_min + '"></label>' +
          '<label class="ui-field"><span>Room</span><select name="venue">' + c.venues.map(function (v) { return '<option value="' + v.key + '"' + (v.key === t.venue ? ' selected' : '') + '>' + esc(v.name) + '</option>'; }).join('') + '</select></label></div>' +
          '<div class="tk-cards" data-cards></div>' +
          '<div class="ui-row" style="margin-top:12px"><button type="button" class="ui-btn" data-addcard>' + UI.icon('plus') + 'Add a card</button>' +
          '<button type="button" class="ui-btn ghost" data-resplit>' + UI.icon('copy') + 'Paste a script into cards</button></div></form>' +
          '<aside class="tk-side"><div class="ui-card"><div class="eyebrow">Estimated length</div><div class="tk-time" data-time>0:00</div><div class="tk-bar"><i data-bar></i></div>' +
          '<div class="small muted" data-timenote></div></div>' +
          '<div class="ui-card tk-save"><button class="ui-btn primary block" data-save>' + UI.icon('check') + 'Save</button><button class="ui-btn block" data-practise>' + UI.icon('mic') + 'Save and practise</button></div>' +
          '<div class="ui-card"><div class="eyebrow">Cue card craft</div><ul class="tk-tips small muted" style="padding-left:18px;margin:0">' +
          ((tpl && tpl.tips) || []).concat(['Write how you speak, not how you write.', 'One idea per card. Put a big word on the screen for each.', 'Mark a pause with " / " and stage directions in (brackets).'])
            .map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul></div></aside></div></div>';
        var form = view.querySelector('[data-ed]'), box = view.querySelector('[data-cards]');
        var cards = t.cards.length ? t.cards.map(function (x) { return { text: x.text, slide: x.slide || '' }; }) : [{ text: '', slide: '' }];
        function drawCards(focus) {
          box.innerHTML = cards.map(function (cd, i) {
            return '<div class="ui-card tk-c" data-i="' + i + '"><span class="no">' + (i + 1) + '</span><div><textarea data-text placeholder="What you\'ll say on this card…" maxlength="700">' + esc(cd.text) + '</textarea>' +
              '<div class="slide"><span>' + UI.icon('image') + ' Screen</span><input type="text" data-slide maxlength="60" placeholder="Big words behind you (optional)" value="' + esc(cd.slide) + '"></div>' +
              '<div class="est" data-est>' + words(cd.text) + ' words · ~' + MB.fmtSecs(words(cd.text) / WPM * 60) + '</div></div>' +
              '<div class="tools"><button type="button" class="ui-btn ghost icon sm" data-up aria-label="Move up"' + (i ? '' : ' disabled') + '>↑</button>' +
              '<button type="button" class="ui-btn ghost icon sm" data-down aria-label="Move down"' + (i < cards.length - 1 ? '' : ' disabled') + '>↓</button>' +
              '<button type="button" class="ui-btn ghost icon sm" data-rm aria-label="Remove card">' + UI.icon('trash') + '</button></div></div>';
          }).join('');
          if (focus != null) { var ta = box.querySelectorAll('textarea')[focus]; if (ta) ta.focus(); }
          times();
        }
        function times() {
          var w = cards.reduce(function (s, x) { return s + words(x.text); }, 0), secs = w / WPM * 60 + cards.length * 2.5, tgt = (+form.target_min.value || t.target_min) * 60;
          var el = view.querySelector('[data-time]');
          el.textContent = MB.fmtSecs(secs);
          el.className = 'tk-time ' + (secs > tgt * 1.1 ? 'over' : secs > tgt * 0.7 ? 'ok' : '');
          var bar = view.querySelector('[data-bar]'); bar.style.width = Math.min(100, secs / tgt * 100) + '%'; bar.className = secs > tgt * 1.1 ? 'over' : '';
          view.querySelector('[data-timenote]').textContent = w + ' words at ' + WPM + ' words a minute, plus a breath per card. Target ' + MB.fmtSecs(tgt) + '.' +
            (secs > tgt * 1.1 ? ' Cut a card or an example.' : secs < tgt * 0.7 ? ' Room for one more story.' : ' Right on.');
        }
        drawCards();
        box.addEventListener('input', function (e) {
          var row = e.target.closest('[data-i]'); if (!row) return;
          var i = +row.getAttribute('data-i'); dirty = true;
          if (e.target.matches('[data-text]')) { cards[i].text = e.target.value; row.querySelector('[data-est]').textContent = words(e.target.value) + ' words · ~' + MB.fmtSecs(words(e.target.value) / WPM * 60); times(); }
          if (e.target.matches('[data-slide]')) cards[i].slide = e.target.value;
        });
        form.addEventListener('input', function (e) { if (!e.target.closest('[data-cards]')) { dirty = true; times(); } });
        form.addEventListener('submit', function (e) { e.preventDefault(); save(); });
        view.addEventListener('click', function (e) {
          var row = e.target.closest('[data-i]'), i = row ? +row.getAttribute('data-i') : -1;
          if (e.target.closest('[data-up]') && i > 0) { var a = cards[i]; cards[i] = cards[i - 1]; cards[i - 1] = a; dirty = true; drawCards(); }
          else if (e.target.closest('[data-down]') && i < cards.length - 1) { var b = cards[i]; cards[i] = cards[i + 1]; cards[i + 1] = b; dirty = true; drawCards(); }
          else if (e.target.closest('[data-rm]')) { cards.splice(i, 1); if (!cards.length) cards.push({ text: '', slide: '' }); dirty = true; drawCards(); }
          else if (e.target.closest('[data-addcard]')) { cards.push({ text: '', slide: '' }); dirty = true; drawCards(cards.length - 1); }
          else if (e.target.closest('[data-resplit]')) {
            var m = UI.modal('<h2>Paste a script</h2><p class="muted">It replaces the cards below. Blank lines start new cards.</p><textarea rows="10" data-scr style="width:100%"></textarea>' +
              '<div class="ui-row end" style="margin-top:14px"><button class="ui-btn ghost" data-close>Cancel</button><button class="ui-btn primary" data-doit>Replace cards</button></div>', { wide: true });
            m.el.querySelector('[data-doit]').onclick = function () { var nc = MB.splitScript(m.el.querySelector('[data-scr]').value); if (nc.length) { cards = nc; dirty = true; drawCards(); } m.close(); };
          }
          else if (e.target.closest('[data-save]')) save();
          else if (e.target.closest('[data-practise]')) save().then(function () { UI.go('stage', t.id); });
        });
        function save() {
          var v = UI.formData(form);
          var btn = view.querySelector('[data-save]');
          return UI.busy(btn, UI.api('save_talk', t.id, { title: v.title, occasion: v.occasion, target_min: +v.target_min, venue: v.venue, cards: cards.filter(function (x) { return x.text.trim(); }) }))
            .then(function (res) { dirty = false; t = res.talk; UI.toast('Saved', 'ok'); return res; });
        }
        window.addEventListener('beforeunload', function (e) { if (dirty && document.body.contains(form)) { e.preventDefault(); e.returnValue = ''; } });
      });
    }

    view.addEventListener('click', function (e) {
      var card = e.target.closest('.tk-card');
      if (card && e.target.closest('[data-del]')) {
        UI.confirm({ title: 'Delete this talk?', text: 'Its reports stay in your history.', ok: 'Delete', danger: true }).then(function (yes) {
          if (yes) UI.api('delete_talk', card.getAttribute('data-id')).then(function () { UI.toast('Deleted'); list(); });
        });
      } else if (card && e.target.closest('[data-dup]')) {
        UI.api('duplicate_talk', card.getAttribute('data-id')).then(function () { UI.toast('Copied', 'ok'); list(); });
      }
      var tp = e.target.closest('[data-tpl]');
      if (tp) UI.busy(tp, UI.api('new_talk_from_template', tp.getAttribute('data-tpl'))).then(function (r) { UI.go('talks', r.talk.id); });
      if (e.target.closest('[data-blank]')) UI.api('save_talk', null, { title: 'Untitled talk', occasion: 'other', target_min: 5, venue: 'redcircle', cards: [{ text: 'Start here.' }] }).then(function (r) { UI.go('talks', r.talk.id); });
      if (e.target.closest('[data-paste]')) pasteModal();
    });
    if (arg === 'new') return gallery();
    if (arg) return editor(arg);
    return list();
  });
})();
