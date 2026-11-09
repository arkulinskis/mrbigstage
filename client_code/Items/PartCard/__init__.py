from anvil import *

from ._anvil_designer import PartCardTemplate

class PartCard(PartCardTemplate):
    """Landing: one of the ten skills. item = a content.PARTS entry {key, label, icon, what, weight}."""

    def __init__(self, **properties):
        super().__init__(**properties)
        self.icon.classes.add("ic-" + self.item["icon"])
        self.weight.text = "%s%% of the score" % self.item["weight"]
