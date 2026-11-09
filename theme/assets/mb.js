/* mb.js: MrBigStage's shared engine (was web/pages/_mb.html). MB.content() (cached get_content), MB.three()
   (three.js on demand), MB.Voice (the voice analyser), MB.Transcript (opt-in browser speech), MB.Tapes (recordings
   in IndexedDB), SVG charts (MB.ring/spark/bars/timeline + the page charts in mb-charts.js). Python reaches it
   through client_code/mb.py. */
(function () {
  'use strict';
  var MB = window.MB = window.MB || {};
  var esc = UI.esc;

  /* ------------------------------------------------------------------ bridge to the Python app
     The engines below were written against window.UI of the JavaScript version. The Python side (client_code/mb.py,
     startup.py) provides MB_PY.call(fn, argsJson, quiet) -> JSON text, MB_PY.toast(msg, kind), MB_PY.after(hash). */
  function pyCall(quiet, fn, args) {
    var py = window.MB_PY;
    if (!py) return Promise.reject(new Error('The app is still starting.'));
    var out;
    try { out = py.call(fn, JSON.stringify(args || []), !!quiet); } catch (e) { return Promise.reject(e); }
    return Promise.resolve(out).then(function (r) {
      r = typeof r === 'string' ? JSON.parse(r) : (r || {});
      if (r.error) { var err = new Error(r.error); err.uiApi = true; err.denied = !!r.denied; throw err; }
      var res = r.result;
      if (res && typeof res === 'object' && res.ok === false) { var e2 = new Error(res.error || 'That didn\'t work.'); e2.uiApi = true; e2.expected = true; throw e2; }
      return res;
    });
  }
  UI.api = function (fn) { return pyCall(false, fn, Array.prototype.slice.call(arguments, 1)); };
  UI.apiQuiet = function (fn) { return pyCall(true, fn, Array.prototype.slice.call(arguments, 1)); };
  UI.toast = function (msg, kind) { if (window.MB_PY) window.MB_PY.toast(String(msg), kind || ''); };
  UI.after = null;
  UI.go = function (name) {
    var args = Array.prototype.slice.call(arguments, 1).filter(function (a) { return a != null && a !== ''; });
    var h = '#' + [name].concat(args.map(encodeURIComponent)).join('/');
    if (UI.after && window.MB_PY) { window.MB_PY.after(UI.after); UI.after = null; }
    if (location.hash === h && window.MB_PY) window.MB_PY.show(); else location.hash = h;
  };
  window.addEventListener('unhandledrejection', function (e) {
    if (e.reason && e.reason.uiApi) { e.preventDefault(); UI.toast(e.reason.message, 'error'); }
  });

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

})();
