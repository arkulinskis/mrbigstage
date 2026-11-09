from anvil import *

from ._anvil_designer import NumberTileTemplate

class NumberTile(NumberTileTemplate):
    """Report → The numbers: one measurement. item = {value, label}."""

    def __init__(self, **properties):
        super().__init__(**properties)
        self.value.text = str(self.item["value"])
