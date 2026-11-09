from anvil import *
import anvil.js
from anvil.js import window

from ._anvil_designer import TalksTemplate
from ... import mb, router, state
from ...Items.CueCard import WPM, words

BLANK = {"title": "Untitled talk", "occasion": "other", "target_min": 5, "venue": "redcircle", "cards": [{"text": "Start here."}]}
CRAFT = ["Write how you speak, not how you write.", "One idea per card. Put a big word on the screen for each.",
         "Mark a pause with \" / \" and stage directions in (brackets)."]


class Talks(TalksTemplate):
    """#talks (your talks), #talks/new (templates, paste a script, blank) and #talks/<id> (the cue-card editor with
    the length estimate). Cards are edited in self.cards; Items/CueCard writes into it and calls cards_changed."""

    def __init__(self, args=(), **properties):
        super().__init__(**properties)
        self.arg = args[0] if args else ""
        self.cards = []
        self.talk: dict = {}
        self.dirty = False
        self._unload = anvil.js.report_exceptions(self._before_unload)
        self.talks_panel.add_event_handler("x-changed", self._list)
        self.templates_panel.add_event_handler("x-template", self._template)
        self.list_part.visible = not self.arg
        self.new_part.visible = self.arg == "new"
        self.edit_part.visible = bool(self.arg) and self.arg != "new"
        if not self.arg:
            self._list()
        elif self.arg == "new":
            self._gallery()
        else:
            self._editor()

    # ---------------------------------------------------------------- list
    def _list(self, **event_args):
        r = state.call("get_talks")
        talks = r["talks"] if r else []
        self.talks_panel.items = talks
        self.no_talks.visible = not talks

    # ---------------------------------------------------------------- new: templates
    def _gallery(self):
        c = mb.content()
        items = [{"key": "paste", "icon": "copy", "name": "Paste my script", "blurb": "Already written it? Paste it and we'll cut it into cue cards."},
                 {"key": "blank", "icon": "edit", "name": "Blank talk", "blurb": "Start with an empty card and build it your way."}]
        for t in c["templates"]:
            items.append({"key": t["key"], "icon": t["icon"], "name": t["name"], "blurb": t["blurb"],
                          "chips": ["%s min" % t["minutes"], state.plural(len(t["cards"]), "card"), mb.venue_name(t["venue"])]})
        self.templates_panel.items = items

    def _template(self, key, **event_args):
        if key == "paste":
            from ...Dialogs.PasteScript import PasteScript
            got = alert(PasteScript(mode="new"), buttons=[], role="app-dialog", large=True)
            if not got:
                return
            r = state.call("save_talk", None, {"title": got["title"], "occasion": "other", "venue": "redcircle",
                                               "target_min": max(1, round(got["words"] / float(WPM))), "cards": got["cards"]})
        elif key == "blank":
            r = state.call("save_talk", None, BLANK)
        else:
            r = state.call("new_talk_from_template", key)
        if r:
            router.go("talks", r["talk"]["id"])

    # ---------------------------------------------------------------- editor
    def _editor(self):
        r = state.call("get_talk", self.arg)
        if not r:
            router.go("talks")
            return
        t, c = r["talk"], mb.content()
        self.talk = t
        self.title_box.text = t["title"]
        self.occasion_box.items = [(o["name"], o["key"]) for o in c["occasions"]]
        self.occasion_box.selected_value = t["occasion"] if t["occasion"] in [o["key"] for o in c["occasions"]] else c["occasions"][0]["key"]
        self.target_box.text = t["target_min"]
        self.venue_box.items = [(v["name"], v["key"]) for v in c["venues"]]
        self.venue_box.selected_value = t["venue"] if t["venue"] in c["venue_by"] else "redcircle"
        state.set_control_attr(self.target_box, "min", "0.5")
        state.set_control_attr(self.target_box, "max", "60")
        state.set_control_attr(self.target_box, "step", "0.5")
        tpl = c["template_by"].get(t["occasion"])
        self.tips_panel.items = list((tpl or {}).get("tips") or []) + CRAFT
        self.cards = [{"text": x.get("text") or "", "slide": x.get("slide") or ""} for x in t["cards"]] or [{"text": "", "slide": ""}]
        self._draw_cards()

    def _draw_cards(self, focus=None):
        n = len(self.cards)
        self.cards_panel.items = [{"i": i, "n": n, "text": cd["text"], "slide": cd["slide"], "page": self} for i, cd in enumerate(self.cards)]
        self._times()
        if focus is not None:
            area = anvil.js.get_dom_node(self.cards_panel).querySelector(".tk-c-item:nth-child(%d) textarea" % (focus + 1))
            if area:
                getattr(area, "focus")()

    def cards_changed(self, redraw=True):
        self._set_dirty()
        if redraw:
            self._draw_cards()
        else:
            self._times()

    def move_card(self, i, step):
        j = i + step
        if 0 <= j < len(self.cards):
            self.cards[i], self.cards[j] = self.cards[j], self.cards[i]
            self.cards_changed()

    def remove_card(self, i):
        del self.cards[i]
        if not self.cards:
            self.cards.append({"text": "", "slide": ""})
        self.cards_changed()

    def _target(self):
        try:
            return float(self.target_box.text) or float(self.talk["target_min"])
        except (TypeError, ValueError):
            return float(self.talk["target_min"] or 5)

    def _times(self):
        w = sum(words(x["text"]) for x in self.cards)
        secs = w / float(WPM) * 60 + len(self.cards) * 2.5
        tgt = self._target() * 60
        self.time.text = mb.fmt_secs(secs)
        over, ok = secs > tgt * 1.1, secs > tgt * 0.7
        self.time.role = ["tk-time", "over" if over else "ok" if ok else "short"]
        self.bar.style["width"] = "%d%%" % min(100, secs / tgt * 100 if tgt else 100)
        self.bar.classes["over"] = over
        self.time_note.text = "%d words at %d words a minute, plus a breath per card. Target %s.%s" % (
            w, WPM, mb.fmt_secs(tgt), " Cut a card or an example." if over else " Room for one more story." if secs < tgt * 0.7 else " Right on.")

    def _set_dirty(self):
        if not self.dirty:
            self.dirty = True
            window.addEventListener("beforeunload", self._unload)

    def _before_unload(self, event):
        if self.dirty:
            event.preventDefault()
            event.returnValue = ""

    @handle("", "hide")
    def form_hide(self, **event_args):
        window.removeEventListener("beforeunload", self._unload)

    @handle("title_box", "change")
    def title_box_change(self, **event_args):
        self._set_dirty()

    @handle("target_box", "change")
    def target_box_change(self, **event_args):
        self._set_dirty()
        self._times()

    @handle("occasion_box", "change")
    def occasion_box_change(self, **event_args):
        self._set_dirty()

    @handle("venue_box", "change")
    def venue_box_change(self, **event_args):
        self._set_dirty()

    @handle("add_button", "click")
    def add_button_click(self, **event_args):
        self.cards.append({"text": "", "slide": ""})
        self._set_dirty()
        self._draw_cards(focus=len(self.cards) - 1)

    @handle("resplit_button", "click")
    def resplit_button_click(self, **event_args):
        from ...Dialogs.PasteScript import PasteScript
        got = alert(PasteScript(mode="replace"), buttons=[], role="app-dialog", large=True)
        if got and got["cards"]:
            self.cards = got["cards"]
            self.cards_changed()

    def _save(self):
        title = (self.title_box.text or "").strip()
        if not title:
            state.toast("Give your talk a title.", "error")
            return None
        r = state.call("save_talk", self.talk["id"], {
            "title": title, "occasion": self.occasion_box.selected_value, "target_min": self._target(),
            "venue": self.venue_box.selected_value, "cards": [x for x in self.cards if x["text"].strip()]})
        if r:
            self.dirty = False
            window.removeEventListener("beforeunload", self._unload)
            self.talk = r["talk"]
            state.toast("Saved", "ok")
        return r

    @handle("save_button", "click")
    def save_button_click(self, **event_args):
        self._save()

    @handle("practise_button", "click")
    def practise_button_click(self, **event_args):
        if self._save():
            router.go("stage", self.talk["id"])
