/* mb-venue.js: the 3D rooms and their audiences (MB.Venue) and the crowd sounds (MB.CrowdAudio). Was
   web/pages/_venue.html; used by mb-stage.js. */
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
