import anvil.server
from anvil import *

from ._anvil_designer import PickStageTemplate
from ... import mb, router, state


def open_picker():
    """"Go on stage": pick what you'll say (your talks, a surprise topic, a free talk, a new talk or the sample),
    then the stage opens on it."""
    go = alert(PickStage(), buttons=[], role="app-dialog", dismissible=True)
    if go:
        router.go(*go.split("/"))


class PickStage(PickStageTemplate):
    def __init__(self, **properties):
        super().__init__(**properties)
        me = state.me()
        talks = anvil.server.call("get_talks")["talks"] if me else []
        self.talks_part.visible = bool(talks)
        self.talks_panel.items = [{
            "go": "stage/" + t["id"], "icon": "mic", "title": t["title"],
            "sub": "%s min · %s%s" % (t["target_min"], mb.venue_name(t["venue"]),
                                      " · practised " + state.plural(t["practiced"], "time") if t.get("practiced") else "")}
            for t in talks]
        more = [{"go": "stage/drill:topics", "icon": "dice", "title": "Surprise topic", "sub": "Two minutes on a random question"},
                {"go": "stage/free", "icon": "sparkle", "title": "Free talk", "sub": "No cards, no topic, just the room"}]
        if me:
            more.append({"go": "talks/new", "icon": "plus", "title": "Write a new talk", "sub": "Start from a template or your own script"})
        else:
            more.append({"go": "stage/sample", "icon": "play", "title": "Try the sample talk", "sub": "Six short cards, two minutes"})
        self.more_panel.items = more
        for panel in (self.talks_panel, self.more_panel):
            panel.add_event_handler("x-pick", self._pick)

    def _pick(self, go, **event_args):
        self.raise_event("x-close-alert", value=go)

    @handle("close_button", "click")
    def close_button_click(self, **event_args):
        self.raise_event("x-close-alert", value=None)
