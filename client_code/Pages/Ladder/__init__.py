from anvil import *

from ._anvil_designer import LadderTemplate
from ... import state


class Ladder(LadderTemplate):
    """#ladder: the stage-fright ladder (graded exposure). Eight rungs from one kind face to a tough 5,000-seat arena;
    each opens the stage with its room preset (#stage/rung:<n>). A rung is climbed after a run there that ends
    "a little nervous" or calmer, or after two runs; then the next unlocks (Sessions.ladder_state). Open to everyone:
    guests can climb rung 1, members keep their climb."""

    def __init__(self, args=(), **properties):
        super().__init__(**properties)
        state.heading(self.title, 1)
        d = state.call_quiet("get_ladder")
        if not d:
            self.error_part.visible = True
            self.main_part.visible = False
            return
        self.error_part.visible = False
        rungs = d["rungs"]
        nxt = None
        for r in rungs:
            if r["open"] and not r["climbed"]:
                nxt = r
                break
        self.rungs_panel.items = [dict(r, next=nxt is not None and r["n"] == nxt["n"]) for r in rungs]
        self.count.text = "%d of %d" % (d["climbed"], d["total"])
        self.bar.style["width"] = "%d%%" % round(d["climbed"] * 100.0 / max(1, d["total"]))
        if d["climbed"] >= d["total"]:
            self.status.text = "You climbed the whole ladder. The real room will feel small. Keep it fresh with a run now and then."
        elif not d["signed_in"]:
            self.status.text = "Try rung 1 now. Create a free account to keep your climb and unlock the next rungs."
        elif nxt:
            self.status.text = "Next: rung %d, %s." % (nxt["n"], nxt["name"])
        self.guest_part.visible = not d["signed_in"]
