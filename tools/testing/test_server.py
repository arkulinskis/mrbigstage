"""Server tests against the strict mock of Anvil (tools/testing/mock).

    python tools/testing/test_server.py          -> prints ALL OK, or the first failure

call(name, ...) runs a server function the way the browser does: by name, with require_user enforced,
and the reply must be JSON (a datetime or a row in a reply fails here, like it would break the page).
Add tests for every new server function: the happy path, bad input, and someone who isn't allowed.
"""
import datetime as dt
import importlib
import json
import os
import pathlib
import shutil
import sys
import tempfile

HERE = pathlib.Path(__file__).resolve().parent
PROJECT = HERE.parents[1]
_tmp = pathlib.Path(tempfile.mkdtemp())
shutil.copytree(PROJECT / "server_code", _tmp / "app")
(_tmp / "app" / "__init__.py").write_text("")
os.environ["ANVIL_APP_YAML"] = str(PROJECT / "anvil.yaml")  # the mock's tables follow the app's own schema
sys.path[:0] = [str(HERE / "mock"), str(_tmp)]
import anvil.server  # noqa: E402
import anvil.users  # noqa: E402
from anvil.tables import app_tables as T  # noqa: E402

M = {p.stem: importlib.import_module("app." + p.stem) for p in sorted((PROJECT / "server_code").glob("*.py"))}
now = dt.datetime.now(dt.timezone.utc)


def call(name, *args):
    r = anvil.server.call(name, *args)
    json.dumps(r)  # strict: must be JSON-able
    return r


def as_user(row):
    anvil.users.CURRENT[0] = row
    anvil.server.session.use(row.get_id() if row is not None else None)


def denied(name, *args):
    try:
        call(name, *args)
    except anvil.server.PermissionDenied:
        return True
    return False


def ok(r, msg=""):
    assert isinstance(r, dict) and r.get("ok"), (msg, r)
    return r


def bad(r, msg=""):
    assert isinstance(r, dict) and r.get("ok") is False and r.get("error"), (msg, r)
    return r


def person(email, name=None, **kw):
    return T.users.add_row(email=email, enabled=True, signed_up=now, display_name=name, **kw)


# ---------------------------------------------------------------------------------- accounts
admin = person("arkulinskis@gmail.com", "The Admin")
ana = person("ana@example.com", "Ana")
bob = person("bob@example.com")

as_user(None)
assert call("get_me") is None
assert denied("update_profile", "X")
as_user(admin)
assert call("get_me")["is_admin"] is True, "ADMIN_EMAILS become admins on first sign-in"
as_user(ana)
me = call("get_me")
assert me["name"] == "Ana" and me["is_admin"] is False
assert ana["last_seen"] is not None
as_user(bob)
assert call("get_me")["name"] == "Bob", "a name comes from the email when none is set"
bad(call("update_profile", " x "))
assert ok(call("update_profile", "  Bob   Stone "))["me"]["name"] == "Bob Stone"

# ---------------------------------------------------------------------------------- feedback
as_user(None)
bad(call("submit_feedback", "bug", "hi"))
ok(call("submit_feedback", "bug", "The button is broken", "guest@example.com", {"page": "#home", "evil": "x" * 9999}))
fb = T.feedback.search()[0]
assert fb["name"] == "Guest" and fb["email"] == "guest@example.com" and "evil" not in fb["context"] and fb["status"] == "new"
for i in range(4):
    ok(call("submit_feedback", "idea", "Idea number %d" % i))
bad(call("submit_feedback", "idea", "One too many this hour"), "rate limit")
as_user(ana)
ok(call("submit_feedback", "nonsense-kind", "Signed-in feedback"))
assert T.feedback.get(message="Signed-in feedback")["kind"] == "other"
assert denied("list_feedback")
as_user(admin)
lst = call("list_feedback")
assert lst["counts"]["new"] == 6 and len(lst["items"]) == 6
fid = lst["items"][0]["id"]
ok(call("set_feedback_status", fid, "done", "Fixed it"))
assert call("list_feedback", "done")["items"][0]["note"] == "Fixed it"
bad(call("set_feedback_status", fid, "weird"))
bad(call("set_feedback_status", "nope", "done"))
ok(call("delete_feedback", fid))
assert len(call("list_feedback")["items"]) == 5

