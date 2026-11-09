from anvil import *
from anvil.js import window

from ._anvil_designer import PasteScriptTemplate
from ... import mb
from ...Items.CueCard import WPM, words


class PasteScript(PasteScriptTemplate):
    """Paste a script and cut it into cue cards (MB.splitScript in mb.js: blank lines start a card, long paragraphs
    split into ~45-word cards). mode "new" also asks for a title; "replace" replaces the editor's cards.
    Closes with {title, cards, words} or None."""

    def __init__(self, mode="new", **properties):
        super().__init__(**properties)
        self.mode = mode
        self.title_field.visible = mode == "new"
        self.heading.text = "Paste your script" if mode == "new" else "Paste a script"
        self.intro.text = ("Blank lines start a new card. Long paragraphs are split into cards of about 45 words."
                           if mode == "new" else "It replaces the cards below. Blank lines start new cards.")
        self.ok_button.text = "Make cards" if mode == "new" else "Replace cards"
        self._count()

    def _cards(self):
        return [{"text": str(c.text), "slide": ""} for c in window.MB.splitScript(self.script_box.text or "")]

    def _count(self):
        w = words(self.script_box.text)
        self.count.text = "%d words · about %s at %d wpm · %s" % (w, mb.fmt_secs(w / float(WPM) * 60), WPM,
                                                                  "%d card%s" % (len(self._cards()), "" if len(self._cards()) == 1 else "s"))

    @handle("script_box", "change")
    def script_box_change(self, **event_args):
        self._count()

    @handle("cancel_button", "click")
    def cancel_button_click(self, **event_args):
        self.raise_event("x-close-alert", value=None)

    @handle("ok_button", "click")
    def ok_button_click(self, **event_args):
        title = (self.title_box.text or "").strip()
        cards = self._cards()
        if self.mode == "new" and not title:
            self.message.text, self.message.visible = "Give your talk a title.", True
            return
        if not cards:
            self.message.text, self.message.visible = "Paste or type your talk first.", True
            return
        self.raise_event("x-close-alert", value={"title": title, "cards": cards, "words": words(self.script_box.text)})
