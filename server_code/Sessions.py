"""Sessions on stage: what the stage page needs to start, saving a finished session (scored here, see
Scoring.py), reports, history, progress (XP, levels, streaks, badges), the home page and the speaker's settings.

A session row keeps only numbers: the scores, the measured metrics and a compact timeline
(loudness, pitch, pace and gaze every `step` seconds + events). Audio never reaches the server.
"""
import datetime as dt

import anvil.server
from anvil.tables import app_tables
import anvil.tables as tables

from . import common as C
from . import content, DemoData, Scoring, Talks

KINDS = {"talk", "drill", "impromptu", "sample"}
MODES = {"vr", "ar", "flat"}
EVENT_KINDS = {"pause", "filler", "card", "uptalk", "trail", "distract", "q", "beacon", "note"}
SERIES = ("vol", "pitch", "rate", "gaze")
MAX_POINTS = 3600

DEFAULT_PREFS = {
    "venue": "redcircle", "mood": "neutral", "prompter": "cards", "coach": "subtle", "fill": 1.0, "distractions": [],
    "qa": False, "record": True, "transcript": False, "clock": True, "house_lights": False, "applause": True,
    "fillers_list": "um, uh, like, you know, basically, actually, literally, kind of, sort of, I mean",
}


# ------------------------------------------------------------------------------------------------ settings
def prefs_of(user):
    p = dict(DEFAULT_PREFS)
    if user is not None and isinstance(user["prefs"], dict):
        p.update({k: v for k, v in user["prefs"].items() if k in DEFAULT_PREFS})
    return p


def clean_prefs(p):
    out = {}
    if not isinstance(p, dict):
        return out
    if p.get("venue") in content.VENUE_KEYS:
        out["venue"] = p["venue"]
    if p.get("mood") in [m["key"] for m in content.MOODS]:
        out["mood"] = p["mood"]
    if p.get("prompter") in [m["key"] for m in content.PROMPTERS]:
        out["prompter"] = p["prompter"]
    if p.get("coach") in [m["key"] for m in content.COACH_LEVELS]:
        out["coach"] = p["coach"]
    if isinstance(p.get("fill"), (int, float)) and not isinstance(p.get("fill"), bool):
        out["fill"] = round(max(0.2, min(1.0, float(p["fill"]))), 2)
    if isinstance(p.get("distractions"), list):
        keys = [d["key"] for d in content.DISTRACTIONS]
        out["distractions"] = [d for d in p["distractions"] if d in keys]
    for k in ("qa", "record", "transcript", "clock", "house_lights", "applause"):
        if k in p:
            out[k] = bool(p[k])
    if "fillers_list" in p:
        out["fillers_list"] = C.text(p.get("fillers_list"), 300)
    return out


@anvil.server.callable(require_user=True)
def save_prefs(p):
    me = C.require_user()
    cur = prefs_of(me)
    cur.update(clean_prefs(p))
    me["prefs"] = cur
    return C.ok(prefs=cur)


@anvil.server.callable(require_user=True)
def set_goal(goal):
    me = C.require_user()
    if goal not in content.GOAL_KEYS:
        return C.fail("Pick one of the goals.")
    me["goal"] = goal
    return C.ok(goal=goal)


# ------------------------------------------------------------------------------------------------ content + stage
@anvil.server.callable
def get_content():
    return content.public()


@anvil.server.callable
def get_stage(ref):
    """What the stage needs for a talk id, 'sample', 'drill:<key>' or 'free'. Guests may use the sample and drills."""
    me = C.me()
    ref = ref if isinstance(ref, str) else "sample"
    out = {"prefs": prefs_of(me), "signed_in": me is not None, "talk": None, "drill": None, "previous": None}
    if ref.startswith("drill:"):
        d = content.drill(ref[6:])
        if d is None:
            return C.fail("That drill doesn't exist.")
        out["drill"] = d
        out["previous"] = _previous(me, drill=d["key"])
    elif ref == "sample":
        out["talk"] = content.SAMPLE_TALK
    elif ref == "free":
        out["talk"] = {"id": "free", "title": "Free talk", "occasion": "other", "target_min": 0, "venue": out["prefs"]["venue"], "cards": []}
    else:
        if me is None:
            raise anvil.server.PermissionDenied("Please sign in first.")
        r = Talks.own_talk(ref, me)
        if r is None:
            return C.fail("That talk isn't in your list any more.")
        out["talk"] = Talks.talk_dict(r, stats=False)
        out["previous"] = _previous(me, talk=r)
    return C.ok(**out)


