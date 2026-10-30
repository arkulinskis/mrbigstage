"""Demo content, so the app never looks empty. Loaded automatically the first time anyone opens the app
(ensure_loaded), removed or reloaded from Admin -> Demo data. Removing it is remembered: it doesn't come back.

Demo speakers have is_demo=True and @example.com emails; they can't sign in (no password). Each gets talks
and a few weeks of practice sessions that get better over time. The sessions are made by synth(), which
invents believable measurements and a timeline, then scores them with the real Scoring code.
give_history(user) does the same for one real account (the dev server uses it for Ana).
"""
import datetime as dt
import math
import random

from anvil.tables import app_tables

from . import common as C
from . import content, Scoring

DEMO_USERS = [
    ("Priya Raman", "priya.demo@example.com", "conference"),
    ("Marcus Bell", "marcus.demo@example.com", "interview"),
    ("Léa Fontaine", "lea.demo@example.com", "event"),
    ("Tomás Okafor", "tomas.demo@example.com", "fear"),
]
# Tables that hold demo rows (each has an is_demo column). Children before parents.
DEMO_TABLES = ["sessions", "talks"]


def state():
    return C.get_setting("demo", "never")  # "never" | "loaded" | "removed"


def ensure_loaded():
    """Call from the app's main data callables: loads the demo once, unless an admin removed it."""
    if state() == "never":
        load()


def synth(skill, secs, seed, target=None, gaze=True, hands=False, drill=None):
    """Believable metrics + timeline for a speaker of `skill` (0 = shaky beginner, 1 = polished)."""
    R = random.Random(seed)

    def j(a):
        return R.uniform(-a, a)
    span = secs * (0.96 + j(0.02))
    speak = span * (0.62 + 0.14 * skill + j(0.04))
    wpm = 185 - 45 * skill + j(14) if R.random() < 0.6 else 115 + 30 * skill + j(10)
    syll = wpm / Scoring.WORDS_PER_SYLLABLE * span / 60.0
    mins = span / 60.0
    m = {"secs": secs, "span_secs": span, "speak_secs": speak, "start_delay": 2.5 - 1.8 * skill + abs(j(0.5)),
         "syllables": syll, "art_rate": syll / max(1, speak), "pace_cv": 0.5 - 0.3 * skill + abs(j(0.06)),
         "rush": 1.35 - 0.3 * skill + j(0.05), "pauses": mins * (2 + 7 * skill + j(1.5)),
         "pause_long": max(0, round((1 - skill) * 4 * mins / 3 + j(1))),
         "pause_mean": 0.6 + 0.7 * skill + j(0.15), "pause_longest": 4.5 - 2.5 * skill + abs(j(1)), "pause_card": 0,
         "fillers": max(0, round(mins * (6.5 - 6 * skill + j(0.8)))), "vol_snr": 12 + 20 * skill + j(3), "vol_var": 2 + 4 * skill + j(0.6),
         "quiet_share": max(0, 0.3 - 0.3 * skill + j(0.05)), "pitch_med": R.choice([118, 132, 196, 214]) + j(8),
         "pitch_std": 1.2 + 3.4 * skill + j(0.4), "pitch_range": 4 + 8 * skill + j(1), "monotone_share": max(0, 0.45 - 0.45 * skill + j(0.05)),
         "jitter": 1.1 - 0.7 * skill + abs(j(0.08)), "shimmer": 3.8 - 2.2 * skill + abs(j(0.3)), "clarity": 0.5 + 0.3 * skill + j(0.04),
         "centroid": 1500 + j(500), "phrases": max(3, round(mins * 9)), "tracked_gaze": gaze, "tracked_hands": hands}
    m["uptalk"] = round(m["phrases"] * max(0, 0.32 - 0.3 * skill + j(0.04)))
    m["trail"] = round(m["phrases"] * max(0, 0.28 - 0.26 * skill + j(0.04)))
    if gaze:
        aud = min(0.95, 0.35 + 0.55 * skill + j(0.05))
        left, mid = 0.15 + 0.17 * skill + j(0.03), 0.6 - 0.27 * skill + j(0.03)
        m.update(gaze_aud=aud, gaze_l=left, gaze_c=mid, gaze_r=max(0.02, 1 - left - mid), gaze_down=max(0, 1 - aud - 0.02),
                 gaze_back=max(0, 3 - 3 * skill), holds_pm=1.5 + 7 * skill + j(1))
    if hands:
        m.update(gest_share=0.05 + 0.4 * skill + j(0.05), sway=0.35 - 0.25 * skill + abs(j(0.03)))
    if target:
        m["target_secs"] = target
    if drill == "qa":
        m["questions"] = 3
    # timeline: one point a second (two for long talks)
    step = 1.0 if secs <= 900 else 2.0
    n = int(secs / step)
    vol, pitch, rate, gz, ev = [], [], [], [], []
    base_p = m["pitch_med"]
    talking, run, cards = True, 0.0, 0
    card_every = max(20, secs / 6)
    for i in range(n):
        t = i * step
        run += step
        if talking and run > R.uniform(4, 14 - 6 * (1 - skill)):
            talking, run = False, 0.0
            dur = R.uniform(0.5, 1.6 + skill) if R.random() > (1 - skill) * 0.15 else R.uniform(3.2, 5)
            ev.append([round(t, 1), "pause", round(dur, 1)])
        elif not talking and run >= 1:
            talking, run = True, 0.0
        if talking:
            vol.append(round(m["vol_snr"] + 4 * math.sin(t / 7.0) + j(m["vol_var"]), 1))
            pitch.append(round(base_p * (2 ** ((m["pitch_std"] * math.sin(t / 3.1 + R.random()) + j(1)) / 12)), 0))
            rate.append(round(max(2, wpm / 60 * 1.45 * (1 + j(m["pace_cv"] * 0.6)) * (1 + (m["rush"] - 1) * t / secs)), 1))
        else:
            vol.append(round(R.uniform(0, 3), 1))
            pitch.append(0)
            rate.append(0)
        if gaze:
            roll = R.random()
            gz.append(4 if roll > m["gaze_aud"] else 1 if roll < m["gaze_l"] * m["gaze_aud"] else
                      2 if roll < (m["gaze_l"] + m["gaze_c"]) * m["gaze_aud"] else 3)
        if t >= cards * card_every:
            ev.append([round(t, 1), "card", cards])
            cards += 1
    for kind in ("filler", "uptalk", "trail"):
        for _ in range(int(m["fillers" if kind == "filler" else kind])):
            ev.append([round(R.uniform(2, secs - 1), 1), kind, None])
    ev.sort(key=lambda e: e[0])
    m["cards"] = cards
    tl = {"step": step, "vol": vol, "pitch": pitch, "rate": rate, "events": ev}
    if gaze:
        tl["gaze"] = gz
    return m, tl


