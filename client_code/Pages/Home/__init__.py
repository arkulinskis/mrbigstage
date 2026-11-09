from anvil import *
from anvil.js import window

from ._anvil_designer import HomeTemplate
from ... import mb, router, state


def greet():
    h = window.Date().getHours()
    return "Late night" if h < 5 else "Good morning" if h < 12 else "Good afternoon" if h < 18 else "Good evening"


class Home(HomeTemplate):
    """#home (Backstage): practise next, level / XP / streak, the goal picker, your talks, recent sessions, the
    confidence trend, your weakest skill with its drill, nerves before/after and the tip of the day (get_home)."""

    def __init__(self, args=(), **properties):
        super().__init__(**properties)
        self.goals_panel.add_event_handler("x-goal", self._goal)
        self.d = state.call("get_home")
        self.c = mb.content()
        if self.d:
            self._draw()

    def _draw(self):
        d, c, me = self.d, self.c, state.me() or {}
        first, lv = d["sessions"] == 0, d["level"]
        talk = d["talks"][0] if d["talks"] else None
        self.greeting.text = "%s, %s" % (greet(), mb.first_name(me.get("name")))
        if first:
            head, lead = "Your stage <em>is ready.</em>", ("Pick a talk, choose a room from a boardroom to a 5,000-seat arena, and speak. "
                                                         "We listen to your pace, pauses, fillers, pitch, volume and where you look, then coach you.")
        else:
            head = ("Day %d. <em>Keep it going.</em>" % d["streak"]) if d["streak"] > 1 else "Back on <em>the red circle?</em>"
            if talk:
                lead = "Next up: %s%s" % (talk["title"], (", best so far %s." % talk["best"]) if talk.get("best") is not None else ".")
            else:
                lead = "Write a talk, or warm up with a drill."
        self.dom_nodes["headline"].innerHTML = head
        self.lead.text = lead
        if talk:
            title = talk["title"] if len(talk["title"]) <= 22 else talk["title"][:21] + "…"
            self.practise_text.text = "Practise “%s”" % title
            state.set_attr(self.practise_link, "href", router.href("stage", talk["id"]))
        # level card
        pct = round((lv["xp"] - lv["from"]) / float(lv["to"] - lv["from"]) * 100) if lv.get("to") else 100
        self.lv_n.text = str(lv["n"])
        self.lv_name.text = lv["name"]
        self.lv_xp.text = mb.num(lv["xp"]) + " XP" + ((" · %s to %s" % (mb.num(lv["to"] - lv["xp"]), lv["next"])) if lv.get("next") else " · top level")
        self.xp_bar.style["width"] = "%d%%" % pct
        self.m_streak.text = ("🔥 %d" % d["streak"]) if d["streak"] else "0"
        self.m_sessions.text = str(d["sessions"])
        self.m_audience.text = mb.num(d["audience"])
        self.badges_line.text = "%s of %s badges" % (d["badges"], d["badges_total"])
        # left column
        self.goals_part.visible = first or not d.get("goal")
        self._draw_goals()
        self.first_part.visible = first
        self.all_talks.visible = True
        state.set_attr(self.all_talks, "aria-label", "All talks (%d)" % d["talk_count"])
        self.talks_panel.items = d["talks"]
        self.no_talks.visible = not d["talks"]
        self.recent_panel.items = d["recent"]
        self.no_recent.visible = not d["recent"]
        self.history_link.visible = bool(d["recent"])
        # right column
        trend = [x for x in d["trend"] if x is not None]
        self.trend_part.visible = len(trend) >= 2
        if len(trend) >= 2:
            last, firstc = trend[-1], trend[0]
            self.trend_last.text = str(last)
            self.trend_last.role = ["mb-score-xl", "sc-" + mb.score_class(last)]
            self.trend_note.text = "%s%d since %s ago" % ("+" if last >= firstc else "", last - firstc, state.plural(len(trend), "session"))
            self.spark.content = window.MB.spark(mb.js(trend), 170, 56)
        weak = d.get("weak")
        self.weak_part.visible = bool(weak)
        if weak:
            self.weak_avg.text = str(weak["avg"])
            self.weak_label.text = weak["label"]
            dr = c["drill_by"].get(weak.get("drill"))
            self.weak_blurb.visible = self.weak_drill.visible = bool(dr)
            if dr:
                self.weak_blurb.text = dr["blurb"]
                state.set_attr(self.weak_drill, "href", router.href("stage", "drill:" + dr["key"]))
                self.weak_icon.classes.add("ic-" + dr["icon"])
                self.weak_drill_text.text = "%s · %s" % (dr["name"], mb.minutes_label(dr["minutes"], short=True))
        nerves = d.get("nerves") or []
        self.nerves_part.visible = len(nerves) >= 2
        self.nerves_panel.items = [{"before": n[0], "after": n[1], "title": "%s → %s" % (c["nerves"][n[0]], c["nerves"][n[1]])} for n in nerves]
        self.tip_title.text = d["tip"]["title"]
        self.tip_text.text = d["tip"]["text"]

    def _draw_goals(self):
        goal = self.d.get("goal")
        self.goals_panel.items = [dict(g, on=g["key"] == goal) for g in self.c["goals"]]

    def _goal(self, key, **event_args):
        if state.call("set_goal", key) is not None:
            self.d["goal"] = key
            self._draw_goals()
            state.refocus(self.goals_panel, key)
            state.toast("Goal saved. We'll tailor your tips.", "ok")

    @handle("else_button", "click")
    def else_button_click(self, **event_args):
        from ...Dialogs.PickStage import open_picker
        open_picker()
