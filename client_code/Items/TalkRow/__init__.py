from anvil import *

from ._anvil_designer import TalkRowTemplate
from ... import mb, router, state

class TalkRow(TalkRowTemplate):
    """Backstage: one of your talks with its numbers and a Practise button. item = Talks.talk_dict."""

    def __init__(self, **properties):
        super().__init__(**properties)
        t = self.item
        bits = ["%s min" % t["target_min"], state.plural(len(t.get("cards") or []), "card"), mb.venue_name(t.get("venue")),
                "practised " + state.plural(t["practiced"], "time") if t.get("practiced") else "not practised yet"]
        self.meta.text = " · ".join(bits)
        self.best.visible = t.get("best") is not None
        if t.get("best") is not None:
            self.best.text = "best %s" % t["best"]
            self.best.role = ["mb-score-l", "sc-" + mb.score_class(t["best"])]
        state.set_attr(self.go, "href", router.href("stage", t["id"]))
