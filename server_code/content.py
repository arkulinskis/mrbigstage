"""Everything MrBigStage knows that isn't user data: venues, drills, talk templates, impromptu topics,
Q&A questions, the speaker's handbook, badges, levels, goals and what each score means.

public() is what the browser gets (one call, cached in MB.content()). Keep ids stable: sessions store
venue keys, drill keys and part keys.
"""

# ------------------------------------------------------------------------------------------------ the scores
# key -> label, weight in the overall Stage Confidence, what it measures, ideal, and the drill that trains it
PARTS = [
    {"key": "pace", "label": "Pace", "weight": 13, "icon": "gauge",
     "what": "How fast you speak, in words a minute, and whether you stay steady or rush at the end.",
     "ideal": "130 to 165 words a minute, about the speed of a good TED talk.", "drill": "metronome"},
    {"key": "pauses", "label": "Pauses", "weight": 12, "icon": "pause",
     "what": "Silences of half a second or more between thoughts: how often, how long, and any long freezes.",
     "ideal": "3 to 16 deliberate pauses a minute, most under two seconds.", "drill": "powerpause"},
    {"key": "fillers", "label": "Fillers", "weight": 14, "icon": "zap",
     "what": "Hesitation sounds (um, uh, a long \"sooo\"), and filler words if you turn on the transcript.",
     "ideal": "Fewer than one a minute. Replace each one with a pause.", "drill": "zapper"},
    {"key": "projection", "label": "Projection", "weight": 11, "icon": "volume",
     "what": "How clearly your voice rises above the room, and whether you vary your volume.",
     "ideal": "Loud enough for the back row, with some light and shade.", "drill": "backrow"},
    {"key": "expression", "label": "Vocal variety", "weight": 12, "icon": "wave",
     "what": "How much your pitch moves (melody), and how long you stay flat or monotone.",
     "ideal": "A pitch swing of 2 to 6 semitones; no flat stretch longer than ten seconds.", "drill": "ladder"},
    {"key": "steadiness", "label": "Steadiness", "weight": 8, "icon": "anchor",
     "what": "Your timbre: shakiness in pitch and loudness from moment to moment, and how full and clear (not breathy) your voice is.",
     "ideal": "A calm, resonant voice. Breathe low and slow before you start.", "drill": "warmup"},
    {"key": "endings", "label": "Strong endings", "weight": 8, "icon": "flag",
     "what": "How your sentences end: rising like a question (uptalk) or fading away (trailing off).",
     "ideal": "Statements land down and firm, at full volume, all the way to the last word.", "drill": "ladder"},
    {"key": "eyes", "label": "Eye contact", "weight": 12, "icon": "eye",
     "what": "Where your head points: at the audience or at your notes, how evenly you share left, centre and right, and how often you hold someone's gaze.",
     "ideal": "Over 70 percent of your time on the audience, every section included, 3-second holds.", "drill": "lighthouse"},
    {"key": "presence", "label": "Body & gestures", "weight": 5, "icon": "hand",
     "what": "In VR: open hand gestures above the waist, and how much you sway or rock.",
     "ideal": "Hands visible and purposeful a quarter to half of the time; feet planted between moves.", "drill": "lighthouse"},
    {"key": "timing", "label": "Timing", "weight": 5, "icon": "clock",
     "what": "How close you finish to your target length.",
     "ideal": "Within 10 percent of the target.", "drill": "elevator"},
]
PART_KEYS = [p["key"] for p in PARTS]

BANDS = [  # overall score -> how we describe it
    (90, "Spellbinding", "The room is yours. Record this one."),
    (78, "Compelling", "People lean in. Polish the details."),
    (64, "Solid", "Clear and credible. Now add colour."),
    (48, "Getting there", "The bones are good. Pick one thing to fix."),
    (0, "Finding your feet", "Everyone starts here. Keep stepping up."),
]