def _previous(me, talk=None, drill=None):
    if me is None:
        return None
    q = {"user": me}
    if talk is not None:
        q["talk"] = talk
    if drill is not None:
        q["drill"] = drill
    rows = list(app_tables.sessions.search(tables.order_by("created", ascending=False), **q))
    if not rows:
        return None
    best = max(rows, key=lambda r: r["confidence"] or 0)
    return {"last": rows[0]["confidence"], "best": best["confidence"], "count": len(rows), "parts": rows[0]["parts"] or {}}


def clean_timeline(tl):
    out = {"step": 1.0}
    if not isinstance(tl, dict):
        return out
    st = tl.get("step")
    if isinstance(st, (int, float)) and not isinstance(st, bool):
        out["step"] = max(0.25, min(10.0, float(st)))
    for k in SERIES:
        v = tl.get(k)
        if isinstance(v, list):
            out[k] = [round(max(-50, min(1000, float(x))), 1) if isinstance(x, (int, float)) and not isinstance(x, bool) else 0
                      for x in v[:MAX_POINTS]]
    ev = []
    for e in (tl.get("events") or [])[:4000] if isinstance(tl.get("events"), list) else []:
        if (isinstance(e, list) and len(e) >= 2 and isinstance(e[0], (int, float)) and not isinstance(e[0], bool)
                and e[1] in EVENT_KINDS):
            val = e[2] if len(e) > 2 else None
            if isinstance(val, str):
                val = val[:80]
            elif not (isinstance(val, (int, float)) and not isinstance(val, bool)):
                val = None
            ev.append([round(max(0.0, min(7200.0, float(e[0]))), 2), e[1], val])
    out["events"] = ev
    return out


def _payload(p):
    """The parts of a finished session sent by the stage page, cleaned."""
    p = p if isinstance(p, dict) else {}
    kind = p.get("kind") if p.get("kind") in KINDS else "talk"
    venue = p.get("venue") if p.get("venue") in content.VENUE_KEYS else "redcircle"
    v = content.venue(venue)
    crowd = p.get("crowd") if isinstance(p.get("crowd"), (int, float)) and not isinstance(p.get("crowd"), bool) else v["crowd"]
    nerves = {}
    for k in ("nerves_before", "nerves_after"):
        n = p.get(k)
        nerves[k] = int(n) if isinstance(n, (int, float)) and not isinstance(n, bool) and 1 <= n <= 5 else None
    return {"kind": kind, "venue": venue, "crowd": int(max(1, min(v["max"], crowd))),
            "mood": p.get("mood") if p.get("mood") in [m["key"] for m in content.MOODS] else "neutral",
            "mode": p.get("mode") if p.get("mode") in MODES else "flat",
            "drill": p.get("drill") if p.get("drill") in content.DRILL_KEYS else None,
            "title": C.text(p.get("title"), 120) or "Untitled talk", "reflection": C.text(p.get("reflection"), 1000, multiline=True),
            **nerves}


@anvil.server.callable
def score_preview(payload):
    """Scores a session without saving it (guests trying the stage)."""
    if C.rate_limited("score_preview", 40, 3600):
        return C.fail("Lots of tries this hour. Sign up to keep going, or try again later.")
    payload = payload if isinstance(payload, dict) else {}
    s = Scoring.score(payload.get("metrics"))
    return C.ok(score=_score_public(s), timeline=clean_timeline(payload.get("timeline")))


