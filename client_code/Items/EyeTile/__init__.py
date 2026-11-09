from anvil import *

from ._anvil_designer import EyeTileTemplate

class EyeTile(EyeTileTemplate):
    """Report → Where you looked: left / centre / right share, the redder the more. item = {label, share}."""

    def __init__(self, **properties):
        super().__init__(**properties)
        v = self.item["share"] or 0
        self.box.style["background"] = "rgba(230,43,30,%.2f)" % (0.15 + v * 0.85)
        self.text.text = "%s\n%d%%" % (self.item["label"], round(v * 100))