# ---------------------------------------------------------------------------------- admin
as_user(ana)
for fn, args in [("admin_overview", ()), ("list_users", ()), ("set_admin", (bob.get_id(), True)), ("demo_load", ()), ("demo_remove", ())]:
    assert denied(fn, *args), fn
as_user(admin)
ov = call("admin_overview")
assert ov["users"] == 3 and ov["admins"] == 1 and ov["feedback_new"] == 5 and ov["sessions"] == 0
assert len(call("list_users")["users"]) == 3 and len(call("list_users", "bob")["users"]) == 1
ok(call("set_admin", bob.get_id(), True))
assert bob["is_admin"] is True
bad(call("set_admin", admin.get_id(), False), "can't remove your own admin")
ok(call("set_enabled", bob.get_id(), False))
assert bob["enabled"] is False
bad(call("set_enabled", admin.get_id(), False))
ok(call("set_enabled", bob.get_id(), True))
ok(call("set_admin", bob.get_id(), False))
assert bob["is_admin"] is False

# ---------------------------------------------------------------------------------- demo data
as_user(None)
st = call("stage_stats")
assert M["DemoData"].state() == "loaded" and st["sessions"] == 16 * len(M["DemoData"].DEMO_USERS), "demo loads on first visit"
assert st["audience"] > 1000 and st["minutes"] > 10
assert T.users.search(is_demo=True) and T.talks.search(is_demo=True)
demo_rows = list(T.sessions.search(is_demo=True))
assert all(r["confidence"] is None if r["drill"] == "breathe" else 0 <= r["confidence"] <= 100 for r in demo_rows)
scored = [r["confidence"] for r in demo_rows[:16] if r["confidence"] is not None]
first_conf, last_conf = scored[:5], scored[-5:]
assert sum(last_conf) > sum(first_conf), "demo speakers get better over time"
as_user(admin)
ok(call("demo_remove"))
assert M["DemoData"].state() == "removed" and call("stage_stats")["sessions"] == 0
assert not T.users.search(is_demo=True) and not T.talks.search(is_demo=True)
as_user(None)
call("stage_stats")
assert M["DemoData"].state() == "removed", "removed demo data doesn't come back by itself"
as_user(admin)
ok(call("demo_load"))
ok(call("demo_load"))
assert call("stage_stats")["sessions"] == 16 * len(M["DemoData"].DEMO_USERS), "reloading replaces the demo instead of doubling it"

# ---------------------------------------------------------------------------------- content + scoring
as_user(None)
c = call("get_content")
assert len(c["venues"]) == 7 and len(c["drills"]) >= 10 and len(c["templates"]) >= 8 and len(c["topics"]) >= 30
assert sum(p["weight"] for p in c["parts"]) == 100
assert all(p["drill"] in [d["key"] for d in c["drills"]] for p in c["parts"]), "every part points at a real drill"
assert all(t["venue"] in [v["key"] for v in c["venues"]] for t in c["templates"])
assert all(d["venue"] in [v["key"] for v in c["venues"]] for d in c["drills"])
Sc = M["Scoring"]
good = {"secs": 120, "span_secs": 118, "speak_secs": 85, "syllables": 118 / 60 * 145 * 1.45, "pace_cv": 0.2, "rush": 1.0,
        "pauses": 14, "pause_long": 0, "pause_mean": 1.0, "fillers": 0, "vol_snr": 28, "vol_var": 5, "quiet_share": 0,
        "pitch_med": 140, "pitch_std": 3.5, "monotone_share": 0.05, "jitter": 0.3, "shimmer": 1.5, "clarity": 0.75,
        "phrases": 18, "uptalk": 1, "trail": 1, "tracked_gaze": True, "gaze_aud": 0.85, "gaze_l": 0.33, "gaze_c": 0.34, "gaze_r": 0.33,
        "holds_pm": 6, "target_secs": 120, "tracked_hands": True, "gest_share": 0.3, "sway": 0.08}
