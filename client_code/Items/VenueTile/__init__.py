from anvil import *

from ._anvil_designer import VenueTileTemplate
from ... import mb

class VenueTile(VenueTileTemplate):
    """Landing: one room. item = a content.VENUES entry {key, name, max, colors: [background, circle]}."""

    def __init__(self, **properties):
        super().__init__(**properties)
        v = self.item
        self.tile.style["background"] = v["colors"][0]
        self.tile.style["--dot"] = v["colors"][1]
        self.size.text = mb.num(v["max"]) + (" people" if v["max"] > 1 else " person")
