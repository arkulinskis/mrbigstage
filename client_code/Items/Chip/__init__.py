from anvil import *

from ._anvil_designer import ChipTemplate

class Chip(ChipTemplate):
    """A small badge. item = its text, or {text, icon, kind} (kind: brand / good / warn)."""

    def __init__(self, **properties):
        super().__init__(**properties)
        i = self.item if isinstance(self.item, dict) else {"text": str(self.item)}
        self.text.text = i.get("text") or ""
        self.chip.classes.update({k: True for k in [i.get("kind") or ""] if k})
        self.icon.visible = bool(i.get("icon"))
        if i.get("icon"):
            self.icon.classes.add("ic-" + i["icon"])
