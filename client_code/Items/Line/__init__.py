from anvil import *

from ._anvil_designer import LineTemplate


class Line(LineTemplate):
    """One line of plain text in a list (Talks' cue card craft tips). item = the text."""

    def __init__(self, **properties):
        super().__init__(**properties)
        self.text.text = str(self.item)