# ------------------------------------------------------------------------------------------------ venues
VENUES = [
    {"key": "redcircle", "name": "The Red Circle", "crowd": 1200, "min": 200, "max": 1200, "icon": "circle",
     "blurb": "A 1,200-seat theatre, a round red carpet and one bright spotlight. The big one.",
     "colors": ["#0b0b0d", "#e62b1e", "#ffb547"], "kind": "theatre"},
    {"key": "boardroom", "name": "The Boardroom", "crowd": 10, "min": 4, "max": 14, "icon": "briefcase",
     "blurb": "Ten executives round a long table, a glass wall and a city at dusk. Short and sharp.",
     "colors": ["#1a2230", "#8fb3d9", "#f2d29b"], "kind": "boardroom"},
    {"key": "lecture", "name": "Lecture Hall", "crowd": 80, "min": 20, "max": 120, "icon": "school",
     "blurb": "Tiered wooden benches, a chalkboard and students who may or may not have done the reading.",
     "colors": ["#2a1f17", "#c99a5b", "#e8e1c9"], "kind": "lecture"},
    {"key": "wedding", "name": "Wedding Reception", "crowd": 120, "min": 30, "max": 160, "icon": "glass",
     "blurb": "Round tables, string lights and a glass in your hand. Make them laugh, then make them cry.",
     "colors": ["#2b2030", "#f3c9a0", "#ffe7b8"], "kind": "wedding"},
    {"key": "townhall", "name": "Town Hall", "crowd": 300, "min": 60, "max": 400, "icon": "flagpole",
     "blurb": "Folding chairs on a wooden floor, neighbours who care and a few who came to argue.",
     "colors": ["#2c2419", "#d9a441", "#f5ead2"], "kind": "townhall"},
    {"key": "arena", "name": "The Arena", "crowd": 5000, "min": 1000, "max": 5000, "icon": "stadium",
     "blurb": "Five thousand people, giant screens, a wall of light. Keynote energy.",
     "colors": ["#07070c", "#6e5bff", "#25d0ff"], "kind": "arena"},
    {"key": "interview", "name": "Interview Room", "crowd": 3, "min": 1, "max": 4, "icon": "chair",
     "blurb": "Three panelists behind a desk, a glass of water, and the question you were dreading.",
     "colors": ["#1d2422", "#7fb8a4", "#efe8d8"], "kind": "interview"},
]
VENUE_KEYS = [v["key"] for v in VENUES]
MOODS = [
    {"key": "warm", "name": "Warm", "blurb": "Friends and fans. They want you to win."},
    {"key": "neutral", "name": "Neutral", "blurb": "A normal crowd: earn their attention."},
    {"key": "tough", "name": "Tough", "blurb": "Arms crossed, phones out. Win them over."},
]
PROMPTERS = [
    {"key": "cards", "name": "Cue cards in your hand", "blurb": "Short cards on your left controller. Flick the thumbstick or press A / X to swipe."},
    {"key": "monitor", "name": "Confidence monitor", "blurb": "A screen on the stage floor, like the big conferences: this card, the next one and the clock."},
    {"key": "scroll", "name": "Scrolling teleprompter", "blurb": "Your whole script scrolls on the floor monitor and follows your voice: it waits when you pause."},
    {"key": "none", "name": "No notes", "blurb": "Just you and the room. Only the clock."},
]
COACH_LEVELS = [
    {"key": "off", "name": "Off", "blurb": "No hints while you speak. The report tells all afterwards."},
    {"key": "subtle", "name": "Subtle", "blurb": "Small lights on the floor monitor: pace, volume, fillers."},
    {"key": "full", "name": "Coach", "blurb": "Lights plus short nudges: \"slow down\", \"look left\", \"nice pause\"."},
]
DISTRACTIONS = [
    {"key": "cough", "name": "Coughs and sneezes"},
    {"key": "phone", "name": "A phone rings"},
    {"key": "late", "name": "Latecomers walk in"},
    {"key": "leave", "name": "Someone leaves early"},
    {"key": "feedback", "name": "Microphone squeal"},
]

# ------------------------------------------------------------------------------------------------ talk templates
def _cards(*pairs):
    return [{"text": t, "slide": s} for t, s in pairs]


