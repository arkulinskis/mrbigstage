from anvil import *

from ._anvil_designer import TemplateCardTemplate

class TemplateCard(TemplateCardTemplate):
    """Talks → New talk: one starting point. item = {key, icon, name, blurb, chips} (key "paste" / "blank" or a
    content.TEMPLATES key); a click raises x-template on the panel."""

    def __init__(self, **properties):
        super().__init__(**properties)
        self.icon.classes.add("ic-" + self.item["icon"])
        self.chips.items = self.item.get("chips") or []
        self.chips.visible = bool(self.item.get("chips"))

    def pick_click(self, event):
        self.parent.raise_event("x-template", key=self.item["key"])
