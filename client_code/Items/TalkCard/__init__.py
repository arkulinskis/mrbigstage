from anvil import *

from ._anvil_designer import TalkCardTemplate
from ... import mb, router, state

class TalkCard(TalkCardTemplate):
    """Talks: one talk card (best score ring, occasion, length, cards, room, first card, Practise / Edit / Duplicate /
    Delete). item = Talks.talk_dict; Duplicate and Delete raise x-changed on the panel after the server call."""

    def __init__(self, **properties):
        super().__init__(**properties)
        t = self.item
        c = mb.content()
        occ = c["template_by"].get(t.get("occasion"))
        self.ring.visible = t.get("best") is not None
        self.ring.score = t.get("best")
        self.badges.items = [occ["name"] if occ else "Talk", "%s min" % t["target_min"], state.plural(len(t.get("cards") or []), "card"),
                             mb.venue_name(t.get("venue"))]
        cards = t.get("cards") or []
        self.first.text = cards[0]["text"] if cards else "No cards yet."
        last = t.get("last")
        self.practised.text = ("Practised " + state.plural(t["practiced"], "time") + (", last " + state.ago(last["when"]) if last else "")) \
            if t.get("practiced") else "Not practised yet"
        state.set_attr(self.practise, "href", router.href("stage", t["id"]))
        state.set_attr(self.edit, "href", router.href("talks", t["id"]))

    @handle("dup_button", "click")
    def dup_button_click(self, **event_args):
        if state.call("duplicate_talk", self.item["id"]):
            state.toast("Copied", "ok")
            self.parent.raise_event("x-changed")

    @handle("del_button", "click")
    def del_button_click(self, **event_args):
        if confirm("Its reports stay in your history.", title="Delete this talk?",
                   buttons=[("Cancel", False), ("Delete", True)], role="app-dialog"):
            if state.call("delete_talk", self.item["id"]):
                state.toast("Deleted")
                self.parent.raise_event("x-changed")