TEMPLATES = [
    {"key": "idea", "name": "Big-idea talk", "minutes": 8, "venue": "redcircle", "icon": "bulb",
     "blurb": "The classic shape of a great conference talk: hook, story, one idea, proof, a call to action.",
     "title": "The Five-Minute Rule",
     "cards": _cards(
         ("Hook. Start with a question, a surprising number or the middle of a story. \"Three years ago I missed my own sister's wedding toast because I was too scared to stand up.\"", "Three years ago..."),
         ("Why it matters. Tell them what is at stake for THEM, not for you. Who has felt this?", "Have you felt this?"),
         ("The story. One person, one moment, one obstacle. Slow down here and use their words.", ""),
         ("The idea in one sentence. \"If something scary takes less than five minutes, do it now, before your brain starts negotiating.\"", "The Five-Minute Rule"),
         ("Proof. One study, one example, one demonstration. Keep numbers round and few.", "5 minutes"),
         ("Turn it on them. What would this look like on Monday morning?", "Monday morning"),
         ("Call to action. One concrete, small step. Then pause.", "Your turn"),
         ("Close the loop. Go back to the opening story and finish it. Thank you.", "Thank you")),
     "tips": ["One talk, one idea.", "Open with a story, not your name.", "Write your last line first."]},
    {"key": "lightning", "name": "Lightning talk", "minutes": 5, "venue": "townhall", "icon": "zap",
     "blurb": "Five minutes, three points, no slack. Great for meetups and team demos.",
     "title": "Three Things I Learned Shipping Too Fast",
     "cards": _cards(
         ("Hi, I'm (your name). In five minutes, three things I learned the hard way.", "3 lessons"),
         ("Lesson one: small and boring beats big and clever. A story about the release that broke on a Friday.", "Small beats clever"),
         ("Lesson two: write it down before you build it. What changed when we did.", "Write it down"),
         ("Lesson three: say no out loud. How to decline politely in one sentence.", "Say no"),
         ("If you remember one thing: (repeat the strongest lesson). Thanks!", "Thanks!")),
     "tips": ["Rehearse the transitions, not just the points.", "Cut anything that needs a footnote."]},
    {"key": "toast", "name": "Wedding toast", "minutes": 3, "venue": "wedding", "icon": "glass",
     "blurb": "Who you are, one great story, something heartfelt, and raise your glass.",
     "title": "A Toast to Sam and Alex",
     "cards": _cards(
         ("Good evening everyone. For those who don't know me, I'm (name), and I've known Sam since (how).", ""),
         ("The story: the night Sam drove four hours in the snow to bring me soup. That's who Sam is.", ""),
         ("Then Alex came along, and Sam started showing up on time. Alex, we've all been trying for years.", ""),
         ("What I see when I look at you two: (one sincere, specific thing).", ""),
         ("So please raise your glasses. To Sam and Alex!", "To Sam & Alex")),
     "tips": ["Keep it under four minutes.", "One embarrassing story, never two.", "Look at the couple when you get to the heartfelt part."]},
    {"key": "interview", "name": "Tell me about yourself", "minutes": 2, "venue": "interview", "icon": "briefcase",
     "blurb": "The 90-second answer every interview starts with: present, past, future.",
     "title": "Tell Me About Yourself",
     "cards": _cards(
         ("Present: what I do now, in one sentence, and the result I'm proudest of this year.", ""),
         ("Past: how I got here, the two experiences that matter for THIS job.", ""),
         ("Future: why this role, why this team, why now.", ""),
         ("Land it: \"...which is why I was excited to see this opening.\" Then stop and smile.", "")),
     "tips": ["90 seconds, then stop.", "Numbers beat adjectives.", "End on why them."]},
    {"key": "update", "name": "Team update", "minutes": 4, "venue": "boardroom", "icon": "chart",
     "blurb": "Status in a meeting without rambling: headline, three facts, the ask.",
     "title": "Q3 Launch Update",
     "cards": _cards(
         ("Headline first: we're on track for launch on the 14th, with one risk.", "On track"),
         ("What's done: the three milestones we hit since last time.", "Done"),
         ("The risk, and what we're doing about it.", "One risk"),
         ("The ask: one decision I need from this room today.", "The ask")),
     "tips": ["Lead with the answer.", "One ask per meeting.", "Stop talking when you've asked."]},
    {"key": "pitch", "name": "Investor pitch", "minutes": 5, "venue": "boardroom", "icon": "rocket",
     "blurb": "Problem, solution, traction, team, the ask, in five tight minutes.",
     "title": "Pitch: Mealtime Robots",
     "cards": _cards(
         ("The problem, as a story: a parent at 6pm with nothing in the fridge.", "6:00 pm"),
         ("The size of it: how many people, how often, how much it costs them.", "The problem"),
         ("Our solution, demoed or described in one breath.", "The solution"),
         ("Traction: the one chart that proves people want this.", "Traction"),
         ("Why us: the team and the unfair advantage.", "The team"),
         ("The ask: how much, for what, by when.", "The ask")),
     "tips": ["One number per card.", "Practise the Q&A more than the pitch."]},
    {"key": "tribute", "name": "Tribute or eulogy", "minutes": 5, "venue": "townhall", "icon": "heart",
     "blurb": "Honour someone with stories, not a list of dates. Room to breathe.",
     "title": "Remembering Grandpa Joe",
     "cards": _cards(
         ("Who they were to you, in one sentence.", ""),
         ("A story that shows their character. Small details: the smell of the workshop, the song he whistled.", ""),
         ("What they taught you, and how you still carry it.", ""),
         ("Something that will make people smile through the tears.", ""),
         ("A last word to them, directly.", "")),
     "tips": ["It's fine to pause and breathe.", "Print large text; your eyes may blur.", "Speak slower than feels natural."]},
    {"key": "class", "name": "Class presentation", "minutes": 6, "venue": "lecture", "icon": "school",
     "blurb": "A research topic, explained so the back row understands it.",
     "title": "How Octopuses Taste With Their Arms",
     "cards": _cards(
         ("A surprising fact to open: octopuses can taste with their arms.", "Taste with arms?"),
         ("The question our project asked.", "The question"),
         ("How we found out: method in plain words.", "Method"),
         ("What we found: two results, one picture each.", "Results"),
         ("Why it matters, and what we'd study next.", "So what?"),
         ("Thank you. I'd love your questions.", "Questions?")),
     "tips": ["Explain it to a 12-year-old.", "Look at the back row."]},
    {"key": "raise", "name": "Asking for a raise", "minutes": 3, "venue": "interview", "icon": "trend",
     "blurb": "Calm, prepared and specific: your value, the number, then silence.",
     "title": "My Case for a Raise",
     "cards": _cards(
         ("Thanks for making time. I'd like to talk about my compensation.", ""),
         ("What I've delivered this year: three results with numbers.", ""),
         ("What the role is worth in the market, and what I'm asking for.", ""),
         ("State the number. Then stop talking and wait.", "")),
     "tips": ["Say the number once, clearly.", "Silence after the ask is your friend."]},
    {"key": "intro", "name": "Introduce yourself", "minutes": 1, "venue": "townhall", "icon": "user",
     "blurb": "Thirty to sixty seconds at a meetup, a class or a new job.",
     "title": "Hello, I'm...",
     "cards": _cards(
         ("Name, and what I do, in plain words.", ""),
         ("One thing that surprises people about me.", ""),
         ("What I'm looking for here, or how people can help.", "")),
     "tips": ["Smile before the first word.", "Say your name slowly."]},
]
TEMPLATE_KEYS = [t["key"] for t in TEMPLATES]
OCCASIONS = [{"key": t["key"], "name": t["name"]} for t in TEMPLATES] + [{"key": "other", "name": "Something else"}]

