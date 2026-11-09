"""MrBigStage helpers on top of state.py: the app's content (cached), number/time formats, and the bridge the JavaScript
engines (theme/assets/mb.js, mb-venue.js, mb-stage.js, mb-charts.js) use to reach the server.

    mb.content()              get_content once per visit, plus part_by / venue_by / drill_by / template_by lookups
    mb.fmt_secs(s)            '2:05'        mb.fmt_mins(s)  '45 s' / '2.5 min'
    mb.score_class(v)         'good' | 'mid' | 'low' | ''    mb.num(n) '5,000'
    mb.venue_name(key)        the room's name
    mb.minutes_label(m)       a drill's length: '30 seconds' / '2 min'
    mb.date(iso) / mb.date_time(iso)   in the browser's language
    mb.js(value)              a Python dict/list as a real JS object (for the engines)
    mb.install_bridge()       window.MB_PY = {call, toast, after, show} (startup.py)
"""
import json

import anvil.server
from anvil.js import window

from . import state

_c: dict = {"content": None}


def content():
    c = _c["content"]
    if c is None:
        c = anvil.server.call("get_content")
        c["part_by"] = {p["key"]: p for p in c["parts"]}
        c["venue_by"] = {v["key"]: v for v in c["venues"]}
        c["drill_by"] = {d["key"]: d for d in c["drills"]}
        c["template_by"] = {t["key"]: t for t in c["templates"]}
        _c["content"] = c
    return c


def fmt_secs(s):
    s = max(0, int(round(s or 0)))
    return "%d:%02d" % (s // 60, s % 60)


def fmt_mins(s):
    s = s or 0
    if s < 60:
        return "%d s" % round(s)
    if s < 600:
        return ("%.1f" % (s / 60.0)).replace(".0", "") + " min"
    return "%d min" % round(s / 60.0)


def score_class(v):
    if v is None:
        return ""
    return "good" if v >= 75 else "mid" if v >= 50 else "low"


def num(n):
    return "{:,}".format(int(n or 0))


def venue_name(key):
    v = content()["venue_by"].get(key)
    return v["name"] if v else (key or "")


def minutes_label(m, short=False):
    if m < 1:
        return "%d %s" % (round(m * 60), "s" if short else "seconds")
    return ("%g" % m) + " min"


def date(iso, month_year=False):
    if not iso:
        return ""
    if month_year:
        return str(window.MB.fmtDate(iso, js({"month": "long", "year": "numeric"})))
    return str(window.MB.fmtDate(iso))


def date_time(iso):
    return str(window.MB.fmtDateTime(iso)) if iso else ""


def js(value):
    return window.JSON.parse(json.dumps(value))


def first_name(name):
    parts = (name or "").split()
    return parts[0] if parts else ""


# ---------------------------------------------------------------- the engines' way to the server
def _call(fn, args_json, quiet=False):
    """window.MB_PY.call: the engines' UI.api. Always JSON text: {"result": ...} or {"error": ...}."""
    args = json.loads(args_json) if args_json else []
    try:
        call = anvil.server.call_s if quiet else anvil.server.call
        return json.dumps({"result": call(fn, *args)})
    except anvil.server.AppOfflineError:
        return json.dumps({"error": "You seem to be offline. Check your connection and try again."})
    except Exception as e:
        kind = type(e).__name__
        if kind == "SessionExpiredError":
            return json.dumps({"error": "Your session expired. Reload the page and sign in again."})
        if kind == "PermissionDenied":
            return json.dumps({"error": str(e) or "You don't have access to that.", "denied": True})
        print("MB_PY.call %s failed: %r" % (fn, e))
        return json.dumps({"error": "Something went wrong. Please try again."})


def _toast(msg, kind=""):
    state.toast(msg, kind or None)


def _after(target):
    from . import router
    router.remember_after(target)


def _show():
    from . import router
    router.show()


def install_bridge():
    window.MB_PY = {"call": _call, "toast": _toast, "after": _after, "show": _show}
