"""Turns what the browser measured during a talk into scores, the overall Stage Confidence and coaching tips.

The browser (MB.Voice + the stage page in web/pages) listens to the microphone and watches the head and hands,
and sends only numbers (never audio). clean() keeps the known keys, as numbers, in sane ranges; score() returns
{"confidence", "parts": {key: 0-100 or None}, "band", "tips", "facts"}. A part is None when it can't be judged
(e.g. eye contact in a voice-only session, timing without a target, too little speech).

What "confidence" means here: an audience hears confidence as a combination of things, so no single number
decides it. Each part is scored against what good speakers do (content.PARTS has the ideal ranges), then
weighted: fillers, pace, pauses, vocal variety and eye contact count most.
"""
import math

from . import content

# key -> (min, max) accepted from the browser; anything else is dropped
FIELDS = {
    "secs": (0, 7200), "span_secs": (0, 7200), "speak_secs": (0, 7200), "start_delay": (0, 600), "target_secs": (0, 7200),
    "syllables": (0, 100000), "words": (0, 30000), "art_rate": (0, 12), "pace_cv": (0, 3), "rush": (0, 5),
    "pauses": (0, 5000), "pause_long": (0, 1000), "pause_mean": (0, 60), "pause_longest": (0, 600), "pause_card": (0, 1000),
    "fillers": (0, 5000), "word_fillers": (0, 5000),
    "vol_snr": (-20, 90), "vol_var": (0, 40), "quiet_share": (0, 1),
    "pitch_med": (0, 1000), "pitch_std": (0, 24), "pitch_range": (0, 48), "monotone_share": (0, 1),
    "jitter": (0, 12), "shimmer": (0, 24), "clarity": (0, 1), "centroid": (0, 12000),
    "phrases": (0, 5000), "uptalk": (0, 5000), "trail": (0, 5000),
    "gaze_aud": (0, 1), "gaze_l": (0, 1), "gaze_c": (0, 1), "gaze_r": (0, 1), "gaze_down": (0, 1), "gaze_back": (0, 7200),
    "holds_pm": (0, 60), "gest_share": (0, 1), "sway": (0, 5),
    "distractions": (0, 100), "recovered": (0, 100), "cards": (0, 500), "questions": (0, 20), "answer_secs": (0, 3600),
    "beacons": (0, 200), "beacons_hit": (0, 200),
}
FLAGS = {"transcript", "tracked_gaze", "tracked_hands"}
WORDS_PER_SYLLABLE = 1 / 1.45  # average for English speech


def clean(m):
    out = {}
    if not isinstance(m, dict):
        return out
    for k, (lo, hi) in FIELDS.items():
        v = m.get(k)
        if isinstance(v, bool) or not isinstance(v, (int, float)) or v != v or v in (float("inf"), float("-inf")):
            continue
        out[k] = round(min(hi, max(lo, float(v))), 4)
    for k in FLAGS:
        if k in m:
            out[k] = bool(m.get(k))
    fw = m.get("filler_words")
    if isinstance(fw, dict):
        out["filler_words"] = {str(w)[:24]: int(min(999, max(0, n))) for w, n in list(fw.items())[:20]
                               if isinstance(n, (int, float)) and not isinstance(n, bool) and n > 0}
    return out


def band(x, bad_lo, good_lo, good_hi, bad_hi):
    """100 inside [good_lo, good_hi], falling straight to 0 at bad_lo / bad_hi."""
    if x is None:
        return None
    if good_lo <= x <= good_hi:
        return 100.0
    if x < good_lo:
        return 0.0 if x <= bad_lo else 100.0 * (x - bad_lo) / (good_lo - bad_lo)
    return 0.0 if x >= bad_hi else 100.0 * (bad_hi - x) / (bad_hi - good_hi)


def clamp(x, lo=0.0, hi=100.0):
    return max(lo, min(hi, x))


def wpm(m):
    span = m.get("span_secs") or m.get("secs") or 0
    if span < 5:
        return None
    words = m.get("words") if m.get("transcript") and m.get("words") else (m.get("syllables") or 0) * WORDS_PER_SYLLABLE
    return words / (span / 60.0)


