"""Page addresses: #name/arg1/arg2 -> a page Form (open_form), with sign-in rules.

Links in templates are plain <a href="#home">; code calls router.go("item", id).

    PAGES[name] = (who may open it, browser-tab title)   who: None = anyone, "guest" = signed out only, "user", "admin"
    NAV = the main menu (header + phone tab bar, signed-in people): (page, label, icon). At most 4.
New page: add it to PAGES, to _form() and (if it belongs in the menu) to NAV.
"""
import anvil
import anvil.js
from anvil.js import window

from . import state

PAGES = {
    "landing": (None, "Practise speeches in VR"),
    "auth": ("guest", "Sign in"),
    "home": ("user", "Backstage"),
    "talks": ("user", "Talks"),
    "drills": (None, "Drills"),
    "progress": ("user", "Progress"),
    "stage": (None, "On stage"),       # talk ids need an account: Pages/Stage sends guests to sign in itself
    "report": (None, "Report"),        # report/guest is the guest preview (this tab only); others need an account
    "profile": ("user", "Your profile"),
    "admin": ("admin", "Admin"),
}
NAV = [("home", "Backstage", "home"), ("talks", "Talks", "cards"), ("drills", "Drills", "dumbbell"), ("progress", "Progress", "trend")]
APP_NAME = "MrBigStage"
_r: dict = {"after": "", "listening": False}


def _form(name):
    """The page's Form class (imported when first needed, so start-up stays quick)."""
    if name == "landing":
        from .Pages.Landing import Landing
        return Landing
    if name == "auth":
        from .Pages.Auth import Auth
        return Auth
    if name == "home":
        from .Pages.Home import Home
        return Home
    if name == "talks":
        from .Pages.Talks import Talks
        return Talks
    if name == "drills":
        from .Pages.Drills import Drills
        return Drills
    if name == "progress":
        from .Pages.Progress import Progress
        return Progress
    if name == "stage":
        from .Pages.Stage import Stage
        return Stage
    if name == "report":
        from .Pages.Report import Report
        return Report
    if name == "profile":
        from .Pages.Profile import Profile
        return Profile
    from .Pages.Admin import Admin
    return Admin


def parse(hash_text):
    h = (hash_text or "").lstrip("#").lstrip("!").lstrip("/").split("?")[0]
    parts = [window.decodeURIComponent(p) for p in h.split("/") if p]
    return (parts[0] if parts else ""), parts[1:]


def href(name, *args):
    """'#name/arg1/arg2' with every part URL-encoded (row ids contain brackets and commas)."""
    return "#" + "/".join([name] + [window.encodeURIComponent(str(a)) for a in args if a not in (None, "")])


def home_page():
    return "home" if state.me() else "landing"


def needs_account(name, args):
    """A talk on stage (#stage/<talk id>) and a saved report (#report/<id>) are private; the sample, free talks,
    drills (#stage/drill:<key>) and the guest's preview report (#report/guest) are open to everyone."""
    ref = args[0] if args else ""
    if name == "stage":
        return bool(ref) and ref not in ("sample", "free") and not ref.startswith("drill:")
    if name == "report":
        return bool(ref) and ref != "guest"
    return False


def show():
    """Open the page for the current address."""
    name, args = parse(window.location.hash)
    if name not in PAGES:
        name, args = home_page(), []
    who = PAGES[name][0]
    if who == "guest" and state.me():
        name, args = "home", []
    elif (who in ("user", "admin") or needs_account(name, args)) and not state.me():
        _r["after"] = window.location.hash
        name, args = "auth", []
    elif who == "admin" and not state.is_admin():
        state.toast("That page is for admins only.", "error")
        name, args = "home", []
    window.document.title = PAGES[name][1] + " · " + APP_NAME
    window.UI_READY = False
    page = _form(name)(args=args)
    anvil.open_form(page)
    shell = getattr(page, "layout", None)
    if shell is not None and hasattr(shell, "refresh"):
        shell.refresh(name)  # Anvil reuses the layout between pages: tell it who is signed in and which page is open
    window.scrollTo(0, 0)
    window.UI_READY = True  # tests and screenshots wait for this


def go(name, *args):
    """Go to a page. Same address again = reload the page."""
    target = href(name, *args)
    if window.location.hash == target:
        show()
    else:
        window.location.hash = target


def replace(name, *args):
    """Change the address without opening anything (a page that switches its own view)."""
    window.history.replaceState(None, "", href(name, *args))


def after_sign_in():
    """Where to go once someone signs in: the page they were heading for, or home."""
    target = _r["after"]
    _r["after"] = ""
    if target and target != window.location.hash:
        window.location.hash = target
    else:
        go("home")


def remember_after(target):
    _r["after"] = target


def _on_hash(event):
    show()


def start():
    if not _r["listening"]:
        window.addEventListener("hashchange", anvil.js.report_exceptions(_on_hash))
        _r["listening"] = True
    show()
