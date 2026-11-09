from anvil import *
import anvil.js

from ._anvil_designer import GoalButtonTemplate

class GoalButton(GoalButtonTemplate):
    """Backstage: one goal ("What brings you to the stage?"). item = {key, name, blurb, on}; a click raises x-goal."""

    def __init__(self, **properties):
        super().__init__(**properties)
        self.btn.classes["on"] = bool(self.item.get("on"))
        self.btn_node = anvil.js.get_dom_node(self.btn)
        self.btn_node.setAttribute("data-key", self.item["key"])

    def goal_click(self, event):
        self.parent.raise_event("x-goal", key=self.item["key"])