def parts(m):
    """Each part 0-100 (rounded) or None."""
    speak = m.get("speak_secs") or 0
    span = max(1.0, m.get("span_secs") or m.get("secs") or 1)
    mins = span / 60.0
    enough = speak >= 8
    P = {}

    w = wpm(m)
    if enough and w is not None:
        s = band(w, 70, 128, 168, 230)
        s -= 40 * max(0.0, (m.get("pace_cv") or 0) - 0.35)          # big swings in speed
        s -= 60 * max(0.0, (m.get("rush") or 1) - 1.2)               # speeding up at the end
        P["pace"] = clamp(s)
    else:
        P["pace"] = None

    if enough:
        rate = (m.get("pauses") or 0) / mins
        s = 0.7 * band(rate, 0.5, 3, 16, 32) + 0.3 * band(m.get("pause_mean") or 0, 0.25, 0.55, 1.9, 4.5)
        s -= 7 * max(0.0, (m.get("pause_long") or 0) - (m.get("pause_card") or 0) * 0.5)  # freezes (card changes are half forgiven)
        P["pauses"] = clamp(s)
    else:
        P["pauses"] = None

    if enough:
        fpm = ((m.get("fillers") or 0) + (m.get("word_fillers") or 0)) / mins
        P["fillers"] = clamp(100 - 13 * fpm)
    else:
        P["fillers"] = None

    if enough and m.get("vol_snr") is not None:
        s = 0.75 * band(m.get("vol_snr"), 4, 16, 45, 70) + 0.25 * band(m.get("vol_var") or 0, 0.8, 2.5, 8, 15)
        s -= 45 * (m.get("quiet_share") or 0)
        P["projection"] = clamp(s)
    else:
        P["projection"] = None

    if enough and m.get("pitch_std") is not None:
        s = 0.7 * band(m.get("pitch_std"), 0.6, 2.0, 6.0, 10) + 0.3 * (100 - 100 * (m.get("monotone_share") or 0))
        P["expression"] = clamp(s)
    else:
        P["expression"] = None

    if enough and m.get("jitter") is not None:
        j = 100 * clamp((1.25 - m.get("jitter")) / (1.25 - 0.35), 0, 1)
        sh = 100 * clamp((4.5 - (m.get("shimmer") or 0)) / (4.5 - 1.6), 0, 1)
        cl = band(m.get("clarity") or 0, 0.3, 0.62, 1, 1.1)
        P["steadiness"] = clamp(0.45 * j + 0.2 * sh + 0.35 * cl)
    else:
        P["steadiness"] = None

    ph = m.get("phrases") or 0
    if enough and ph >= 3:
        up, tr = (m.get("uptalk") or 0) / ph, (m.get("trail") or 0) / ph
        P["endings"] = clamp(100 - 140 * max(0.0, up - 0.08) - 110 * max(0.0, tr - 0.08))
    else:
        P["endings"] = None

    if m.get("tracked_gaze") and span >= 10:
        aud = m.get("gaze_aud") or 0
        shares = [m.get("gaze_l") or 0, m.get("gaze_c") or 0, m.get("gaze_r") or 0]
        tot = sum(shares) or 1
        ent = -sum((x / tot) * math.log(x / tot) for x in shares if x > 0) / math.log(3)  # 1 = perfectly even
        s = 0.5 * band(aud, 0.15, 0.68, 1, 1.1) + 0.3 * 100 * ent + 0.2 * band(m.get("holds_pm") or 0, 0.5, 4, 14, 30)
        s -= 1.5 * max(0.0, (m.get("gaze_back") or 0) - 2)
        if m.get("beacons"):
            s = 0.6 * s + 40 * ((m.get("beacons_hit") or 0) / m.get("beacons"))
        P["eyes"] = clamp(s)
    else:
        P["eyes"] = None

    if m.get("tracked_hands") and span >= 10:
        s = 0.6 * band(m.get("gest_share") or 0, 0.02, 0.18, 0.6, 0.95) + 0.4 * 100 * clamp((0.4 - (m.get("sway") or 0)) / (0.4 - 0.1), 0, 1)
        P["presence"] = clamp(s)
    else:
        P["presence"] = None

    tgt = m.get("target_secs") or 0
    if tgt >= 10 and (m.get("secs") or 0) >= 5:
        P["timing"] = clamp(band(m["secs"] / tgt, 0.45, 0.9, 1.1, 1.6))
    else:
        P["timing"] = None

    return {k: (None if v is None else int(round(v))) for k, v in P.items()}


def confidence(p):
    num = den = 0.0
    for part in content.PARTS:
        v = p.get(part["key"])
        if v is not None:
            num += v * part["weight"]
            den += part["weight"]
    return int(round(num / den)) if den else None


def facts(m):
    """Plain numbers for the report, rounded for people."""
    span = max(1.0, m.get("span_secs") or m.get("secs") or 1)
    w = wpm(m)
    f = {"wpm": None if w is None else int(round(w)),
         "fillers_pm": round(((m.get("fillers") or 0) + (m.get("word_fillers") or 0)) / (span / 60.0), 1),
         "pauses_pm": round((m.get("pauses") or 0) / (span / 60.0), 1),
         "speak_share": round((m.get("speak_secs") or 0) / span, 2)}
    c = m.get("centroid")
    if c:
        f["timbre"] = "warm and dark" if c < 1200 else "balanced" if c < 2200 else "bright"
    pm = m.get("pitch_med")
    if pm:
        f["voice"] = "low" if pm < 140 else "middle" if pm < 210 else "high"
    return f