SAMPLE_TALK = {  # for guests trying the stage before they sign up
    "id": "sample", "title": "Why Small Brave Things Matter", "occasion": "idea", "target_min": 2, "venue": "redcircle",
    "cards": _cards(
        ("Hello everyone. Two minutes from now, I want you to do one small brave thing.", "One small brave thing"),
        ("Last year I was terrified of speaking up in meetings. I'd rehearse a sentence for ten minutes, and then the moment was gone.", ""),
        ("So I made a rule: if it's scary and takes less than a minute, I do it right now.", "Do it now"),
        ("I asked the question. I sent the message. I raised my hand. Nothing exploded.", ""),
        ("Courage isn't a feeling you wait for. It's a muscle, and small reps build it.", "Courage is a muscle"),
        ("So, your one small brave thing today? Pick it now. Thank you.", "Thank you")),
}

# ------------------------------------------------------------------------------------------------ drills
DRILLS = [
    {"key": "powerpause", "name": "The Power Pause", "minutes": 2, "focus": ["pauses", "fillers"], "venue": "redcircle", "icon": "pause",
     "live": "pauses", "goal": {"part": "pauses", "min": 75},
     "blurb": "Read the lines and stop for a full breath at every slash. Silence is where people think.",
     "cards": _cards(("Every great talk / has a moment / where nobody breathes.", ""), ("You don't fill it. / You hold it. / One, two.", ""),
                     ("A pause says: / this matters. / Let it land.", ""), ("Now say something true about your week, / and pause after every sentence.", ""))},
    {"key": "metronome", "name": "Metronome", "minutes": 2, "focus": ["pace"], "venue": "lecture", "icon": "gauge",
     "live": "pace", "goal": {"part": "pace", "min": 75},
     "blurb": "Read at a steady 140 words a minute. A needle on the floor shows when you speed up.",
     "cards": _cards(("The octopus has three hearts, blue blood and nine brains: one in its head and one in each arm.", ""),
                     ("Each arm can taste, touch and decide on its own, which is why an octopus can open a jar while looking somewhere else.", ""),
                     ("Scientists once watched an octopus in a lab climb out of its tank at night, eat the fish next door and climb back home.", ""),
                     ("Nobody knew for weeks. Now read that again, a little slower, and smile at the last line.", ""))},
    {"key": "zapper", "name": "Filler Zapper", "minutes": 1, "focus": ["fillers"], "venue": "townhall", "icon": "zap",
     "live": "fillers", "goal": {"part": "fillers", "min": 85}, "impromptu": True,
     "blurb": "Sixty seconds on a random topic with zero ums. Every hesitation lights a red bulb.",
     "cards": []},
    {"key": "ladder", "name": "Pitch Ladder", "minutes": 2, "focus": ["expression", "endings"], "venue": "redcircle", "icon": "wave",
     "live": "pitch", "goal": {"part": "expression", "min": 70},
     "blurb": "Tell a tiny drama with your voice going up and down the ladder. Statements end low.",
     "cards": _cards(("It was a quiet night. Too quiet. (low and slow)", ""), ("Then: a knock at the door! (high, sudden)", ""),
                     ("I opened it... and there stood a very small dog, holding a very large sausage. (rising, then falling)", ""),
                     ("And that, friends, is how we got Gerald. (land it low and firm)", ""))},
    {"key": "backrow", "name": "The Back Row", "minutes": 1, "focus": ["projection"], "venue": "arena", "icon": "volume",
     "live": "volume", "goal": {"part": "projection", "min": 75},
     "blurb": "Five thousand seats. Speak to the very last row without shouting: breathe from the belly.",
     "cards": _cards(("Good evening, everybody! Can the back row hear me?", ""), ("Tonight is about one thing: showing up.", ""),
                     ("Not perfectly. Not fearlessly. Just showing up.", ""), ("So let's begin.", ""))},
    {"key": "topics", "name": "Table Topics", "minutes": 2, "focus": ["fillers", "pauses", "pace"], "venue": "townhall", "icon": "dice",
     "live": "fillers", "goal": {"part": "fillers", "min": 70}, "impromptu": True,
     "blurb": "A surprise question and two minutes to answer it. Point, reason, example, point.",
     "cards": []},
    {"key": "elevator", "name": "Elevator Pitch", "minutes": 0.5, "focus": ["timing", "pace"], "venue": "boardroom", "icon": "elevator",
     "live": "pace", "goal": {"part": "timing", "min": 80},
     "blurb": "Who you are and why it matters, in exactly 30 seconds. The clock is strict.",
     "cards": _cards(("Hi, I'm (name). I help (who) to (do what),", ""), ("so that (the result they care about).", ""),
                     ("Right now I'm (looking for / working on) ...", ""), ("Could we talk for ten minutes next week?", ""))},
    {"key": "lighthouse", "name": "Lighthouse", "minutes": 2, "focus": ["eyes", "presence"], "venue": "redcircle", "icon": "eye",
     "live": "gaze", "goal": {"part": "eyes", "min": 75}, "beacons": True,
     "blurb": "People in the crowd glow one by one. Find them, hold their gaze for three seconds, talk to them.",
     "cards": _cards(("Talk about a place you love. Each time someone glows, finish your sentence to them.", ""),
                     ("Now describe the best meal you've ever had, to a new person.", ""), ("Last one: what would you tell your younger self?", ""))},
    {"key": "warmup", "name": "Vocal Warm-up", "minutes": 2, "focus": ["steadiness", "expression"], "venue": "redcircle", "icon": "music",
     "live": "pitch", "goal": None,
     "blurb": "Hum, siren and stretch your voice before a big talk. Watch your pitch climb and fall.",
     "cards": _cards(("Hum gently on \"mmm\" for five seconds. Feel the buzz on your lips.", ""),
                     ("Siren: slide from your lowest note to your highest and back, on \"ooo\".", ""),
                     ("Tongue twister, slowly then fast: red leather, yellow leather.", ""),
                     ("Say your first line three ways: tired, excited, certain. Keep the certain one.", ""))},
    {"key": "breathe", "name": "Box Breathing", "minutes": 2, "focus": [], "venue": "redcircle", "icon": "lungs",
     "live": "breath", "goal": None, "breathing": True,
     "blurb": "Two minutes in the empty theatre: in 4, hold 4, out 4, hold 4. Your nerves before and after.",
     "cards": []},
    {"key": "qa", "name": "Hot Seat Q&A", "minutes": 4, "focus": ["fillers", "pauses", "endings"], "venue": "townhall", "icon": "hand",
     "live": "fillers", "goal": {"part": "fillers", "min": 70}, "qa": True,
     "blurb": "Hands go up. Three questions from the floor, some friendly, some not. Pause, answer, land it.",
     "cards": []},
    {"key": "toastdrill", "name": "Raise a Glass", "minutes": 2, "focus": ["eyes", "expression"], "venue": "wedding", "icon": "glass",
     "live": "gaze", "goal": {"part": "expression", "min": 65},
     "blurb": "A two-minute toast for a friend. Look at the whole room, then at the couple for the last line.",
     "cards": _cards(("Introduce yourself and how you know the couple.", ""), ("One funny, kind story.", ""),
                     ("One sincere wish for them.", ""), ("Raise your glass: to the happy couple!", ""))},
]
DRILL_KEYS = [d["key"] for d in DRILLS]

