from anvil import *
import anvil.js

from ._anvil_designer import PartBarTemplate
from ... import mb

class PartBar(PartBarTemplate):
    """Report: one skill's score as a bar (with the previous run's score as a tick). Click it to read what it
    measures and what good sounds like. item = {label, icon, score, mark, what, ideal}."""

    def __init__(self, **properties):
        super().__init__(**properties)
        r = self.item
        na = r.get("score") is None
        self.btn.classes["na"] = na
        self.icon.classes.add("ic-" + (r.get("icon") or "sparkle"))
        self.value.text = "–" if na else str(r["score"])
        self.fill.visible = not na
        if not na:
            self.fill.style["width"] = "%s%%" % r["score"]
            self.fill.classes[mb.score_class(r["score"])] = True
        self.mark.visible = r.get("mark") is not None
        if r.get("mark") is not None:
            self.mark.style["left"] = "%s%%" % r["mark"]
        self.why.visible = False
        self.btn_node = anvil.js.get_dom_node(self.btn)
        self.btn_node.setAttribute("aria-expanded", "false")

    def toggle_click(self, event):
        self.why.visible = not self.why.visible
        self.btn_node.setAttribute("aria-expanded", "true" if self.why.visible else "false")
