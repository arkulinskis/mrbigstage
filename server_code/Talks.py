"""Your talks: a title, an occasion, a target length, a default venue and the cue cards
(each card = what you say, plus optional big words for the screen behind you). Private to their owner."""
import datetime as dt

import anvil.server
from anvil.tables import app_tables
import anvil.tables as tables

from . import common as C
from . import content, DemoData

MAX_CARDS = 80
MAX_QUESTIONS = 12


def col(r, name, default=None):
    """A column added after launch (event_date, questions): the live app keeps working until the schema is accepted."""
    try:
        v = r[name]
    except Exception:
        return default
    return default if v is None else v


def clean_questions(qs):
    if isinstance(qs, str):
        qs = qs.splitlines()
    if not isinstance(qs, list):
        return []
    out = []
    for q in qs:
        q = C.text(q, 200) if isinstance(q, str) else ""
        if len(q) >= 3 and q not in out:
            out.append(q)
        if len(out) >= MAX_QUESTIONS:
            break
    return out


def clean_date(v):
    """An ISO date from today to two years ahead, or None."""
    if not isinstance(v, str) or not v:
        return None
    try:
        d = dt.date.fromisoformat(v[:10])
    except ValueError:
        return None
    today = C.now().date()
    if d < today - dt.timedelta(days=1) or d > today + dt.timedelta(days=731):
        return None
    return d


def days_left(d):
    return (d - C.now().date()).days if isinstance(d, dt.date) else None


# Readiness for a talk's big day: runs (up to 5) 35 + best of the last three scores 40 + a "pressure" run 25
# (with audience questions, a tough crowd, or the room at least 90% full). Today's step comes from what's missing.
def readiness(r, rows=None):
    rows = rows if rows is not None else list(app_tables.sessions.search(tables.order_by("created", ascending=True), talk=r))
    n = len(rows)
    scores = [x["confidence"] for x in rows if x["confidence"] is not None]
    best3 = max(scores[-3:]) if scores else 0
    venue_max = content.venue(r["venue"] or "redcircle")["max"]
    pressure = any(((x["metrics"] or {}).get("questions") or 0) > 0 or x["mood"] == "tough" or (x["crowd"] or 0) >= venue_max * 0.9 for x in rows)
    qa = any(((x["metrics"] or {}).get("questions") or 0) > 0 for x in rows)
    pct = int(round(min(n, 5) / 5.0 * 35 + best3 / 100.0 * 40 + (25 if pressure else 0)))
    left = days_left(col(r, "event_date"))
    step = _step(n, best3, pressure, qa, left, rows)
    return {"pct": max(0, min(100, pct)), "runs": n, "best": best3 or None, "pressure": pressure, "qa": qa, "step": step}


def _weakest(rows):
    last = [x["parts"] or {} for x in rows[-3:]]
    best = None
    for p in content.PARTS:
        vals = [d.get(p["key"]) for d in last if isinstance(d.get(p["key"]), (int, float))]
        if vals:
            a = sum(vals) / len(vals)
            if best is None or a < best[0]:
                best = (a, p)
    return best[1] if best else None


def _step(n, best, pressure, qa, left, rows):
    """{text, go (a #stage ref), button}: the one thing to do today."""
    if left is not None and left <= 0:
        return {"text": "It's the day. One light run-through, then rest your voice and breathe.", "go": "talk", "button": "One light run"}
    if left == 1:
        return {"text": "Dress rehearsal: the whole talk, in its room, no stopping, as if it's tomorrow.", "go": "talk", "button": "Dress rehearsal"}
    if n == 0:
        return {"text": "First run-through. Don't aim for perfect, just get to the end.", "go": "talk", "button": "First run"}
    if n >= 2 and best < 70:
        weak = _weakest(rows)
        if weak:
            dr = content.drill(weak["drill"])
            if dr:
                return {"text": "Your %s needs the most work. A %s-minute drill, then one more run." % (weak["label"].lower(), dr["minutes"] if dr["minutes"] >= 1 else "half"),
                        "go": "drill:" + dr["key"], "button": dr["name"]}
    if not pressure:
        return {"text": "Add pressure: a full room and a tough crowd. Turn on audience questions in the setup.", "go": "talk", "button": "Pressure run"}
    if not qa:
        return {"text": "Rehearse the questions you expect: switch on Q&A in the setup.", "go": "talk", "button": "Q&A run"}
    return {"text": "You're in good shape. One run a day keeps it fresh.", "go": "talk", "button": "Practise"}


def clean_cards(cards):
    out = []
    if not isinstance(cards, list):
        return out
    for c in cards[:MAX_CARDS]:
        if isinstance(c, str):
            c = {"text": c}
        if not isinstance(c, dict):
            continue
        text = C.text(c.get("text"), 700, multiline=True)
        if not text:
            continue
        out.append({"text": text, "slide": C.text(c.get("slide"), 60)})
    return out