TOPICS = [
    "What's a small habit that changed your life?", "Describe the best teacher you ever had.", "Should every city have free public transit?",
    "What would you do with an extra hour every day?", "Tell us about a time you got lost.", "Is it better to be early or exactly on time?",
    "What's overrated, and why?", "Describe your perfect Sunday.", "What skill should every school teach?",
    "Tell us about a meal you'll never forget.", "If you could master one instrument overnight, which and why?",
    "What's a piece of advice you ignored, and regretted?", "Cats or dogs: make the case.", "Describe a place that feels like home.",
    "What would your ten-year-old self think of you now?", "Is failure a good teacher?", "Tell us about a stranger who was kind to you.",
    "What invention do we still need?", "Should homework be banned?", "What's the bravest thing you've seen someone do?",
    "Describe your job to an alien.", "What does a perfect friend do?", "What did you learn from your first job?",
    "Would you rather explore the deep sea or deep space?", "What's something you changed your mind about?",
    "Tell us about a book or film that stayed with you.", "What makes a great leader?", "How do you recharge after a long week?",
    "What's one tradition you want to keep forever?", "If you ran your town for a day, what would you change?",
    "What's the best gift you've ever given?", "Is social media good for friendships?", "Tell us about a moment you felt proud.",
    "What would you teach a room full of strangers in five minutes?", "What's your favourite season and why?",
    "Describe a time you had to start over.", "What's the most useful thing you own?", "Should we work four days a week?",
    "What makes a city beautiful?", "Who do you admire that nobody has heard of?",
]