g = Sc.score(good)
assert g["confidence"] >= 92 and all(v is not None for v in g["parts"].values()), g
weak = dict(good, syllables=118 / 60 * 215 * 1.45, fillers=14, pauses=2, pitch_std=0.9, monotone_share=0.6, uptalk=9,
            gaze_aud=0.3, gaze_l=0.05, gaze_c=0.9, gaze_r=0.05, vol_snr=7, quiet_share=0.5, secs=200, rush=1.5)
w = Sc.score(weak)
assert w["confidence"] < 45, w["confidence"]
assert w["parts"]["fillers"] < 30 and w["parts"]["pace"] < 40 and w["parts"]["eyes"] < 60
assert len(w["tips"]) == 3 and all(t["text"] and t["drill"] for t in w["tips"])
assert w["facts"]["wpm"] > 200
voice_only = Sc.score(dict(good, tracked_gaze=False, tracked_hands=False, target_secs=0))
assert voice_only["parts"]["eyes"] is None and voice_only["parts"]["presence"] is None and voice_only["parts"]["timing"] is None
assert voice_only["confidence"] > 85, "missing parts are left out, not counted as zero"
short = Sc.score({"secs": 4, "speak_secs": 2})
assert short["enough"] is False and short["parts"]["pace"] is None and short["confidence"] is None and short["band"] is None
junk = Sc.clean({"secs": "lots", "fillers": -5, "vol_snr": float("nan"), "evil": 1, "pitch_std": 999, "tracked_gaze": 1,
                 "filler_words": {"um": 3, "x" * 99: 2, "bad": "x"}})
assert "secs" not in junk and junk["fillers"] == 0 and "vol_snr" not in junk and "evil" not in junk and junk["pitch_std"] == 24
assert junk["tracked_gaze"] is True and junk["filler_words"] == {"um": 3, "x" * 24: 2}
pv = ok(call("score_preview", {"metrics": good, "timeline": {"step": 1, "vol": [1, 2, "x"], "events": [[1, "filler"], [2, "hack"]]}}))
assert pv["score"]["confidence"] == g["confidence"] and pv["timeline"]["vol"] == [1, 2, 0] and len(pv["timeline"]["events"]) == 1

# ---------------------------------------------------------------------------------- talks
as_user(None)
assert denied("get_talks") and denied("save_talk", None, {"title": "x"}) and denied("new_talk_from_template", "toast")
assert denied("get_stage", "some-talk-id"), "guests can't open someone's talk"
assert ok(call("get_stage", "sample"))["talk"]["cards"]
assert ok(call("get_stage", "drill:zapper"))["drill"]["key"] == "zapper"
bad(call("get_stage", "drill:nope"))
as_user(ana)
assert call("get_talks")["talks"] == []
bad(call("save_talk", None, {"title": " "}))
bad(call("save_talk", None, "nope"))
t1 = ok(call("save_talk", None, {"title": "My Best Man Speech", "occasion": "toast", "venue": "wedding", "target_min": 999,
                                    "cards": [{"text": "Hello", "slide": "Hi"}, "Second card", {"text": "  "}, 5]}))["talk"]
assert t1["target_min"] == 60 and len(t1["cards"]) == 2 and t1["cards"][1] == {"text": "Second card", "slide": ""} and t1["venue"] == "wedding"
t1b = ok(call("save_talk", t1["id"], {"title": "Best Man Speech", "occasion": "weird", "venue": "mars", "target_min": "x", "cards": []}))["talk"]
assert t1b["id"] == t1["id"] and t1b["occasion"] == "other" and t1b["venue"] == "redcircle" and t1b["target_min"] == 5
t2 = ok(call("new_talk_from_template", "interview"))["talk"]
assert t2["venue"] == "interview" and len(t2["cards"]) >= 3
bad(call("new_talk_from_template", "nope"))
t3 = ok(call("duplicate_talk", t2["id"]))["talk"]
assert t3["title"].endswith("(copy)")
assert len(call("get_talks")["talks"]) == 3
stage = ok(call("get_stage", t2["id"]))
assert stage["talk"]["title"] == t2["title"] and stage["previous"] is None and stage["prefs"]["venue"] == "redcircle"
as_user(bob)
bad(call("get_talk", t2["id"]), "someone else's talk")
bad(call("save_talk", t2["id"], {"title": "Hijack"}))
bad(call("get_stage", t2["id"]))
bad(call("duplicate_talk", t2["id"]))
ok(call("delete_talk", t2["id"]))
as_user(ana)
assert ok(call("get_talk", t2["id"]))["talk"]["title"] == t2["title"], "bob's delete didn't touch ana's talk"

