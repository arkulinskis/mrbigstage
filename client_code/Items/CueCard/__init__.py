from anvil import *

from ._anvil_designer import CueCardTemplate
from ... import mb, state

WPM = 140


def words(t):
    return len((t or "").split())


class CueCard(CueCardTemplate):
    """Talks → editor: one cue card (what you say + optional big words on the screen behind you), with move up /
    down / remove. item = {i, n, text, slide, page}: it edits page.cards[i] in place and calls page.cards_changed()."""

    def __init__(self, **properties):
        super().__init__(**properties)
        i = self.item
        self.no.text = str(i["i"] + 1)
        self.text_box.text = i["text"]
        self.slide_box.text = i["slide"]
        self.up_button.enabled = i["i"] > 0
        self.down_button.enabled = i["i"] < i["n"] - 1
        state.set_control_attr(self.text_box, "aria-label", "Card %d: what you'll say" % (i["i"] + 1))
        state.set_control_attr(self.slide_box, "aria-label", "Card %d: big words on the screen" % (i["i"] + 1))
        self._est()

    def _est(self):
        w = words(self.text_box.text)
        self.est.text = "%d words · ~%s" % (w, mb.fmt_secs(w / float(WPM) * 60))

    @handle("text_box", "change")
    def text_box_change(self, **event_args):
        page = self.item["page"]
        page.cards[self.item["i"]]["text"] = self.text_box.text or ""
        self._est()
        page.cards_changed(redraw=False)

    @handle("slide_box", "change")
    def slide_box_change(self, **event_args):
        page = self.item["page"]
        page.cards[self.item["i"]]["slide"] = self.slide_box.text or ""
        page.cards_changed(redraw=False)

    @handle("up_button", "click")
    def up_button_click(self, **event_args):
        self.item["page"].move_card(self.item["i"], -1)

    @handle("down_button", "click")
    def down_button_click(self, **event_args):
        self.item["page"].move_card(self.item["i"], 1)

    @handle("rm_button", "click")
    def rm_button_click(self, **event_args):
        self.item["page"].remove_card(self.item["i"])
