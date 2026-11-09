from anvil import *

from ._anvil_designer import CountBarTemplate

class CountBar(CountBarTemplate):
    """Admin → Stages: a name with a count and a bar scaled to the biggest. item = {name, n, max}."""

    def __init__(self, **properties):
        super().__init__(**properties)
        i = self.item
        self.bar.style["width"] = "%dpx" % round(i["n"] / float(max(1, i["max"])) * 160)
        self.text.text = "%s · %s" % (i["name"], i["n"])