# ---------------------------------------------------------------------------------- sessions, reports, progress
as_user(None)
assert denied("save_session", {}) and denied("get_report", "x") and denied("get_progress") and denied("get_home") and denied("list_sessions")
as_user(ana)
home = call("get_home")
assert home["sessions"] == 0 and home["level"]["name"] == "Open Mic" and home["talk_count"] == 3 and home["weak"] is None
bad(call("save_session", "nope"))
bad(call("save_session", {"metrics": {"secs": 1}}), "too short")
pay = {"kind": "talk", "talk_id": t2["id"], "title": t2["title"], "venue": "interview", "crowd": 99, "mode": "vr", "mood": "tough",
       "nerves_before": 5, "nerves_after": 2, "metrics": good, "timeline": {"step": 0.5, "vol": [10] * 5, "pitch": [120] * 5, "gaze": [2] * 5,
       "events": [[1.5, "card", 1], [2, "filler", None], [3, "q", "Why us?"]]}}
s1 = ok(call("save_session", pay))
assert s1["score"]["confidence"] == g["confidence"] and s1["xp_gained"] > 10 and s1["streak"] == 1
names = [b["key"] for b in s1["new_badges"]]
assert "first" in names and "brave" in names and "compelling" in names and "spellbinding" in names, names
row = T.sessions.get_by_id(s1["id"])
assert row["crowd"] == 4, "crowd is capped by the venue"
assert row["talk"]["title"] == t2["title"] and row["mood"] == "tough" and row["timeline"]["step"] == 0.5
s2 = ok(call("save_session", dict(pay, metrics=weak, nerves_before=3, nerves_after=3, kind="drill", drill="zapper", venue="arena", crowd=5000)))
assert s2["new_badges"] and "arena" in [b["key"] for b in s2["new_badges"]] and "fullhouse" in [b["key"] for b in s2["new_badges"]]
rep = ok(call("get_report", s1["id"]))["report"]
assert rep["confidence"] == g["confidence"] and rep["timeline"]["events"][0][1] == "card" and rep["before"] is None and rep["band"]["name"] == "Spellbinding"
s3 = ok(call("save_session", dict(pay, metrics=weak)))
rep3 = ok(call("get_report", s3["id"]))["report"]
assert rep3["before"]["confidence"] == g["confidence"], "a report compares with the previous run of the same talk"
assert len(rep3["tips"]) == 3
ok(call("set_reflection", s3["id"], "Too fast. Breathe.", 2))
assert T.sessions.get_by_id(s3["id"])["reflection"] == "Too fast. Breathe." and T.sessions.get_by_id(s3["id"])["nerves_after"] == 2
assert call("list_sessions")["total"] == 3
prog = call("get_progress")
assert prog["totals"]["sessions"] == 3 and prog["streak"] == 1 and len(prog["calendar"]) == 84 and prog["calendar"][-1]["n"] == 3
assert len(prog["badges"]) == len(c["badges"]) and any(b["earned"] for b in prog["badges"])
assert prog["nerves_avg"]["before"] is not None and len(prog["trend"]) == 3
home = call("get_home")
assert home["sessions"] == 3 and home["weak"] is not None and home["tip"]["title"] and len(home["recent"]) == 3
assert ok(call("get_stage", t2["id"]))["previous"]["count"] == 2
as_user(bob)
bad(call("get_report", s1["id"]), "someone else's report")
bad(call("set_reflection", s1["id"], "hi"))
assert call("list_sessions")["total"] == 0
ok(call("delete_session", s1["id"]))
assert T.sessions.get_by_id(s1["id"]) is not None, "bob can't delete ana's session"
as_user(admin)
assert ok(call("get_report", s1["id"])), "admins can open any report"
bad(call("delete_session", s1["id"]), "admins don't delete people's sessions from here")
as_user(ana)
ok(call("delete_talk", t2["id"]))
assert T.sessions.get_by_id(s1["id"])["talk"] is None and T.sessions.get_by_id(s1["id"])["title"] == t2["title"], "reports outlive their talk"
calm = ok(call("save_session", {"kind": "drill", "drill": "breathe", "title": "Box Breathing", "metrics": {"secs": 120}, "nerves_before": 4, "nerves_after": 2}))
assert calm["score"]["confidence"] is None and ok(call("get_report", calm["id"]))["report"]["band"] is None, "breathing has no voice score"
assert all(x["c"] is not None for x in call("get_progress")["trend"])
ok(call("delete_session", calm["id"]))
ok(call("delete_session", s2["id"]))
assert call("list_sessions")["total"] == 2
# streaks
D = dt.date
Ss = M["Sessions"]
assert Ss.streak_of([D(2026, 1, 1), D(2026, 1, 2), D(2026, 1, 3)], today=D(2026, 1, 3)) == 3
assert Ss.streak_of([D(2026, 1, 1), D(2026, 1, 2)], today=D(2026, 1, 3)) == 2, "yesterday still counts"
assert Ss.streak_of([D(2026, 1, 1)], today=D(2026, 1, 3)) == 0
assert Ss.best_streak([D(2026, 1, 1), D(2026, 1, 2), D(2026, 1, 5)]) == 2

