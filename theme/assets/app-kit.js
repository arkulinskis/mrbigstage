/* app-kit.js: small browser helpers Python reaches through window.UI: light/dark (applied in <head>, before
   the first paint), browser storage, the icon table (tools/build_icons.py makes icons.css from it), esc, plural.
   The app itself is Python Forms; any JavaScript "engine" (canvas, SVG, maps, audio) goes in its own asset file. */
(function () {
  'use strict';
  var UI = window.UI = window.UI || {};
  UI.config = { key: 'mrbigstage' };   // prefix for this app's browser storage
  UI.esc = function (s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  };
  UI.plural = function (n, one, many) { return n + ' ' + (n === 1 ? one : (many || one + 's')); };
  UI.store = {
    get: function (k, dflt) { try { var v = localStorage.getItem(UI.config.key + '.' + k); return v == null ? dflt : JSON.parse(v); } catch (e) { return dflt; } },
    set: function (k, v) { try { localStorage.setItem(UI.config.key + '.' + k, JSON.stringify(v)); } catch (e) {} }
  };
  UI.ICONS = {
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
    more: '<circle cx="5" cy="12" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="19" cy="12" r="1.3"/>',
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
    cards: '<rect x="3" y="6" width="13" height="15" rx="2"/><path d="M8 3h11a2 2 0 0 1 2 2v13"/>',
    up: '<path d="M12 19V5M6 11l6-6 6 6"/>',
    down: '<path d="M12 5v14M6 13l6 6 6-6"/>'
  };
  /* Light / dark: applied here, in <head>, so the first paint already has the right colours.
     Python (client_code/state.py) calls UI.setTheme when someone picks Auto / Light / Dark. */
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
  UI.reducedMotion = function () { return !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches); };
  UI.icon = function (name, cls) {
    return '<svg class="ui-ic ' + (cls || '') + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" ' +
      'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (UI.ICONS[name] || UI.ICONS.sparkle) + '</svg>';
  };

  /* Accessibility glue for things the Python side shows with classes only (WCAG AA, 2026-11-04):
     - error and note messages (Label roles msg-error / msg-note / msg-ok) are read out by screen readers;
     - toggle buttons in a .ui-seg group say which one is chosen (aria-pressed follows the "on" class);
     - an icon image inside a button with its own text (Button prop:icon="_/theme/x.svg") gets alt="";
     - Anvil's own pieces: the "Build web apps with Anvil" banner link and a notification's close button get names.
     One observer for the whole page, so every page and dialog gets it without extra code. */
  var A11Y = '.anvil-role-msg-error,.anvil-role-msg-note,.anvil-role-msg-ok,.ui-seg button,button img:not([alt]),#anvil-badge,[data-notify="dismiss"],.anvil-close';
  UI.a11y = function (el) {
    if (!el || el.nodeType !== 1) return;
    var c = el.classList, want = null;
    if (c.contains('anvil-role-msg-error')) want = 'alert';
    else if (c.contains('anvil-role-msg-note') || c.contains('anvil-role-msg-ok')) want = 'status';
    if (want && el.getAttribute('role') !== want) el.setAttribute('role', want);
    if (el.tagName === 'BUTTON' && el.closest('.ui-seg')) {
      var on = c.contains('on') ? 'true' : 'false';
      if (el.getAttribute('aria-pressed') !== on) el.setAttribute('aria-pressed', on);
    }
    if (el.tagName === 'IMG' && !el.hasAttribute('alt') && el.closest('button')) el.setAttribute('alt', '');
    if (el.id === 'anvil-badge' && !el.hasAttribute('aria-label')) el.setAttribute('aria-label', 'Built with Anvil (opens anvil.works)');
    if ((el.getAttribute('data-notify') === 'dismiss' || c.contains('anvil-close')) && el.getAttribute('aria-hidden') === 'true') {
      el.removeAttribute('aria-hidden');
      el.setAttribute('aria-label', 'Close');
    }
  };
  function a11yScan(root) {
    if (!root || root.nodeType !== 1) return;
    UI.a11y(root);
    var list = root.querySelectorAll(A11Y);
    for (var i = 0; i < list.length; i++) UI.a11y(list[i]);
  }
  function a11yStart() {
    a11yScan(document.body);
    new MutationObserver(function (records) {
      for (var i = 0; i < records.length; i++) {
        var r = records[i];
        if (r.type === 'attributes') UI.a11y(r.target);
        else for (var j = 0; j < r.addedNodes.length; j++) a11yScan(r.addedNodes[j]);
      }
    }).observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['class'] });
  }
  if (document.body) a11yStart(); else document.addEventListener('DOMContentLoaded', a11yStart);
})();
