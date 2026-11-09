from anvil import *
from anvil.js import window

from ._anvil_designer import ProgressTemplate
from ... import mb, state


class Progress(ProgressTemplate):
    """#progress: level and XP, totals, the confidence trend, the 12-week calendar, skills then and now, nerves
    before/after, badges and the full history (get_progress + list_sessions). The charts are drawn by mb-charts.js."""

    def __init__(self, args=(), **properties):
        super().__init__(**properties)
        state.heading(self.title, 1)
        d = state.call("get_progress")
        hist = state.call("list_sessions", 200)
        if not d or not hist:
            return
        c = mb.content()
        lv, t = d["level"], d["totals"]
        pct = round((lv["xp"] - lv["from"]) / float(lv["to"] - lv["from"]) * 100) if lv.get("to") else 100
        self.lv_n.text = str(lv["n"])
        self.lv_name.text = lv["name"]
        self.lv_xp.text = mb.num(lv["xp"]) + " XP" + ((" · %s to %s" % (mb.num(lv["to"] - lv["xp"]), lv["next"])) if lv.get("next") else "")
        self.xp_bar.style["width"] = "%d%%" % pct
        self.stats_panel.items = [
            {"value": t["sessions"], "label": "sessions"},
            {"value": mb.num(t["minutes"]) + " min", "label": "on stage"},
            {"value": mb.num(t["audience"]), "label": "people faced"},
            {"value": "–" if t["best"] is None else t["best"], "label": "best score"},
            {"value": ("🔥 " if d["streak"] else "") + str(d["streak"]), "label": "day streak (best %s)" % d["best_streak"]},
            {"value": "%s / 7" % t["venues"], "label": "rooms played"}]
        self.trend.content = window.MB.trendChart(mb.js(d["trend"]))
        self.calendar.content = window.MB.calendar(mb.js(d["calendar"]))
        rows = [{"label": p["label"], "icon": c["part_by"][p["key"]]["icon"], "score": p["now"], "mark": p["first"]} for p in d["parts"]]
        self.skills.content = window.MB.bars(mb.js(rows))
        self.nerves.content = window.MB.nervesChart(mb.js(d["nerves"]))
        self.badges_title.text = "Badges · %d of %d" % (len(d["earned"]), len(d["badges"]))
        self.badges_panel.items = d["badges"]
        self.history_title.text = "History · %s" % hist["total"]
        self.history_panel.items = hist["sessions"]
        self.no_history.visible = not hist["sessions"]

    @handle("stage_button", "click")
    def stage_button_click(self, **event_args):
        from ...Dialogs.PickStage import open_picker
        open_picker()
