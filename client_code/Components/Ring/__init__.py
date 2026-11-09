from anvil import *
from anvil.js import window

from ._anvil_designer import RingTemplate


class Ring(RingTemplate):
    """A score ring (0-100, or None = a dash) drawn by MB.ring in theme/assets/mb.js."""

    def __init__(self, **properties):
        self._score, self._size, self._label, self._ready = None, 140, "", False
        super().__init__(**properties)
        self._ready = True
        self._draw()

    def _draw(self):
        if self._ready:
            self.dom_nodes["box"].innerHTML = window.MB.ring(self._score, self._size or 140, self._label or "")

    @property
    def score(self):
        return self._score

    @score.setter
    def score(self, value):
        self._score = value
        self._draw()

    @property
    def size(self):
        return self._size

    @size.setter
    def size(self, value):
        self._size = int(value or 140)
        self._draw()

    @property
    def label(self):
        return self._label

    @label.setter
    def label(self, value):
        self._label = value or ""
        self._draw()
