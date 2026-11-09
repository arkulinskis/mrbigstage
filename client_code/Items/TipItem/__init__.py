from anvil import *

from ._anvil_designer import TipItemTemplate

class TipItem(TipItemTemplate):
    """A question you can open (handbook tips). item = {q, a, open}."""

    def __init__(self, **properties):
        super().__init__(**properties)
        self.dom_nodes["sum"].textContent = self.item["q"]
        self.dom_nodes["ans"].textContent = self.item["a"]
        if self.item.get("open"):
            self.dom_nodes["det"].setAttribute("open", "")
