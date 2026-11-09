from anvil import *

from ._anvil_designer import BadgeCardTemplate
from ... import mb

class BadgeCard(BadgeCardTemplate):
    """Progress: one badge, earned (with the date) or still to win (how). item = {key, name, icon, how, earned}."""

    def __init__(self, **properties):
        super().__init__(**properties)
        b = self.item
        self.box.classes["on"] = bool(b.get("earned"))
        self.icon.classes.add("ic-" + b["icon"])
        self.how.text = ("Earned " + mb.date(b["earned"])) if b.get("earned") else b.get("how") or ""
