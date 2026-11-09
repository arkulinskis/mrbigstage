from anvil import *

from ._anvil_designer import PickOptionTemplate


class PickOption(PickOptionTemplate):
    """One choice in the "Go on stage" picker. item = {go, icon, title, sub}; a click raises x-pick on the panel."""

    def __init__(self, **properties):
        super().__init__(**properties)
        self.icon.classes.add("ic-" + self.item["icon"])

    def pick_click(self, event):
        self.parent.raise_event("x-pick", go=self.item["go"])