def add_session(user, talk, title, kind, venue, secs, skill, when, seed, drill=None, nerves=(None, None), reflection="", mode="vr"):
    v = content.venue(venue)
    target = (talk["target_min"] * 60) if talk is not None and talk["target_min"] else None
    if drill == "breathe":
        m, tl = {"secs": secs}, {"step": 1.0, "events": []}
    else:
        m, tl = synth(skill, secs, seed, target=target, gaze=True, hands=mode in ("vr", "ar"), drill=drill)
    s = Scoring.score(m)
    return app_tables.sessions.add_row(
        user=user, talk=talk, title=title, kind=kind, drill=drill, venue=venue, crowd=v["crowd"], mood="neutral", mode=mode,
        seconds=secs, confidence=s["confidence"], parts=s["parts"], metrics=s["metrics"], timeline=tl, nerves_before=nerves[0],
        nerves_after=nerves[1], reflection=reflection, created=when, is_demo=user["is_demo"] is True)


REFLECTIONS = [
    "Rushed the opening again. The story card worked though.", "Way less um-ing than last week!",
    "Forgot to look right. The right side of the room checked out.", "Paused before the big line and it felt huge.",
    "Nerves gone after the first minute.", "Ran long. Cut the second example.", "", "", "",
]


def give_history(user, days=21, seed=7, demo=False):
    """A few weeks of practice for one person: 3 talks, 16 sessions, getting better."""
    R = random.Random(seed)
    now = C.now()
    picks = ["idea", "interview", "toast"] if seed % 2 else ["lightning", "update", "pitch"]
    talks = []
    for i, key in enumerate(picks):
        t = content.template(key)
        talks.append(app_tables.talks.add_row(user=user, title=t["title"], occasion=key, venue=t["venue"], target_min=t["minutes"],
                                              cards=[dict(c) for c in t["cards"]], created=now - dt.timedelta(days=days + 2 - i),
                                              updated=now - dt.timedelta(days=R.randint(0, 4), hours=i), is_demo=demo))
    n = 16
    drills = ["powerpause", "zapper", "metronome", "lighthouse", "breathe", "backrow", "topics"]
    for k in range(n):
        skill = min(0.9, max(0.05, 0.12 + 0.55 * k / (n - 1) + R.uniform(-0.07, 0.07)))
        when = now - dt.timedelta(days=days - int(days * k / n), hours=R.randint(1, 10), minutes=R.randint(0, 59))
        nb = max(1, min(5, round(4.4 - 2.2 * k / n + R.uniform(-0.5, 0.5))))
        na = max(1, nb - R.choice([0, 1, 1, 2]))
        if k % 3 == 2:
            d = content.drill(drills[(k // 3) % len(drills)])
            secs = int(d["minutes"] * 60 * R.uniform(0.9, 1.1))
            add_session(user, None, d["name"], "drill", d["venue"], secs, skill, when, seed * 100 + k, drill=d["key"], nerves=(nb, na))
        else:
            t = talks[k % len(talks)]
            secs = int(t["target_min"] * 60 * R.uniform(0.85, 1.25))
            mode = "flat" if k % 5 == 4 else "vr"
            venue = t["venue"] if k % 4 else R.choice(["redcircle", "arena", "townhall"])
            add_session(user, t, t["title"], "talk", venue, secs, skill, when, seed * 100 + k, nerves=(nb, na),
                        reflection=R.choice(REFLECTIONS), mode=mode)
    return talks


def load():
    remove(remember=False)
    for i, (name, email, goal) in enumerate(DEMO_USERS):
        u = app_tables.users.get(email=email) or app_tables.users.add_row(email=email, enabled=False)
        u.update(display_name=name, is_demo=True, goal=goal, signed_up=C.now() - dt.timedelta(days=40))
        give_history(u, days=18 + 4 * i, seed=11 + i, demo=True)
    C.set_setting("demo", "loaded")
    return counts()


def remove(remember=True):
    for name in DEMO_TABLES:
        for r in getattr(app_tables, name).search(is_demo=True):
            r.delete()
    for u in app_tables.users.search(is_demo=True):
        u.delete()
    if remember:
        C.set_setting("demo", "removed")
    return counts()


def counts():
    out = {"users": len(app_tables.users.search(is_demo=True))}
    for name in DEMO_TABLES:
        out[name] = len(getattr(app_tables, name).search(is_demo=True))
    return out