QUESTIONS = {
    "general": [
        "Thanks for that. Can you give us one concrete example?", "What would you say to someone who disagrees with you?",
        "What's the first step you'd recommend for us?", "What surprised you most when you started on this?",
        "If we only remember one thing from today, what should it be?", "How do you know this actually works?",
        "What's the biggest mistake people make here?", "Where can we learn more about this?",
        "That sounds expensive. Is it worth it?", "Honestly, isn't this just common sense?",
        "What would you do differently if you started again?", "How does this apply to small teams, or to one person?",
    ],
    "interview": [
        "Why do you want to leave your current role?", "Tell us about a time you failed.", "What's your biggest weakness?",
        "Where do you see yourself in five years?", "Why should we hire you over the other candidates?",
        "Tell us about a conflict with a colleague and how you handled it.", "What are your salary expectations?",
        "What would you do in your first 90 days?", "Describe a project you're proud of.", "Do you have any questions for us?",
    ],
    "boardroom": [
        "What's the risk if we say no?", "How confident are you in that number?", "What do you need from us, exactly?",
        "Who else have you talked to about this?", "What happens if this slips by a month?", "Why now?",
    ],
    "townhall": [
        "How will this affect people on my street?", "Who's paying for it?", "Why weren't we consulted earlier?",
        "What's the timeline?", "Can you promise that tonight?", "What can we do to help?",
    ],
}

