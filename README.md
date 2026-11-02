# MrBigStage

A public-speaking rehearsal app. You step onto a stage in VR (Meta Quest or any WebXR headset) or on an ordinary screen,
give your talk to a 3D audience that reacts to you, and get coached on how you really sound and look: pace, pauses,
hesitation sounds, projection, vocal variety, steadiness and timbre, sentence endings, eye contact, gestures and timing,
blended into one **Stage Confidence** score. For anyone who has to speak: a toast, an interview, a class, a pitch, a
conference talk, or just stage fright. Built on [Anvil](https://anvil.works).

- **App repo:** github.com/arkulinskis/mrbigstage (branch `master`). Anvil pulls `master`.
- **Live:** https://mrbigstage.anvil.app

## What it does

**For everyone (no account needed):**
- **Landing page** with a live counter (talks, minutes, audience faced), "Confidence, decoded" (the ten things we measure and their weights), the seven rooms, features, FAQ.
- **Try it now:** the sample talk (`#stage/sample`) and every drill work without an account; the score is shown (`score_preview`) and a preview report (`#report/guest`) lives in the browser tab.

**On stage** (`#stage/<talk id | sample | free | drill:key>`):
- **Seven rooms:** The Red Circle (1,200-seat theatre, round red carpet, spotlight, big screen, red letters), The Boardroom (glass wall, city at dusk, laptop as monitor), Lecture Hall (tiered benches, chalkboard), Wedding Reception (round tables, string lights), Town Hall (folding chairs, lectern, flags), The Arena (5,000 people, moving light beams, side screens), Interview Room (panelists, desk, tablet).
- **Setup:** crowd size, crowd mood (warm / neutral / tough), notes (cue cards in the left hand, floor confidence monitor, voice-following teleprompter, none), live coach (off / subtle lights / full nudges), distractions (coughs, phone, latecomers, someone leaving, mic squeal), audience Q&A at the end, applause, house lights, voice recording, transcript.
- **Green room:** mic check (room-noise calibration, then "say your first line"), nerves rating 1-5, optional box breathing first.
- **The talk:** walk-on applause, clock (amber in the last minute, red when over), cue cards (keyboard, buttons, swipe; in VR A/X B/Y, thumbstick flick, hold B/Y to finish), slide words on the big screen, live coach panel (pace needle, volume, ums, pauses, melody trace) and nudges ("Slow down", "Look to the left side", "Nice pause"…).
- **The audience reacts:** attention per section (left/centre/right) rises with good delivery and when you look at them, falls with long silences, fillers and monotone; engaged people lean in and nod, bored ones check phones or look away, tough crowds cross arms; applause and standing ovations at the end.
- **Q&A:** someone stands with a hand up under a spotlight, the question is spoken (speech synthesis) and shown; questions fit the room (interview, boardroom, town hall, general).
- **Results:** score ring + band, strengths, three coaching tips, XP, new badges, level-up, streak, nerves after, a note for next time; in VR a results panel.
- **VR:** Enter VR (immersive-vr) or "Audience in my room" (passthrough, immersive-ar), controller laser + trigger for panels.

**Members:**
- **Backstage** (`#home`): greeting, practise-next button, level/XP/streak/people faced, first-time goal picker and three ways to start, your talks, recent sessions, confidence trend, "work on this" (weakest skill → drill), nerves before/after bars, tip of the day.
- **Talks** (`#talks`, `#talks/new`, `#talks/<id>`): list (best score ring, practised count), ten templates (big-idea talk, lightning talk, wedding toast, tell me about yourself, team update, investor pitch, tribute, class presentation, asking for a raise, introduce yourself), paste-a-script splitter, cue-card editor (screen words per card, reorder, estimated length vs target at 140 wpm, craft tips).
- **Drills** (`#drills`, `#drills/handbook`): twelve drills (Power Pause, Metronome, Filler Zapper, Pitch Ladder, Back Row, Table Topics, Elevator Pitch, Lighthouse eye-contact beacons, Vocal Warm-up, Box Breathing, Hot Seat Q&A, Raise a Glass) with "For you" on the weakest skill; the speaker's handbook (before you go on, structure, voice, body and eyes, Q&A, after the talk).
- **Reports** (`#report/<id>`): score + change vs the last run, the ten parts with what each measures (tap a line) and last-run ticks, a second-by-second timeline (loudness, pitch, pace band, pauses, hesitations, rising/fading endings, card changes, gaze strip), playback of the recording kept on this device with a moving cursor, coach tips with drill buttons, the numbers, notes, delete.
- **Progress** (`#progress`): level (Open Mic → Legend), totals, Stage Confidence over time (click a point), 12-week calendar, skills first-five vs last-five, nerves trend, 16 badges, full history.
- **Profile:** goal, favourite room, notes, coach, filler-word list, recording and transcript switches, delete recordings on this device.

**For admins** (`#admin`; arkulinskis@gmail.com becomes an admin on first sign-in):
- **Stages:** sessions, minutes, speakers, average score; rooms and drills used, VR vs screen, average per skill, latest sessions (with/without demo speakers).
- **Feedback inbox, Users, Demo data** (four demo speakers with talks and 16 sessions each, getting better over time).

**Privacy:** the voice is analysed in the browser; only numbers are saved. Recordings stay in the browser (IndexedDB, last 12). The transcript (opt-in) uses the browser's speech service and only counts words.

## Setting it up in Anvil (once)

1. In the Anvil editor: **Create app → Clone from GitHub**, and paste `https://github.com/arkulinskis/mrbigstage`.
2. **Users** service: email + password and "Continue with Google", sign-up allowed (already set in `anvil.yaml`; check it).
3. Open the app in the editor. If it shows a **Schema Mismatch** alert, choose **"The schema of the source code is correct"** so Anvil creates the tables.
4. **Run** it and sign up with **arkulinskis@gmail.com** straight away (that account becomes the admin).
5. **Publish** (Publish → public URL, or your own domain). The microphone and VR need HTTPS, which Anvil provides.

<!-- libraries:start -->
## Libraries and outside services

What this project uses besides its own code. Generated by `APP_MAKER/tools/libraries.py`; to change it, edit `APP_MAKER/libraries/catalog.py` and re-run the script.

| Name | How it gets in | Used here for |
|---|---|---|
| [three.js](https://threejs.org) r158 | Copied into the app | the stage and the audience you rehearse in front of |
| [Google Fonts](https://fonts.google.com) | Loaded from a CDN | Archivo, Inter |

**Built into the browser:** Canvas 2D, WebGL, WebXR (step onto the stage in a headset), Speech synthesis (spoken prompts on the stage), Speech recognition (listens to your talk while you rehearse), Web Audio API, Camera, microphone and screen, MediaRecorder, localStorage, File downloads (Blob), IndexedDB.

**Anvil platform:** Anvil, Anvil Data Tables, Anvil JS bridge (anvil.js), Anvil Users.

**Build and test tools (not shipped):** Node.js, PyYAML, Headless Chrome (DevTools Protocol).

<!-- libraries:end -->

## Working on it

See `.claude/skills/mrbigstage/SKILL.md`. In short:

```
python -I tools/check.py --ui                    # syntax, server tests, headless UI tests (a fake mic speaks) → ALL CHECKS PASSED
python -I tools/preview/devserver.py 8765        # the app on in-memory data: http://localhost:8765/  (?as=ana#home, ?as=admin#admin)
python tools/deploy.py                           # dry run (needs PyYAML, so no -I)
python tools/deploy.py --push "Message"          # deploy: commit + push to GitHub, Anvil pulls it
```

## Project layout

```
web/            core.js/core.css (engine + tokens), app.js (header, footer, icons), pages/*.html
  pages/_mb.html     MB: content cache, three.js loader, the voice analyser (MB.Voice), transcript, recordings, charts
  pages/_venue.html  MB.Venue (the seven 3D rooms + instanced reacting audience) and MB.CrowdAudio (synthesised crowd sounds)
  pages/stage.html   the stage: setup, green room, talk, Q&A, results, VR
client_code/    Main.py (the only Anvil form), legal.py
server_code/    content.py (venues, drills, templates, parts, badges…), Scoring.py, Talks.py, Sessions.py, DemoData.py, Admin.py, …
assets/         icon.svg + PNG icons, three.min.js (r158)
tools/          sync_to_anvil.py (settings + tables), deploy.py, check.py, preview/ (dev server, UI tests + speech.wav, screenshots), testing/
```
