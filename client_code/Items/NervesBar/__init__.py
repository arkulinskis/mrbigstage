from anvil import *

from ._anvil_designer import NervesBarTemplate
from ... import state

class NervesBar(NervesBarTemplate):
    """Backstage: one session's nerves, before (grey) and after (green). item = {before, after, title}."""

    def __init__(self, **properties):
        super().__init__(**properties)
        self.before.style["height"] = "%d%%" % (self.item["before"] * 20)
        self.after.style["height"] = "%d%%" % (self.item["after"] * 20)
        state.set_attr(self.box, "title", self.item.get("title") or "")
