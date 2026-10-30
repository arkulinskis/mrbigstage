"""Admin page callables: overview, users (make admin, disable), demo data. Admins only.
Feedback admin calls live in Feedback.py."""
import anvil.server
from anvil.tables import app_tables
import anvil.tables as tables

from . import common as C
from . import content, DemoData, Feedback


@anvil.server.callable(require_user=True)
def admin_overview():
    C.require_admin()
    return {"users": len([u for u in app_tables.users.search() if not u["is_demo"]]),
            "admins": len(app_tables.users.search(is_admin=True)),
            "feedback_new": Feedback.new_count(),
            "talks": len([t for t in app_tables.talks.search() if not t["is_demo"]]),
            "sessions": len([r for r in app_tables.sessions.search() if not r["is_demo"]]),
            "demo": {"state": DemoData.state(), "counts": DemoData.counts()}}


def _user(u):
    return {"id": u.get_id(), "email": u["email"], "name": C.name_of(u), "is_admin": C.is_admin(u),
            "enabled": u["enabled"] is not False, "joined": C.iso(u["signed_up"]), "last_seen": C.iso(u["last_seen"])}


@anvil.server.callable(require_user=True)
def list_users(query=None):
    C.require_admin()
    query = C.text(query, 80).lower()
    rows = [u for u in app_tables.users.search(tables.order_by("signed_up", ascending=False)) if not u["is_demo"]]
    if query:
        rows = [u for u in rows if query in (u["email"] or "").lower() or query in (u["display_name"] or "").lower()]
    return {"users": [_user(u) for u in rows[:200]], "total": len(rows)}


@anvil.server.callable(require_user=True)
def set_admin(user_id, flag):
    me = C.require_admin()
    u = C.row_by_id(app_tables.users, user_id)
    if u is None:
        return C.fail("That account no longer exists.")
    if u == me and not flag:
        return C.fail("You can't remove your own admin rights.")
    u["is_admin"] = bool(flag)
    return C.ok(user=_user(u))


@anvil.server.callable(require_user=True)
def set_enabled(user_id, flag):
    me = C.require_admin()
    u = C.row_by_id(app_tables.users, user_id)
    if u is None:
        return C.fail("That account no longer exists.")
    if u == me:
        return C.fail("You can't disable your own account.")
    u["enabled"] = bool(flag)
    return C.ok(user=_user(u))


@anvil.server.callable(require_user=True)
def demo_load():
    C.require_admin()
    DemoData.load()
    return C.ok(demo={"state": DemoData.state(), "counts": DemoData.counts()})


@anvil.server.callable(require_user=True)
def demo_remove():
    C.require_admin()
    DemoData.remove()
    return C.ok(demo={"state": DemoData.state(), "counts": DemoData.counts()})


@anvil.server.callable(require_user=True)
def admin_stage_stats(include_demo=True):
    """Stage tab: how the stages are used (totals, venues, drills, average scores, recent sessions)."""
    C.require_admin()
    rows = [r for r in app_tables.sessions.search(tables.order_by("created", ascending=False)) if include_demo or not r["is_demo"]]
    venues, drills, modes = {}, {}, {}
    parts = {p["key"]: [] for p in content.PARTS}
    for r in rows:
        venues[r["venue"]] = venues.get(r["venue"], 0) + 1
        modes[r["mode"] or "flat"] = modes.get(r["mode"] or "flat", 0) + 1
        if r["drill"]:
            drills[r["drill"]] = drills.get(r["drill"], 0) + 1
        for k, v in (r["parts"] or {}).items():
            if k in parts and v is not None:
                parts[k].append(v)
    conf = [r["confidence"] for r in rows if r["confidence"] is not None]
    return {"sessions": len(rows), "minutes": int(round(sum(r["seconds"] or 0 for r in rows) / 60.0)),
            "speakers": len(set(r["user"].get_id() for r in rows if r["user"])),
            "avg": int(round(sum(conf) / len(conf))) if conf else None,
            "venues": [{"key": v["key"], "name": v["name"], "n": venues.get(v["key"], 0)} for v in content.VENUES],
            "drills": [{"key": d["key"], "name": d["name"], "n": drills.get(d["key"], 0)} for d in content.DRILLS],
            "modes": modes,
            "parts": [{"key": p["key"], "label": p["label"], "avg": int(round(sum(parts[p["key"]]) / len(parts[p["key"]]))) if parts[p["key"]] else None}
                      for p in content.PARTS],
            "recent": [{"who": C.name_of(r["user"]), "title": r["title"], "venue": content.venue(r["venue"])["name"], "mode": r["mode"],
                        "confidence": r["confidence"], "seconds": r["seconds"], "created": C.iso(r["created"]), "demo": bool(r["is_demo"])}
                       for r in rows[:30]]}