# ------------------------------------------------------------------------------------------------ handbook
HANDBOOK = [
    {"key": "nerves", "title": "Before you go on", "icon": "lungs", "tips": [
        ["Name the feeling", "Say \"I'm excited\" instead of \"I'm calm\". Nerves and excitement are the same body state; the label changes how you perform."],
        ["Breathe in a box", "In for 4, hold 4, out for 4, hold 4, four times. A long exhale tells your nervous system it's safe."],
        ["Shake it out", "Shake your hands, roll your shoulders, yawn on purpose. It releases the tension that makes voices shake."],
        ["Memorise the first 30 seconds", "Fear peaks at the start. Know your opening cold, and the rest follows."],
        ["Arrive early, own the space", "Walk the stage, find your spot, look at the back row. In MrBigStage, stand on the red circle before you start."]]},
    {"key": "structure", "title": "Shape your talk", "icon": "layers", "tips": [
        ["One idea", "If you can't say your talk in one sentence, the audience can't either."],
        ["Start in the story", "Skip \"Hi, my name is\". Open in the middle of a moment: \"The phone rang at 3am.\""],
        ["Rule of three", "Three points, three examples, three words. People remember threes."],
        ["Signpost", "\"First... the second thing... and finally.\" It lets listeners relax."],
        ["Write the last line first", "A strong ending is a destination. Know exactly where you'll land, then stop."]]},
    {"key": "voice", "title": "Your voice", "icon": "wave", "tips": [
        ["Pause instead of um", "Every time you feel an um coming, close your mouth and pause. It sounds confident, not lost."],
        ["Land your sentences", "Let the pitch fall on the last word of a statement. Rising endings sound like questions."],
        ["Slow down for the important bits", "Speed up for the story, slow right down for the idea. Contrast is what people hear."],
        ["Speak to the back row", "Project from the belly, not the throat. Imagine your voice hitting the back wall."],
        ["Use your range", "Your pitch has an attic and a basement. Visit both, on purpose."]]},
    {"key": "body", "title": "Body and eyes", "icon": "eye", "tips": [
        ["One person, one thought", "Finish a whole sentence to one person, then move to someone else. Three seconds each."],
        ["Visit every section", "Left, centre, right, front and back. The people you never look at stop listening."],
        ["Plant your feet", "Move with purpose to a new spot, then stand still. Swaying reads as nerves."],
        ["Open hands", "Gestures above the waist, palms visible. Pockets and crossed arms close you off."],
        ["Notes are fine, reading isn't", "Glance, grab the idea, look up, then speak."]]},
    {"key": "qa", "title": "Questions and answers", "icon": "hand", "tips": [
        ["Pause before answering", "A two-second pause shows you're thinking, not panicking."],
        ["Repeat or reframe", "\"So the question is how this works for small teams.\" It buys time and helps the room."],
        ["Answer, reason, example, stop", "Short answers sound sure. Long ones sound defensive."],
        ["It's OK not to know", "\"Good question, I don't know yet; I'll find out and send it to you.\" Then do it."]]},
    {"key": "after", "title": "After the talk", "icon": "trend", "tips": [
        ["Write one line", "What went well, and one thing to change. Patterns appear after five talks."],
        ["Listen back once", "Hearing your own voice is awkward the first time and invaluable after that."],
        ["Fix one thing at a time", "Pick your lowest score and do its drill three times this week."],
        ["Celebrate reps", "Confidence comes from evidence. Every talk you finish is evidence."]]},
]

GOALS = [
    {"key": "fear", "name": "Beat stage fright", "blurb": "Get used to big rooms until they feel normal."},
    {"key": "work", "name": "Shine at work", "blurb": "Meetings, updates and presentations without rambling."},
    {"key": "interview", "name": "Ace interviews", "blurb": "Calm, structured answers under pressure."},
    {"key": "event", "name": "Nail a big speech", "blurb": "A toast, a tribute, a speech on a big day."},
    {"key": "conference", "name": "Give a conference talk", "blurb": "Keynote energy, real stages, big crowds."},
    {"key": "teach", "name": "Teach and present", "blurb": "Classes, lectures, explaining hard things simply."},
]
GOAL_KEYS = [g["key"] for g in GOALS]

