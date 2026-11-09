from anvil import *

from ._anvil_designer import RecentRowTemplate
from ... import mb, state

class RecentRow(RecentRowTemplate):
    """Admin → Stages: one of the latest sessions. item = {who, demo, created, title, venue, mode, confidence}."""

    def __init__(self, **properties):
        super().__init__(**properties)
        r = self.item
        self.demo.visible = bool(r.get("demo"))
        self.when.text = state.ago(r.get("created"))
        self.room.text = "%s · %s" % (r.get("venue") or "", r.get("mode") or "flat")
        c = r.get("confidence")
        self.score.text = "–" if c is None else str(c)
        self.score.role = ["mb-score-l", "sc-" + (mb.score_class(c) or "none")]