def talk_dict(r, stats=True):
    d = {"id": r.get_id(), "title": r["title"], "occasion": r["occasion"] or "other", "target_min": r["target_min"] or 5,
         "venue": r["venue"] or "redcircle", "cards": r["cards"] or [], "created": C.iso(r["created"]), "updated": C.iso(r["updated"]),
         "demo": bool(r["is_demo"])}
    ev = col(r, "event_date")
    d["event_date"] = ev.isoformat() if isinstance(ev, dt.date) else None
    d["days_left"] = days_left(ev)
    d["questions"] = list(col(r, "questions", []) or [])
    if stats:
        ss = [s for s in app_tables.sessions.search(talk=r)]
        d["practiced"] = len(ss)
        d["best"] = max([s["confidence"] or 0 for s in ss]) if ss else None
        last = max(ss, key=lambda s: s["created"]) if ss else None
        d["last"] = {"confidence": last["confidence"], "when": C.iso(last["created"])} if last else None
    return d


def own_talk(talk_id, me):
    r = C.row_by_id(app_tables.talks, talk_id)
    if r is None or r["user"] != me:
        return None
    return r


@anvil.server.callable(require_user=True)
def get_talks():
    DemoData.ensure_loaded()
    me = C.require_user()
    rows = app_tables.talks.search(tables.order_by("updated", ascending=False), user=me)
    return {"talks": [talk_dict(r) for r in rows]}


@anvil.server.callable(require_user=True)
def get_talk(talk_id):
    me = C.require_user()
    r = own_talk(talk_id, me)
    if r is None:
        return C.fail("That talk isn't in your list any more.")
    return C.ok(talk=talk_dict(r))


@anvil.server.callable(require_user=True)
def save_talk(talk_id, data):
    me = C.require_user()
    if not isinstance(data, dict):
        return C.fail("Nothing to save.")
    title = C.text(data.get("title"), 120)
    if len(title) < 2:
        return C.fail("Give your talk a title (at least 2 characters).")
    occasion = data.get("occasion") if data.get("occasion") in [o["key"] for o in content.OCCASIONS] else "other"
    venue = data.get("venue") if data.get("venue") in content.VENUE_KEYS else "redcircle"
    try:
        target = float(data.get("target_min") or 5)
    except (TypeError, ValueError):
        target = 5
    target = round(max(0.5, min(60, target)), 1)
    cards = clean_cards(data.get("cards"))
    fields: dict = dict(title=title, occasion=occasion, venue=venue, target_min=target, cards=cards, updated=C.now())
    if talk_id:
        r = own_talk(talk_id, me)
        if r is None:
            return C.fail("That talk isn't in your list any more.")
        r.update(**fields)
    else:
        if C.rate_limited("new_talk", 40, 3600):
            return C.fail("That's a lot of new talks in one hour. Take a breath and try again later.")
        r = app_tables.talks.add_row(user=me, created=C.now(), is_demo=False, **fields)
    extra = {}
    if "event_date" in data:
        extra["event_date"] = clean_date(data.get("event_date"))
    if "questions" in data:
        extra["questions"] = clean_questions(data.get("questions"))
    if extra:
        try:  # its own statement: new columns, guarded until the schema change is accepted
            r.update(**extra)
        except Exception as e:
            print("save_talk extra failed: %r" % (e,))
            return C.ok(talk=talk_dict(r), warning="Saved, except the date and questions: the app is being updated. Try again soon.")
    return C.ok(talk=talk_dict(r))


@anvil.server.callable(require_user=True)
def new_talk_from_template(key):
    me = C.require_user()
    t = content.template(key)
    if t is None:
        return C.fail("That template doesn't exist.")
    if C.rate_limited("new_talk", 40, 3600):
        return C.fail("That's a lot of new talks in one hour. Take a breath and try again later.")
    r = app_tables.talks.add_row(user=me, title=t["title"], occasion=t["key"], venue=t["venue"], target_min=t["minutes"],
                                 cards=[dict(c) for c in t["cards"]], created=C.now(), updated=C.now(), is_demo=False)
    return C.ok(talk=talk_dict(r))


@anvil.server.callable(require_user=True)
def duplicate_talk(talk_id):
    me = C.require_user()
    r = own_talk(talk_id, me)
    if r is None:
        return C.fail("That talk isn't in your list any more.")
    if C.rate_limited("new_talk", 40, 3600):
        return C.fail("That's a lot of new talks in one hour. Take a breath and try again later.")
    n = app_tables.talks.add_row(user=me, title=(r["title"] + " (copy)")[:120], occasion=r["occasion"], venue=r["venue"],
                                 target_min=r["target_min"], cards=list(r["cards"] or []), created=C.now(), updated=C.now(), is_demo=False)
    return C.ok(talk=talk_dict(n))


@anvil.server.callable(require_user=True)
def delete_talk(talk_id):
    me = C.require_user()
    r = own_talk(talk_id, me)
    if r is None:
        return C.ok()
    for s in app_tables.sessions.search(talk=r):
        s["talk"] = None  # the reports stay, with the title they were given
    r.delete()
    return C.ok()
