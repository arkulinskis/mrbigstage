import json

import anvil.server
from anvil import *
from anvil.js import window

from ._anvil_designer import ReportTemplate
from ... import mb, router, state

FACES = ["", "😌", "🙂", "😬", "😰", "😱"]


def r1(x, k=0):
    """A number rounded to k decimals, shown without trailing zeros; '–' when unknown."""
    if x is None:
        return "–"
    return "%g" % round(x, k)


def pct(x):
    return "%d%%" % round((x or 0) * 100)


class Report(ReportTemplate):
    """#report/<session id> (saved, members) and #report/guest (the guest's preview, kept in this tab's
    sessionStorage by the stage). Score ring, the ten skills (click a bar for what it measures), coaching tips,
    the second-by-second timeline with the recording kept in this browser (mb-charts.js MB.mountTape), the numbers,
    where you looked, notes to self, delete."""

    def __init__(self, args=(), **properties):
        super().__init__(**properties)
        self.sid = args[0] if args else "guest"
        self.guest = self.sid == "guest"
        self.c = mb.content()
        self.body.visible = False
        self.missing.visible = False
        if self.guest:
            d = self._from_guest()
        else:
            r = anvil.server.call("get_report", self.sid)
            d = r.get("report") if r.get("ok") else None
            if d is None:
                self.missing_title.text = "That report isn't available"
        if d is None:
            self.missing.visible = True
            return
        self.d = d
        self.body.visible = True
        self._draw()

    def _from_guest(self):
        try:
            g = json.loads(window.sessionStorage.getItem("mb.guestReport") or "null")
        except Exception:
            g = None
        if not g:
            return None
        p, sc = g["payload"], g["score"]
        return {"id": "guest", "title": p.get("title"), "venue": p.get("venue"), "crowd": p.get("crowd"), "mode": p.get("mode"),
                "seconds": p["metrics"].get("secs"), "confidence": sc.get("confidence"), "created": None,
                "parts": sc.get("parts"), "metrics": p.get("metrics"), "timeline": g.get("timeline") or {}, "band": sc.get("band"),
                "tips": sc.get("tips"), "strengths": sc.get("strengths"), "facts": sc.get("facts"), "before": None, "reflection": "",
                "kind": p.get("kind"), "drill": p.get("drill"), "talk_id": None, "guest": True}

    def _draw(self):
        d, c = self.d, self.c
        m, f, p, before = d.get("metrics") or {}, d.get("facts") or {}, d.get("parts") or {}, d.get("before")
        conf = d.get("confidence")
        # hero
        self.ring.visible = conf is not None
        self.breath.visible = conf is None
        self.ring.label = d["band"]["name"] if d.get("band") else ""
        self.ring.score = conf
        self.kicker.text = "Preview report" if d.get("guest") else "Report · " + mb.date_time(d.get("created"))
        self.title.text = d.get("title") or "Talk"
        state.heading(self.title, 1)
        self.band_line.text = d["band"]["line"] if d.get("band") else "No voice score for this one."
        mode = {"vr": "In VR", "ar": "Passthrough"}.get(d.get("mode"), "On screen")
        bits = [mb.venue_name(d.get("venue")), "%s people" % mb.num(d.get("crowd")), mb.fmt_secs(d.get("seconds")), mode]
        if d.get("mood"):
            bits.append("%s crowd" % d["mood"])
        self.meta.text = " · ".join(bits)
        delta = conf - before["confidence"] if before and conf is not None and before.get("confidence") is not None else None
        self.delta_box.visible = delta is not None
        if delta is not None:
            self.delta.text = ("+" if delta >= 0 else "") + str(delta)
            self.delta.role = ["rp-delta-n", "up" if delta >= 0 else "down"]
            self.delta_note.text = "vs your last run (%s)" % before["confidence"]
        # actions
        again = ("stage/drill:" + d["drill"]) if d.get("drill") else ("stage/" + d["talk_id"]) if d.get("talk_id") else \
            "stage/sample" if d.get("kind") == "sample" else "stage/free"
        state.set_attr(self.again, "href", "#" + again)
        self.progress_link.visible = not d.get("guest")
        # skills
        self.parts_panel.items = [{"label": pp["label"], "icon": pp["icon"], "score": p.get(pp["key"]), "what": pp["what"], "ideal": pp["ideal"],
                                   "mark": (before.get("parts") or {}).get(pp["key"]) if before else None} for pp in c["parts"]]
        self.parts_note.text = "Tap a line to see what it measures. %sA dash means it couldn't be judged this time (for example eye contact needs VR or looking around with the mouse)." % (
            "The thin tick is your previous run. " if before else "")
        # coach
        tips = d.get("tips") or []
        self.tips_panel.items = tips
        self.no_tips.visible = not tips
        self.no_tips.text = "Nothing to coach here: this one was about calming down." if conf is None else \
            "Every part scored 88 or more. Spellbinding. Try a tougher crowd or a bigger room."
        strengths = d.get("strengths") or []
        self.strengths_part.visible = bool(tips) and bool(strengths)
        self.strengths_panel.items = [{"text": "%s %s" % (s["label"], s["score"]), "kind": "good"} for s in strengths]
        # timeline + recording
        tl = d.get("timeline") or {}
        self.timeline.content = window.MB.timeline(mb.js(tl), mb.js({"cursor": True}))
        self.legend.content = window.MB.timelineLegend(bool(tl.get("gaze")))
        window.MB.mountTape(self.audio.node(), d["id"], mb.js(tl))
        # numbers
        nums = [(f.get("wpm") if f.get("wpm") is not None else "–", "words a minute"),
                (r1(f.get("fillers_pm"), 1), "hesitations a minute"), (r1(f.get("pauses_pm"), 1), "pauses a minute"),
                (r1(m.get("pause_longest"), 1) + " s" if m.get("pause_longest") is not None else "–", "longest pause"),
                (r1(m.get("start_delay"), 1) + " s" if m.get("start_delay") is not None else "–", "before your first word"),
                (pct(f["speak_share"]) if f.get("speak_share") is not None else "–", "of the time speaking"),
                ("%d Hz" % round(m["pitch_med"]) if m.get("pitch_med") else "–", "voice pitch" + (" (%s)" % f["voice"] if f.get("voice") else "")),
                (r1(m.get("pitch_range"), 1) + " st" if m.get("pitch_range") is not None else "–", "pitch range (semitones)"),
                (pct(m["monotone_share"]) if m.get("monotone_share") is not None else "–", "flat, monotone stretches"),
                ("%d dB" % round(m["vol_snr"]) if m.get("vol_snr") is not None else "–", "above the room noise"),
                (f.get("timbre") or "–", "timbre (brightness)"),
                (pct(m["clarity"]) if m.get("clarity") is not None else "–", "voice clarity (vs breathy)"),
                ("%s / %s" % (m.get("uptalk") or 0, m["phrases"]) if m.get("phrases") else "–", "sentences rising like a question"),
                ("%s / %s" % (m.get("trail") or 0, m["phrases"]) if m.get("phrases") else "–", "sentences fading out")]
        if m.get("distractions"):
            nums.append(("%s / %s" % (m.get("recovered") or 0, m["distractions"]), "distractions you talked through"))
        if m.get("questions"):
            nums.append((m["questions"], "questions answered"))
        if m.get("beacons"):
            nums.append(("%s / %s" % (m.get("beacons_hit") or 0, m["beacons"]), "lighthouse people found"))
        if m.get("tracked_hands"):
            nums.append((pct(m.get("gest_share")), "time gesturing"))
            nums.append((r1(m.get("sway"), 2) + " m/s", "swaying"))
        self.numbers_panel.items = [{"value": v, "label": label} for v, label in nums]
        self.eyes_part.visible = bool(m.get("tracked_gaze"))
        if m.get("tracked_gaze"):
            self.eyes_panel.items = [{"label": "Left", "share": m.get("gaze_l")}, {"label": "Centre", "share": m.get("gaze_c")},
                                     {"label": "Right", "share": m.get("gaze_r")}]
            self.eyes_note.text = "%s of the time on the audience, %s on your notes%s. %s held looks a minute." % (
                pct(m.get("gaze_aud")), pct(m.get("gaze_down")),
                (", %d s with your back turned" % round(m["gaze_back"])) if m.get("gaze_back") else "", r1(m.get("holds_pm"), 1))
        fw = m.get("filler_words") or {}
        self.fillers_part.visible = bool(fw)
        self.fillers_panel.items = [{"text": "“%s” × %s" % (w, fw[w]), "kind": "warn"} for w in sorted(fw, key=lambda k: -fw[k])]
        # notes / sign up
        self.guest_part.visible = bool(d.get("guest"))
        self.notes_part.visible = not d.get("guest")
        if not d.get("guest"):
            nb, na = d.get("nerves_before"), d.get("nerves_after")
            self.nerves_line.visible = bool(nb or na)
            self.nerves_line.text = " ".join(x for x in [("Before " + FACES[nb]) if nb else "", ("→ After " + FACES[na]) if na else ""] if x)
            self.note_box.text = d.get("reflection") or ""
            state.set_control_attr(self.note_box, "aria-label", "Notes to self")
            state.set_control_attr(self.note_box, "maxlength", "1000")

    @handle("save_note_button", "click")
    def save_note_button_click(self, **event_args):
        if state.call("set_reflection", self.sid, self.note_box.text or "") is not None:
            state.toast("Note saved", "ok")

    @handle("delete_button", "click")
    def delete_button_click(self, **event_args):
        if confirm("Its score leaves your progress too. This can't be undone.", title="Delete this report?",
                   buttons=[("Cancel", False), ("Delete", True)], role="app-dialog"):
            if state.call("delete_session", self.sid) is not None:
                getattr(window.MB.Tapes, "del")(self.sid)  # the recording kept in this browser goes too
                state.toast("Deleted")
                router.go("progress")
