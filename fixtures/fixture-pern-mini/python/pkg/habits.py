"""Habit tracking helpers for the Python add-on fixture (Task 8, gated)."""

import os

__all__ = ["Habit", "format_frequency"]

DEFAULT_FREQUENCY = os.environ["DEFAULT_FREQUENCY"]
DEBUG = os.getenv("DEBUG", "false")


class Habit:
    """A single tracked habit."""

    def __init__(self, title: str, frequency: str = DEFAULT_FREQUENCY) -> None:
        self.title = title
        self.frequency = frequency

    def describe(self) -> str:
        """Return a one-line description of this habit."""
        return f"{self.title} ({self.frequency})"


def format_frequency(frequency: str) -> str:
    """Capitalize a frequency string for display."""
    return frequency.capitalize()
