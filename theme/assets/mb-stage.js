/* mb-stage.js: the stage (was web/pages/stage.html): setup, mic check + green room, walk on, the talk in VR or on
   this screen, Q&A, applause, score. Voice: mb.js MB.Voice. Rooms: mb-venue.js. Scores: server Scoring.py.
   Tests: window.MB_TEST = {fast: true} shortens the green room and walk-on; window.MB_STAGE exposes state. */
(function () {
  'use strict';
  var MB = window.MB;
  var esc = UI.esc;
  var NERVE_FACES = ['', '😌', '🙂', '😬', '😰', '😱'];

  /* MB.mountStage(view, {args, me}) -> {ready, destroy}: Pages/Stage calls it on show and destroy() on hide. */
  MB.mountStage = function (view, ctx) {
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
      '<div class="st-panel" data-panel><div class="st-card"><div class="st-tag"><i></i>Loading the stage</div><h1>Setting up the room…</h1><p>Lights, seats, a crowd of people. One moment.</p></div></div></div>';
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

    /* ---------------------------------------------------------------- house music
       Real tracks streamed by ArkMusic (web/pages/_arkmusic.html), only while you set up the room and on the
       results. It always stops before the mic check, so it never reaches the voice analysis. */
    function houseMusic(what) {
      if (!window.ArkMusic) return;
      if (!what || !UI.store.get('house_music', true)) { ArkMusic.stop(what ? 0.5 : 0.8); return; }
      ArkMusic.play(what === 'results' ? ['nailed-it', 'bright-road'] : ['my-love-for-you', 'bright-road'], { volume: 0.35, fade: 1.5 });
    }

    /* ---------------------------------------------------------------- setup panel */
    function showSetup() {
      houseMusic('setup');
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
      panel.innerHTML = '<div class="st-card" data-setup><div class="st-tag"><i></i>' + (drill ? 'Drill' : ref === 'sample' ? 'Sample talk' : ref === 'free' ? 'Free talk' : 'Your talk') + '</div>' +
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
        (window.ArkMusic ? '<label class="st-check"><input type="checkbox" data-housemusic' + (UI.store.get('house_music', true) ? ' checked' : '') + '>House music while I set up (stops before the mic check)</label>' : '') +
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
      houseMusic(null);
      panel.hidden = false;
      panel.innerHTML = '<div class="st-card"><div class="st-tag"><i></i>Green room</div><h1>Mic check</h1>' +
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
      houseMusic('results');
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
      panel.innerHTML = '<div class="st-card"><div class="st-tag"><i></i>' + (noScore ? 'Done' : 'Stage Confidence') + '</div>' +
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
      houseMusic(null);
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
          panel.innerHTML = '<div class="st-card"><div class="st-tag"><i></i>In the headset</div><h1>You\'re on stage</h1><p>Take the headset off or press the menu button to come back here.</p></div>';
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
      else if (t.matches('[data-housemusic]')) { UI.store.set('house_music', t.checked); houseMusic(t.checked ? 'setup' : null); }
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
      houseMusic(null);
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
  };
})();