def _score_public(s):
    return {k: s[k] for k in ("confidence", "parts", "band", "tips", "strengths", "facts", "enough")}


@anvil.server.callable(require_user=True)
def save_session(payload):
    me = C.require_user()
    if not isinstance(payload, dict):
        return C.fail("Nothing to save.")
    if C.rate_limited("save_session", 60, 3600):
        return C.fail("That's a lot of sessions in one hour. Rest your voice and try again later.")
    p = _payload(payload)
    s = Scoring.score(payload.get("metrics"))
    m = s["metrics"]
    if (m.get("secs") or 0) < 3:
        return C.fail("That was too short to save. Speak for at least a few seconds.")
    talk = None
    if p["kind"] == "talk" and isinstance(payload.get("talk_id"), str):
        talk = Talks.own_talk(payload["talk_id"], me)
    before = progress_core(me)
    r = app_tables.sessions.add_row(
        user=me, talk=talk, title=p["title"], kind=p["kind"], drill=p["drill"], venue=p["venue"], crowd=p["crowd"],
        mood=p["mood"], mode=p["mode"], seconds=m.get("secs") or 0, confidence=s["confidence"], parts=s["parts"],
        metrics=m, timeline=clean_timeline(payload.get("timeline")), nerves_before=p["nerves_before"],
        nerves_after=p["nerves_after"], reflection=p["reflection"], created=C.now(), is_demo=False)
    after = progress_core(me)
    new_badges = [b for b in content.BADGES if b["key"] in after["earned"] and b["key"] not in before["earned"]]
    return C.ok(id=r.get_id(), score=_score_public(s), xp_gained=after["xp"] - before["xp"], level=after["level"],
                level_up=after["level"]["n"] > before["level"]["n"], new_badges=new_badges, streak=after["streak"])


def _own_session(sid, me):
    r = C.row_by_id(app_tables.sessions, sid)
    if r is None or (r["user"] != me and not C.is_admin(me)):
        return None
    return r


def session_summary(r):
    return {"id": r.get_id(), "title": r["title"], "kind": r["kind"], "drill": r["drill"], "venue": r["venue"], "crowd": r["crowd"],
            "mode": r["mode"], "seconds": r["seconds"], "confidence": r["confidence"], "created": C.iso(r["created"]),
            "talk_id": r["talk"].get_id() if r["talk"] else None, "nerves_before": r["nerves_before"], "nerves_after": r["nerves_after"]}


@anvil.server.callable(require_user=True)
def get_report(sid):
    me = C.require_user()
    r = _own_session(sid, me)
    if r is None:
        return C.fail("That report isn't available.")
    m = r["metrics"] or {}
    p = r["parts"] or {}
    f = Scoring.facts(m)
    d = session_summary(r)
    d.update(parts=p, metrics=m, timeline=r["timeline"] or {}, reflection=r["reflection"] or "",
             band=content.band(r["confidence"]) if r["confidence"] is not None else None,
             tips=Scoring.tips(p, m, f), strengths=Scoring.strengths(p), facts=f, mood=r["mood"])
    q = {"user": r["user"]}
    if r["talk"]:
        q["talk"] = r["talk"]
    elif r["drill"]:
        q["drill"] = r["drill"]
    else:
        q["kind"] = r["kind"]
    same = list(app_tables.sessions.search(tables.order_by("created", ascending=True), **q))
    earlier = list(reversed(same[:same.index(r)])) if r in same else []
    d["before"] = {"confidence": earlier[0]["confidence"], "parts": earlier[0]["parts"] or {}, "when": C.iso(earlier[0]["created"]),
                   "count": len(earlier)} if earlier else None
    return C.ok(report=d)


@anvil.server.callable(require_user=True)
def set_reflection(sid, text, nerves_after=None):
    me = C.require_user()
    r = _own_session(sid, me)
    if r is None or r["user"] != me:
        return C.fail("That report isn't available.")
    r["reflection"] = C.text(text, 1000, multiline=True)
    if isinstance(nerves_after, (int, float)) and not isinstance(nerves_after, bool) and 1 <= nerves_after <= 5:
        r["nerves_after"] = int(nerves_after)
    return C.ok()


