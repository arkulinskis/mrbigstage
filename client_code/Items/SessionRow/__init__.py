from anvil import *

from ._anvil_designer import SessionRowTemplate
from ... import mb, router, state

class SessionRow(SessionRowTemplate):
    """A session in Backstage's "Recent sessions" and Progress's history: score, title, room, length, when.
    item = Sessions.session_summary {id, title, venue, seconds, created, mode, confidence}."""

    def __init__(self, **properties):
        super().__init__(**properties)
        s = self.item
        state.set_attr(self.row, "href", router.href("report", s["id"]))
        c = s.get("confidence")
        self.score.text = "✓" if c is None else str(c)
        self.score.role = ["bs-sc", "sc-" + (mb.score_class(c) or "none")]
        self.meta.text = " · ".join([mb.venue_name(s.get("venue")), mb.fmt_mins(s.get("seconds")), state.ago(s.get("created"))]) + \
            (" · VR" if s.get("mode") == "vr" else "")
