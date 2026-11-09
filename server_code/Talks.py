"""Your talks: a title, an occasion, a target length, a default venue and the cue cards
(each card = what you say, plus optional big words for the screen behind you). Private to their owner."""
import anvil.server
from anvil.tables import app_tables
import anvil.tables as tables

from . import common as C
from . import content, DemoData

MAX_CARDS = 80


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
