from anvil import *

from ._anvil_designer import StatTemplate
from ... import state

class Stat(StatTemplate):
    """A big number with a caption. item = {value, label, href (optional)}."""

    def __init__(self, **properties):
        super().__init__(**properties)
        self.value.text = str(self.item["value"])
        if self.item.get("href"):
            state.set_attr(self.box, "href", self.item["href"])
        else:
            state.set_attr(self.box, "href", None)
