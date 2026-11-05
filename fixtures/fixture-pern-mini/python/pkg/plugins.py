"""Demonstrates a dynamic __all__ the Python helper cannot evaluate statically."""

import os

_extra = ["extra_helper"] if os.getenv("ENABLE_EXTRAS") else []
__all__ = ["core_helper"] + _extra


def core_helper() -> str:
    """Always available."""
    return "core"


def extra_helper() -> str:
    """Only listed in __all__ when ENABLE_EXTRAS is set."""
    return "extra"
