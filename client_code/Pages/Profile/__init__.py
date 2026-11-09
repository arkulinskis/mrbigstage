from anvil import *

from ._anvil_designer import ProfileTemplate
from anvil.js import window

from ... import auth, mb, router, state


class Profile(ProfileTemplate):
    """#profile: your name, light/dark, a password reset link, speaker settings (goal, favourite room, notes on
    stage, live coach, filler words, recording, transcript), the recordings kept in this browser, Privacy & Terms,
    feedback, sign out."""

    def __init__(self, args=(), **properties):
        super().__init__(**properties)
        self._show_me()
        self._show_theme()
        self._speaker()
        self._tapes()

    def _speaker(self):
        d, c = state.call_quiet("get_home"), mb.content()
        if not d:
            return
        p = d["prefs"]
        self.goal_box.items = [("Choose a goal…", "")] + [(g["name"], g["key"]) for g in c["goals"]]
        self.goal_box.selected_value = d.get("goal") or ""
        for box, opts, cur in ((self.venue_box, c["venues"], p.get("venue")), (self.prompter_box, c["prompters"], p.get("prompter")),
                               (self.coach_box, c["coach"], p.get("coach"))):
            box.items = [(o["name"], o["key"]) for o in opts]
            if cur in [o["key"] for o in opts]:
                box.selected_value = cur
        self.fillers_box.text = p.get("fillers_list") or ""
        state.set_control_attr(self.fillers_box, "maxlength", "300")
        self.record_box.checked = bool(p.get("record"))
        self.transcript_box.checked = bool(p.get("transcript"))
        self.transcript_box.visible = bool(window.MB.Transcript.supported)

    @handle("settings_button", "click")
    def settings_button_click(self, **event_args):
        ok = state.call("save_prefs", {"venue": self.venue_box.selected_value, "prompter": self.prompter_box.selected_value,
                                       "coach": self.coach_box.selected_value, "fillers_list": self.fillers_box.text or "",
                                       "record": bool(self.record_box.checked), "transcript": bool(self.transcript_box.checked)})
        if ok is not None and self.goal_box.selected_value:
            ok = state.call("set_goal", self.goal_box.selected_value)
        if ok is not None:
            state.toast("Settings saved", "ok")

    def _tapes(self):
        n = window.MB.Tapes.count() or 0
        self.tapes_line.text = "%s kept in this browser. They are never uploaded. We keep the last 12." % state.plural(int(n), "recording")

    @handle("clear_tapes_button", "click")
    def clear_tapes_button_click(self, **event_args):
        if confirm("Only the recordings in this browser. Your reports stay.", title="Delete every recording?",
                   buttons=[("Cancel", False), ("Delete", True)], role="app-dialog"):
            window.MB.Tapes.clear()
            self.tapes_line.text = "No recordings kept in this browser."
            state.toast("Recordings deleted")

    def _show_me(self):
        me = state.me()
        self.initials.text = state.initials(me.get("name"))
        self.name_title.text = me.get("name") or ""
        joined = state.month_year(me.get("joined"))
        self.email_line.text = (me.get("email") or "") + (" · member since " + joined if joined else "")
        self.name_box.text = me.get("name") or ""
        self.admin_link.visible = bool(me.get("is_admin"))

    def _show_theme(self):
        t = state.theme()
        for name, el in (("auto", self.theme_auto), ("light", self.theme_light), ("dark", self.theme_dark)):
            el.classes["on"] = name == t

    def theme_click(self, event):
        state.set_theme(event.currentTarget.getAttribute("data-theme-pick"))
        self._show_theme()

    @handle("name_box", "pressed_enter")
    def name_box_pressed_enter(self, **event_args):
        self.save_button_click()

    @handle("save_button", "click")
    def save_button_click(self, **event_args):
        name = (self.name_box.text or "").strip()
        if len(name) < 2:
            state.toast("Please tell us your name.", "error")
            return
        r = state.call("update_profile", name)
        if r:
            state.set_me(r["me"])
            self._show_me()
            state.toast("Saved", "ok")

    @handle("reset_button", "click")
    def reset_button_click(self, **event_args):
        r = auth.reset(state.me()["email"])
        state.toast(r["message"], "ok")

    def feedback_click(self, event):
        state.feedback()

    def sign_out_click(self, event):
        auth.sign_out()
        state.toast("Signed out. See you soon!")
        router.go("landing")
