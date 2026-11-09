from anvil import *

from ._anvil_designer import HandbookSectionTemplate

class HandbookSection(HandbookSectionTemplate):
    """Drills → Handbook: one section of tips. item = a content.HANDBOOK entry {title, icon, tips: [[q, a], ...]}."""

    def __init__(self, **properties):
        super().__init__(**properties)
        self.icon.classes.add("ic-" + self.item["icon"])
        self.tips.items = [{"q": t[0], "a": t[1], "open": n == 0} for n, t in enumerate(self.item["tips"])]
