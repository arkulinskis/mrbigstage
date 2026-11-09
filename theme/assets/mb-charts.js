/* mb-charts.js: the SVG drawings the pages show (the Python pages put the returned markup into a Components/Chart).
   MB.heroArt()            the landing page's theatre (spotlight, red circle, speaker, rows of faces)
   MB.mixBar(parts)        the landing page's weight strip of the ten skills
   MB.trendChart(trend)    Progress: Stage Confidence over time (points link to their report)
   MB.nervesChart(list)    Progress: nerves before / after
   MB.calendar(days)       Progress: the 12-week practice calendar
   MB.mountTape(box, id, timeline, onDeleted)  Report: the recording kept in this browser, with the timeline cursor */
(function () {
  'use strict';
  var MB = window.MB = window.MB || {};
  var esc = UI.esc;

  function fmtDate(iso, opts) {
    if (!iso) return '';
    var d = iso.length <= 10 ? new Date(iso + 'T12:00:00') : new Date(iso);
    return d.toLocaleDateString([], opts || { day: 'numeric', month: 'short', year: 'numeric' });
  }
  MB.fmtDate = fmtDate;
  MB.fmtDateTime = function (iso) {
    return iso ? new Date(iso).toLocaleString([], { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '';
  };

  MB.heroArt = function () {
    var rows = '';
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
  };

  MB.mixBar = function (parts) {
    var cols = ['#e62b1e', '#ff6a5c', '#ffb547', '#c27400', '#2ee59d', '#18845a', '#5b8def', '#b46bdf', '#8a847c', '#3d3d3d'];
    return '<div class="lp-mix" aria-hidden="true">' + (parts || []).map(function (p, i) {
      return '<i style="width:' + p.weight + '%;background:' + cols[i % cols.length] + '" title="' + esc(p.label + ' ' + p.weight + '%') + '"></i>';
    }).join('') + '</div>';
  };

  MB.trendChart = function (trend) {
    trend = trend || [];
    if (trend.length < 2) return '<p class="muted">Two sessions and your line appears here.</p>';
    var W = 640, H = 200, pad = 28, n = trend.length;
    var X = function (i) { return pad + i / (n - 1) * (W - pad - 10); }, Y = function (v) { return H - 22 - v / 100 * (H - 40); };
    var o = '<svg class="pg-chart" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Stage Confidence over time">';
    [25, 50, 75, 100].forEach(function (g) { o += '<line x1="' + pad + '" x2="' + (W - 10) + '" y1="' + Y(g) + '" y2="' + Y(g) + '" stroke="var(--c-line)"/><text x="0" y="' + (Y(g) + 3) + '">' + g + '</text>'; });
    o += '<rect x="' + pad + '" y="' + Y(100) + '" width="' + (W - pad - 10) + '" height="' + (Y(78) - Y(100)) + '" fill="var(--c-good)" opacity=".07"/>';
    var d = trend.map(function (t, i) { return (i ? 'L' : 'M') + X(i).toFixed(1) + ' ' + Y(t.c).toFixed(1); }).join('');
    o += '<path d="' + d + ' L' + X(n - 1) + ' ' + Y(0) + ' L' + X(0) + ' ' + Y(0) + 'Z" fill="var(--c-brand)" opacity=".08"/><path d="' + d + '" fill="none" stroke="var(--c-brand)" stroke-width="2.5" stroke-linejoin="round"/>';
    trend.forEach(function (t, i) {
      o += '<a href="#report/' + encodeURIComponent(t.id) + '"><circle cx="' + X(i).toFixed(1) + '" cy="' + Y(t.c).toFixed(1) + '" r="4.5" fill="var(--c-surface)" stroke="var(--c-brand)" stroke-width="2"><title>' +
        esc(t.title) + ': ' + t.c + ' (' + fmtDate(t.when) + ')</title></circle></a>';
    });
    o += '<text x="' + pad + '" y="' + H + '">' + esc(fmtDate(trend[0].when, { day: 'numeric', month: 'short' })) + '</text><text x="' + (W - 10) + '" y="' + H + '" text-anchor="end">' + esc(fmtDate(trend[n - 1].when, { day: 'numeric', month: 'short' })) + '</text>';
    return o + '</svg>';
  };

  MB.nervesChart = function (list) {
    list = list || [];
    if (list.length < 2) return '<p class="muted">Rate your nerves before and after a few sessions to see the trend.</p>';
    var W = 360, H = 150, n = list.length, X = function (i) { return 30 + i / (n - 1) * (W - 40); }, Y = function (v) { return 14 + (v - 1) / 4 * (H - 40); };
    var line = function (k, col) { var pts = list.map(function (x, i) { return x[k] ? X(i).toFixed(1) + ',' + Y(x[k]).toFixed(1) : null; }).filter(Boolean); return pts.length > 1 ? '<polyline points="' + pts.join(' ') + '" fill="none" stroke="' + col + '" stroke-width="2.5" stroke-linejoin="round"/>' : ''; };
    var o = '<svg class="pg-chart" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Nerves before and after each session">';
    [1, 3, 5].forEach(function (v) { o += '<text x="0" y="' + (Y(v) + 3) + '">' + ['', '😌', '', '😬', '', '😱'][v] + '</text>'; });
    o += line('before', 'var(--c-faint)') + line('after', 'var(--c-good)') + '</svg>';
    var b = list.filter(function (x) { return x.before; }).map(function (x) { return x.before; }), a = list.filter(function (x) { return x.after; }).map(function (x) { return x.after; });
    var note = '';
    if (b.length && a.length) {
      var mb = MB.mean(b), ma = MB.mean(a);
      note = '<p class="muted small">On a scale of 1 (calm) to 5 (terrified): ' + mb.toFixed(1) + ' before, ' + ma.toFixed(1) + ' after.' + (mb - ma >= 0.3 ? ' The stage calms you down.' : '') + '</p>';
    }
    return o + '<div class="mb-legend"><span><i style="background:var(--c-faint)"></i>Before</span><span><i style="background:var(--c-good)"></i>After</span></div>' + note;
  };

  MB.calendar = function (days) {
    days = days || [];
    if (!days.length) return '';
    var maxN = Math.max(1, Math.max.apply(null, days.map(function (x) { return x.n; })));
    var firstDow = new Date(days[0].day + 'T12:00:00').getDay();
    return '<div class="pg-cal">' + new Array(firstDow + 1).join('<i style="visibility:hidden"></i>') + days.map(function (x) {
      var l = x.n === 0 ? '' : x.n / maxN > 0.66 ? 'l3' : x.n / maxN > 0.33 ? 'l2' : 'l1';
      return '<i class="' + l + '" title="' + esc(fmtDate(x.day)) + ': ' + UI.plural(x.n, 'session') + '"></i>';
    }).join('') + '</div>';
  };

  /* The recording kept on this device (MB.Tapes), with the report timeline's cursor following playback. */
  MB.mountTape = function (box, id, tl, onDeleted) {
    tl = tl || {};
    return MB.Tapes.get(id).then(function (rec) {
      if (!rec || !rec.blob) { box.innerHTML = '<span class="muted small">' + UI.icon('mic') + ' Recordings are kept in this browser only. Turn on "Record my voice" before a talk to listen back here.</span>'; return false; }
      var url = URL.createObjectURL(rec.blob);
      box.innerHTML = '<audio controls preload="metadata" src="' + url + '" data-aud></audio><button type="button" class="ui-btn ghost sm" data-deltape>' + UI.icon('trash') + 'Delete recording</button>';
      var au = box.querySelector('[data-aud]'), secs = (tl.vol || []).length * (tl.step || 1);
      var root = box.closest('.rp-grid') || document;
      au.addEventListener('timeupdate', function () {
        var cur = root.querySelector('.mb-tl-cursor');
        if (!cur || !secs || !isFinite(au.currentTime)) return;
        var x = 34 + Math.min(1, au.currentTime / secs) * (1000 - 44);
        cur.setAttribute('x1', x); cur.setAttribute('x2', x);
      });
      box.querySelector('[data-deltape]').onclick = function () {
        MB.Tapes.del(id).then(function () { URL.revokeObjectURL(url); box.innerHTML = '<span class="muted small">Recording deleted.</span>'; if (onDeleted) onDeleted(); });
      };
      return true;
    });
  };
})();
