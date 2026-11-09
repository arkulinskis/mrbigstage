from anvil import *

from ._anvil_designer import DrillsTemplate
from ... import mb, state


class Drills(DrillsTemplate):
    """#drills (the speaking gym: short drills, the one for your weakest skill first) and #drills/handbook (the
    speaker's handbook). Open to everyone; members also see which drills they have done before."""

    def __init__(self, args=(), **properties):
        super().__init__(**properties)
        tab = "handbook" if args and args[0] == "handbook" else "gym"
        c = mb.content()
        self.gym_part.visible = tab == "gym"
        self.handbook_part.visible = tab == "handbook"
        self.tab_gym.classes["on"] = tab == "gym"
        self.tab_handbook.classes["on"] = tab == "handbook"
        if tab == "gym":
            self.title.text = "The speaking gym: short reps, big gains"
            self.lead.text = "One to four minutes each. Every drill trains one or two things and shows a live meter for them."
            prog = state.call_quiet("get_progress") if state.me() else None
            home = state.call_quiet("get_home") if state.me() else None
            done = set((prog or {}).get("drills") or [])
            pick = home["weak"]["drill"] if home and home.get("weak") else None
            drills = sorted(c["drills"], key=lambda d: 0 if d["key"] == pick else 1)
            self.drills_panel.items = [dict(d, pick=d["key"] == pick, done=d["key"] in done) for d in drills]
        else:
            self.title.text = "The speaker's handbook: everything they don't tell you"
            self.lead.text = "Short, practical advice. Read one, then go and try it on stage."
            self.handbook_panel.items = c["handbook"]
            self.blend.text = ("People hear confidence as a blend: a steady, unhurried pace; pauses that let ideas land; few ums; "
                               "a voice that carries and moves in pitch; statements that end down and firm; eyes on the room. "
                               "MrBigStage measures each of these separately (%s) and blends them, weighted by how much listeners "
                               "notice them, into one Stage Confidence score." % ", ".join(p["label"].lower() for p in c["parts"]))
        state.heading(self.title, 1)
