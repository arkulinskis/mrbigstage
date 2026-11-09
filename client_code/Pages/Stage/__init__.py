from anvil import *
import anvil.js
from anvil.js import window

from ._anvil_designer import StageTemplate
from ... import mb, state


class Stage(StageTemplate):
    """#stage/<talk id | sample | free | drill:key>: the 3D stage, full screen (no header or footer).
    The whole stage is the JavaScript engine theme/assets/mb-stage.js (three.js rooms in mb-venue.js, the voice
    analyser in mb.js): this page mounts it on show and tears it down (mic, VR session, audio, renderer) on hide.
    Its server calls go through mb.install_bridge(); router.needs_account sends guests to sign in for talk ids."""

    def __init__(self, args=(), **properties):
        super().__init__(**properties)
        self.ref = args[0] if args else "sample"
        self._mounted = None

    @handle("", "show")
    def form_show(self, **event_args):
        if self._mounted is not None:
            return
        me = state.me()
        ctx = mb.js({"args": [self.ref], "me": me})
        self._mounted = window.MB.mountStage(self.dom_nodes["view"], ctx)

    @handle("", "hide")
    def form_hide(self, **event_args):
        m = self._mounted
        self._mounted = None
        if m is not None and m.destroy:
            m.destroy()
