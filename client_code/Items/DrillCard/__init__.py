from anvil import *

from ._anvil_designer import DrillCardTemplate
from ... import mb, router, state

class DrillCard(DrillCardTemplate):
    """Drills: one drill (icon, name, length, room, what it trains, Start, "done before").
    item = a content.DRILLS entry + {pick: bool (the "for you" drill), done: bool}."""

    def __init__(self, **properties):
        super().__init__(**properties)
        d = self.item
        c = mb.content()
        self.card.classes["pick"] = bool(d.get("pick"))
        self.flag.visible = bool(d.get("pick"))
        self.icon.classes.add("ic-" + d["icon"])
        self.meta.text = "%s · %s" % (mb.minutes_label(d["minutes"]), mb.venue_name(d.get("venue")))
        if d.get("focus"):
            self.chips.items = [{"text": c["part_by"][k]["label"], "icon": c["part_by"][k]["icon"], "kind": "brand"} for k in d["focus"]]
        else:
            self.chips.items = [{"text": "Calm", "kind": "good"}]
        state.set_attr(self.start, "href", router.href("stage", "drill:" + d["key"]))
        self.done.visible = bool(d.get("done"))