def _tip(key, m, f):
    if key == "pace":
        w = f.get("wpm") or 0
        if w > 168:
            return "You averaged %d words a minute. Aim for 130 to 165: land the last word of each sentence, then take a breath." % w
        if w and w < 128:
            return "At %d words a minute you may lose energy. Speed up for stories, slow down only for the big ideas." % w
        if (m.get("rush") or 1) > 1.2:
            return "You sped up towards the end. Mark your last two cards \"slow\" and finish at the pace you started."
        return "Your speed swings a lot. Try the Metronome drill to find a steady 140."
    if key == "pauses":
        if (m.get("pause_long") or 0) > 2:
            return "You froze for more than three seconds %d times. When you lose your place, look at the card, smile, and pick up the idea, not the words." % int(m.get("pause_long"))
        return "You paused %.1f times a minute. Pause after every key sentence; it feels long to you and confident to them." % f.get("pauses_pm", 0)
    if key == "fillers":
        return "About %.1f hesitation sounds a minute. When you feel an um coming, close your mouth and pause instead." % f.get("fillers_pm", 0)
    if key == "projection":
        if (m.get("quiet_share") or 0) > 0.2:
            return "Parts of your talk were too quiet for the back row. Breathe low into your belly and aim your voice at the last seat."
        return "Your volume stays flat. Drop to almost a whisper for one line, then come back strong: contrast makes people listen."
    if key == "expression":
        return "Your pitch moved about %.1f semitones. Let it climb for questions and excitement, and fall to land statements." % (m.get("pitch_std") or 0)
    if key == "steadiness":
        return "Your voice wobbled a little: that's adrenaline. Two rounds of box breathing and a hum before you start steady it."
    if key == "endings":
        ph = m.get("phrases") or 1
        if (m.get("uptalk") or 0) >= (m.get("trail") or 0):
            return "%d of %d sentences rose at the end, like a question. Let your pitch fall on the last word of a statement." % (int(m.get("uptalk") or 0), int(ph))
        return "%d of %d sentences faded away at the end. Keep full volume to the very last word." % (int(m.get("trail") or 0), int(ph))
    if key == "eyes":
        aud = m.get("gaze_aud") or 0
        if aud < 0.6:
            return "You looked at the audience %d%% of the time. Glance at the card, take the idea, then look up before you speak." % int(aud * 100)
        sides = [("left", m.get("gaze_l") or 0), ("centre", m.get("gaze_c") or 0), ("right", m.get("gaze_r") or 0)]
        low = min(sides, key=lambda x: x[1])
        return "The %s of the room got little attention. Give each section a whole sentence, then move on." % low[0]
    if key == "presence":
        if (m.get("sway") or 0) > 0.3:
            return "You swayed quite a bit. Plant your feet; move with purpose to a new spot, then stand still."
        return "Your hands stayed low. Let gestures happen above the waist, palms open, to show size, number and direction."
    if key == "timing":
        tgt, secs = m.get("target_secs") or 0, m.get("secs") or 0
        if secs > tgt:
            return "You ran %d seconds over. Cut one example rather than talking faster." % int(secs - tgt)
        return "You finished %d seconds early. Pause more, and let your best story breathe." % int(tgt - secs)
    return ""


def tips(p, m, f, n=3):
    order = sorted([(v, k) for k, v in p.items() if v is not None])
    out = []
    by_key = {x["key"]: x for x in content.PARTS}
    for v, k in order:
        if v >= 88 or len(out) >= n:
            break
        out.append({"part": k, "label": by_key[k]["label"], "score": v, "text": _tip(k, m, f), "drill": by_key[k]["drill"]})
    return out


def strengths(p, n=2):
    by_key = {x["key"]: x["label"] for x in content.PARTS}
    best = sorted([(v, k) for k, v in p.items() if v is not None and v >= 75], reverse=True)[:n]
    return [{"part": k, "label": by_key[k], "score": v} for v, k in best]


def score(metrics):
    m = clean(metrics)
    p = parts(m)
    f = facts(m)
    c = confidence(p)
    return {"confidence": c, "parts": p, "band": content.band(c) if c is not None else None, "tips": tips(p, m, f), "strengths": strengths(p),
            "facts": f, "metrics": m, "enough": (m.get("speak_secs") or 0) >= 8}