# ------------------------------------------------------------------------------------------------ progress
LEVELS = [  # xp needed, title
    (0, "Open Mic"), (250, "Meetup Speaker"), (700, "Panelist"), (1400, "Conference Speaker"),
    (2500, "Keynote"), (4000, "Main Stage"), (6500, "Headliner"), (10000, "Legend"),
]

BADGES = [
    {"key": "first", "name": "First Words", "icon": "mic", "how": "Finish your first session."},
    {"key": "regular", "name": "Regular", "icon": "repeat", "how": "Finish 10 sessions."},
    {"key": "smooth", "name": "Smooth Operator", "icon": "zap", "how": "Speak for a minute or more without a single hesitation sound."},
    {"key": "pause", "name": "The Power of Pause", "icon": "pause", "how": "Score 90 or more for pauses."},
    {"key": "fullhouse", "name": "Full House", "icon": "users", "how": "Speak to a crowd of 1,000 or more."},
    {"key": "arena", "name": "Arena Rock", "icon": "stadium", "how": "Finish a session in The Arena."},
    {"key": "lighthouse", "name": "Lighthouse", "icon": "eye", "how": "Score 85 or more for eye contact."},
    {"key": "marathon", "name": "Marathon", "icon": "clock", "how": "Give a talk of 15 minutes or more."},
    {"key": "brave", "name": "Brave Face", "icon": "heart", "how": "Feel at least 2 points calmer after a session than before it."},
    {"key": "streak7", "name": "Seven Days Strong", "icon": "flame", "how": "Practise seven days in a row."},
    {"key": "compelling", "name": "Compelling", "icon": "star", "how": "Reach a Stage Confidence of 78."},
    {"key": "spellbinding", "name": "Spellbinding", "icon": "crown", "how": "Reach a Stage Confidence of 90."},
    {"key": "gym", "name": "Gym Rat", "icon": "dumbbell", "how": "Try six different drills."},
    {"key": "hotseat", "name": "Quick on Your Feet", "icon": "hand", "how": "Answer questions in a Q&A."},
    {"key": "unshakeable", "name": "Unshakeable", "icon": "anchor", "how": "Keep talking through three distractions in one session."},
    {"key": "worldtour", "name": "World Tour", "icon": "globe", "how": "Speak in all seven venues."},
]

NERVES = ["", "Calm", "A little nervous", "Nervous", "Very nervous", "Terrified"]


def public():
    """What the browser needs, in one go."""
    return {"parts": PARTS, "bands": [{"min": b[0], "name": b[1], "line": b[2]} for b in BANDS],
            "venues": VENUES, "moods": MOODS, "prompters": PROMPTERS, "coach": COACH_LEVELS, "distractions": DISTRACTIONS,
            "templates": TEMPLATES, "occasions": OCCASIONS, "sample": SAMPLE_TALK, "drills": DRILLS, "topics": TOPICS,
            "questions": QUESTIONS, "handbook": HANDBOOK, "goals": GOALS,
            "levels": [{"xp": x, "name": n} for x, n in LEVELS], "badges": BADGES, "nerves": NERVES}


def venue(key):
    for v in VENUES:
        if v["key"] == key:
            return v
    return VENUES[0]


def drill(key):
    for d in DRILLS:
        if d["key"] == key:
            return d
    return None


def template(key):
    for t in TEMPLATES:
        if t["key"] == key:
            return t
    return None


def band(score):
    for lo, name, line in BANDS:
        if score >= lo:
            return {"name": name, "line": line}
    return {"name": BANDS[-1][1], "line": BANDS[-1][2]}


def level(xp):
    cur, nxt = LEVELS[0], None
    for i, (need, name) in enumerate(LEVELS):
        if xp >= need:
            cur = (need, name)
            nxt = LEVELS[i + 1] if i + 1 < len(LEVELS) else None
    return {"n": LEVELS.index(cur) + 1, "name": cur[1], "xp": xp, "from": cur[0],
            "to": nxt[0] if nxt else None, "next": nxt[1] if nxt else None}