@anvil.server.callable(require_user=True)
def delete_session(sid):
    me = C.require_user()
    r = _own_session(sid, me)
    if r is None:
        return C.ok()
    if r["user"] != me:
        return C.fail("You can only delete your own sessions.")
    r.delete()
    return C.ok()


@anvil.server.callable(require_user=True)
def list_sessions(limit=60):
    me = C.require_user()
    limit = int(limit) if isinstance(limit, (int, float)) and not isinstance(limit, bool) else 60
    rows = list(app_tables.sessions.search(tables.order_by("created", ascending=False), user=me))
    return {"sessions": [session_summary(r) for r in rows[:max(1, min(500, limit))]], "total": len(rows)}


# ------------------------------------------------------------------------------------------------ progress
def session_xp(r):
    secs = min(r["seconds"] or 0, 1800)
    return 10 + int(round(secs / 60.0 * 8)) + int(round((r["confidence"] or 0) / 5.0))


def _day(d):
    return d.astimezone(dt.timezone.utc).date() if isinstance(d, dt.datetime) else d


def streak_of(days, today=None):
    today = today or C.now().date()
    days = set(days)
    if not days:
        return 0
    d = today if today in days else today - dt.timedelta(days=1)
    n = 0
    while d in days:
        n += 1
        d -= dt.timedelta(days=1)
    return n


def best_streak(days):
    best = run = 0
    prev = None
    for d in sorted(set(days)):
        run = run + 1 if prev is not None and (d - prev).days == 1 else 1
        best = max(best, run)
        prev = d
    return best


def progress_core(me, rows=None):
    rows = rows if rows is not None else list(app_tables.sessions.search(tables.order_by("created", ascending=True), user=me))
    xp = sum(session_xp(r) for r in rows)
    days = [_day(r["created"]) for r in rows]
    earned = {}

    def earn(key, r):
        if key not in earned:
            earned[key] = C.iso(r["created"])
    drills, venues = set(), set()
    for i, r in enumerate(rows):
        m, p = r["metrics"] or {}, r["parts"] or {}
        earn("first", r)
        if i + 1 >= 10:
            earn("regular", r)
        if (m.get("speak_secs") or 0) >= 60 and (m.get("fillers") or 0) + (m.get("word_fillers") or 0) == 0:
            earn("smooth", r)
        if (p.get("pauses") or 0) >= 90:
            earn("pause", r)
        if (r["crowd"] or 0) >= 1000:
            earn("fullhouse", r)
        if r["venue"] == "arena":
            earn("arena", r)
        if (p.get("eyes") or 0) >= 85:
            earn("lighthouse", r)
        if (r["seconds"] or 0) >= 900 and r["kind"] == "talk":
            earn("marathon", r)
        if r["nerves_before"] and r["nerves_after"] and r["nerves_before"] - r["nerves_after"] >= 2:
            earn("brave", r)
        if (r["confidence"] or 0) >= 78:
            earn("compelling", r)
        if (r["confidence"] or 0) >= 90:
            earn("spellbinding", r)
        if r["drill"]:
            drills.add(r["drill"])
            if len(drills) >= 6:
                earn("gym", r)
        if (m.get("questions") or 0) >= 1:
            earn("hotseat", r)
        if (m.get("distractions") or 0) >= 3 and (m.get("recovered") or 0) >= 3:
            earn("unshakeable", r)
        venues.add(r["venue"])
        if len(venues) >= len(content.VENUES):
            earn("worldtour", r)
        if best_streak(days[:i + 1]) >= 7:
            earn("streak7", r)
    return {"xp": xp, "level": content.level(xp), "streak": streak_of(days), "best_streak": best_streak(days), "earned": earned,
            "drills": sorted(drills), "venues": sorted(venues), "rows": rows}


def _avg(vals):
    vals = [v for v in vals if v is not None]
    return int(round(sum(vals) / len(vals))) if vals else None


