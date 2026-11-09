from anvil import *
from anvil.js import window

from ._anvil_designer import LandingTemplate
from ... import mb, state

# The app's video on the Addanapp YouTube channel (APP_MAKER/youtube/manifest.json), shown in the Watch section.
YT_VIDEO = "UuQabze-btg"


class Landing(LandingTemplate):
    """#landing: the dark stage hero (theatre drawing from mb-charts.js MB.heroArt), live counters (stage_stats),
    the Watch section, the ten skills with their weights, the seven rooms, steps, features, questions. Static copy
    lives in the template; skills and rooms come from get_content (server content.py)."""

    def __init__(self, args=(), **properties):
        super().__init__(**properties)
        me = state.me()
        self.guest_cta.visible = not me
        self.member_cta.visible = bool(me)
        self.dom_nodes["yt_cover"].addEventListener("click", self._play)
        c = mb.content()
        self.art.content = window.MB.heroArt()
        self.parts_panel.items = c["parts"]
        self.mix.content = window.MB.mixBar(mb.js(c["parts"]))
        self.venues_panel.items = c["venues"]
        s = state.call_quiet("stage_stats")
        if s:
            self.c_sessions.text = mb.num(s["sessions"])
            self.c_minutes.text = mb.num(s["minutes"])
            self.c_audience.text = mb.num(s["audience"])

    def _play(self, event):
        """Swap the video's cover for YouTube's player (privacy-enhanced); nothing loads from YouTube before this click."""
        self.dom_nodes["yt_frame"].innerHTML = (
            '<iframe src="https://www.youtube-nocookie.com/embed/' + YT_VIDEO + '?autoplay=1&rel=0&playsinline=1" '
            'title="MrBigStage video" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen '
            'referrerpolicy="strict-origin-when-cross-origin"></iframe>')

    @handle("stage_button", "click")
    def stage_button_click(self, **event_args):
        from ...Dialogs.PickStage import open_picker
        open_picker()
