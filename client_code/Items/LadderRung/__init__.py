from anvil import *

from ._anvil_designer import LadderRungTemplate
from ... import mb, router, state


class LadderRung(LadderRungTemplate):
    """Ladder: one rung (number, name, room · crowd · mood · distractions, goal, status, runs, best nerves drop, Start).
    item = Sessions.ladder_state rung {n, name, venue, fill, mood, distractions, qa, minutes, goal, why, open, climbed,
    runs, nerves [before, after] | None, best} + {next: bool}."""

    def __init__(self, **properties):
        super().__init__(**properties)
        r = self.item
        c = mb.content()
        v = c["venue_by"].get(r["venue"]) or c["venues"][0]
        crowd = max(v["min"], int(round(v["max"] * r["fill"])))
        mood = r["mood"]
        for m in c["moods"]:
            if m["key"] == r["mood"]:
                mood = m["name"].lower()
        bits = ["%s %s" % (mb.num(crowd), "person" if crowd == 1 else "people"), "%s crowd" % mood]
        names = {}
        for dis in c["distractions"]:
            names[dis["key"]] = dis["name"].lower()
        if r["distractions"]:
            bits.append(", ".join(names.get(k, k) for k in r["distractions"]))
        if r["qa"]:
            bits.append("questions at the end")
        self.num.text = str(r["n"])
        self.meta.text = "%s · %s" % (v["name"], " · ".join(bits))
        self.card.classes["climbed"] = bool(r["climbed"])
        self.card.classes["next"] = bool(r.get("next"))
        self.card.classes["locked"] = not r["open"]
        if r["climbed"]:
            self.status.text, self.status.role = "Climbed", ["ld-status", "good"]
        elif r.get("next"):
            self.status.text, self.status.role = "Next", ["ld-status", "brand"]
        elif not r["open"]:
            self.status.text, self.status.role = "Locked", ["ld-status"]
        else:
            self.status.text, self.status.role = "Open", ["ld-status"]
        facts = []
        if r["runs"]:
            facts.append("Practised " + state.plural(r["runs"], "time"))
        nv = r.get("nerves")
        if nv:
            facts.append("nerves %s → %s" % (c["nerves"][nv[0]].lower(), c["nerves"][nv[1]].lower()))
        if r.get("best"):
            facts.append("best score %d" % r["best"])
        self.facts.text = " · ".join(facts)
        self.facts.visible = bool(facts)
        self.start.visible = bool(r["open"])
        self.lock_note.visible = not r["open"]
        self.start_text.text = "Again" if r["climbed"] else "Step up"
        state.set_attr(self.start, "href", router.href("stage", "rung:%d" % r["n"]))
        state.set_attr(self.start, "aria-label", "Rung %d, %s: %s" % (r["n"], r["name"], "practise again" if r["climbed"] else "step up"))