@anvil.server.callable(require_user=True)
def get_progress():
    me = C.require_user()
    core = progress_core(me)
    rows = core.pop("rows")
    today = C.now().date()
    counts = {}
    for r in rows:
        k = _day(r["created"]).isoformat()
        counts[k] = counts.get(k, 0) + 1
    cal = [{"day": (today - dt.timedelta(days=i)).isoformat(), "n": counts.get((today - dt.timedelta(days=i)).isoformat(), 0)}
           for i in range(83, -1, -1)]
    first, last = rows[:5], rows[-5:]
    parts = []
    for p in content.PARTS:
        k = p["key"]
        parts.append({"key": k, "label": p["label"], "first": _avg([(r["parts"] or {}).get(k) for r in first]),
                      "now": _avg([(r["parts"] or {}).get(k) for r in last])})
    nerves = [{"when": C.iso(r["created"]), "before": r["nerves_before"], "after": r["nerves_after"]}
              for r in rows if r["nerves_before"] or r["nerves_after"]][-30:]
    core.update(
        calendar=cal, parts=parts, nerves=nerves,
        trend=[{"when": C.iso(r["created"]), "c": r["confidence"], "title": r["title"], "id": r.get_id()} for r in rows if r["confidence"] is not None][-60:],
        totals={"sessions": len(rows), "minutes": int(round(sum(r["seconds"] or 0 for r in rows) / 60.0)),
                "audience": sum(r["crowd"] or 0 for r in rows), "venues": len(core["venues"]), "drills": len(core["drills"]),
                "best": max([r["confidence"] or 0 for r in rows]) if rows else None},
        nerves_avg={"before": _avg([n["before"] for n in nerves]), "after": _avg([n["after"] for n in nerves])},
        badges=[dict(b, earned=core["earned"].get(b["key"])) for b in content.BADGES])
    return core


@anvil.server.callable(require_user=True)
def get_home():
    DemoData.ensure_loaded()
    me = C.require_user()
    core = progress_core(me)
    rows = core.pop("rows")
    talks = list(app_tables.talks.search(tables.order_by("updated", ascending=False), user=me))
    recent = [session_summary(r) for r in reversed(rows[-5:])]
    weak = None
    last5 = rows[-5:]
    if last5:
        avgs = [(_avg([(r["parts"] or {}).get(p["key"]) for r in last5]), p) for p in content.PARTS]
        avgs = [(a, p) for a, p in avgs if a is not None]
        if avgs:
            a, p = min(avgs, key=lambda x: x[0])
            weak = {"part": p["key"], "label": p["label"], "avg": a, "drill": p["drill"]}
    tips = [t for sec in content.HANDBOOK for t in sec["tips"]]
    tip = tips[C.now().date().toordinal() % len(tips)]
    return {"goal": me["goal"], "prefs": prefs_of(me), "level": core["level"], "xp": core["xp"], "streak": core["streak"],
            "badges": len(core["earned"]), "badges_total": len(content.BADGES),
            "talks": [Talks.talk_dict(r) for r in talks[:3]], "talk_count": len(talks), "recent": recent,
            "trend": [r["confidence"] for r in rows if r["confidence"] is not None][-12:], "sessions": len(rows),
            "minutes": int(round(sum(r["seconds"] or 0 for r in rows) / 60.0)), "audience": sum(r["crowd"] or 0 for r in rows),
            "weak": weak, "tip": {"title": tip[0], "text": tip[1]},
            "nerves": [[r["nerves_before"], r["nerves_after"]] for r in rows[-8:] if r["nerves_before"] and r["nerves_after"]]}


@anvil.server.callable
def stage_stats():
    """Totals for the landing page (everyone together, no names)."""
    DemoData.ensure_loaded()
    rows = list(app_tables.sessions.search())
    return {"sessions": len(rows), "minutes": int(round(sum(r["seconds"] or 0 for r in rows) / 60.0)),
            "audience": sum(r["crowd"] or 0 for r in rows)}
