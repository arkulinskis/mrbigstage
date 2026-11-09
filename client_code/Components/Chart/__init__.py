from anvil import *

from ._anvil_designer import ChartTemplate


class Chart(ChartTemplate):
    """A box for markup the JavaScript engines draw (mb.js / mb-charts.js: MB.timeline, MB.bars, MB.spark,
    MB.trendChart, MB.heroArt ...). Pages set `content` to what the engine returned."""

    def __init__(self, **properties):
        self._content, self._ready = "", False
        super().__init__(**properties)
        self._ready = True
        self._draw()

    def _draw(self):
        if self._ready:
            self.dom_nodes["box"].innerHTML = self._content or ""

    @property
    def content(self):
        return self._content

    @content.setter
    def content(self, value):
        self._content = "" if value is None else str(value)
        self._draw()

    def node(self):
        """The drawn box (for engines that add behaviour, such as the report's recording player)."""
        return self.dom_nodes["box"]
