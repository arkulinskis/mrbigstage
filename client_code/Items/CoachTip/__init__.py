from anvil import *

from ._anvil_designer import CoachTipTemplate
from ... import mb, router, state

class CoachTip(CoachTipTemplate):
    """Report: one coaching tip (score, skill, advice, a drill for it). item = Scoring tip {score, label, text, drill}."""

    def __init__(self, **properties):
        super().__init__(**properties)
        t = self.item
        self.score.text = str(t["score"])
        dr = mb.content()["drill_by"].get(t.get("drill"))
        self.drill.visible = bool(dr)
        if dr:
            state.set_attr(self.drill, "href", router.href("stage", "drill:" + dr["key"]))
            self.drill_name.text = "Drill: " + dr["name"]
            self.drill_icon.classes.add("ic-" + dr["icon"])