# ---------------------------------------------------------------------------------- settings
as_user(None)
assert denied("save_prefs", {}) and denied("set_goal", "fear")
as_user(ana)
pr = ok(call("save_prefs", {"venue": "arena", "prompter": "scroll", "coach": "nope", "fill": 7, "distractions": ["cough", "x"], "qa": 1, "evil": 1}))["prefs"]
assert pr["venue"] == "arena" and pr["prompter"] == "scroll" and pr["coach"] == "subtle" and pr["fill"] == 1.0 and pr["distractions"] == ["cough"] and pr["qa"] is True
assert "evil" not in ana["prefs"]
assert ok(call("get_stage", "sample"))["prefs"]["venue"] == "arena"
bad(call("set_goal", "world domination"))
ok(call("set_goal", "interview"))
assert call("get_home")["goal"] == "interview"

# ---------------------------------------------------------------------------------- admin stage stats
as_user(ana)
assert denied("admin_stage_stats")
as_user(admin)
ss = call("admin_stage_stats")
assert ss["sessions"] >= 2 and len(ss["venues"]) == 7 and ss["recent"] and "email" not in ss["recent"][0]
assert call("admin_stage_stats", False)["sessions"] == 2
ov = call("admin_overview")
assert ov["sessions"] == 2 and ov["talks"] == 2

# ---------------------------------------------------------------------------------- Privacy & Terms
if "legal_server" in M:
    as_user(ana)
    st = call("legal_state")
    assert st["signedIn"] and st["accepted_version"] is None
    ok(call("legal_accept", st["version"], "signup"))
    assert ana["legal_source"] == "signup" and call("legal_state")["accepted_version"] == st["version"]

# ---------------------------------------------------------------------------------- every callable is covered by a permission check
# A callable that changes data without require_user / a C.require_* check is a security hole. List the public ones here.
PUBLIC = {"session_ping", "get_me", "submit_feedback", "legal_state", "legal_accept", "get_content", "get_stage", "score_preview", "stage_stats"}
for name, (f, need) in sorted(anvil.server.CALLABLES.items()):
    if name in PUBLIC:
        continue
    assert need, "%s is callable by anyone: add require_user=True (or list it in PUBLIC in test_server.py)" % name

print("ALL OK (%d server functions)" % len(anvil.server.CALLABLES))
