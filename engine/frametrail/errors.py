"""Errors an examiner can act on.

Anything raised as a FrametrailError means the input or the machine is wrong, not the code:
the CLI prints its message and exits 2 instead of showing a traceback. Each subclass also
inherits the built-in error it replaces, so callers that caught ValueError or RuntimeError
keep working.
"""

from __future__ import annotations


class FrametrailError(Exception):
    """Base class. The message says what is wrong and what to do about it."""


class CaseFileError(FrametrailError, ValueError):
    """A case file is missing, or a record in it is incomplete or malformed."""


class EvidenceFormatError(FrametrailError, ValueError):
    """The evidence bytes are not in the format the parser reads."""


class ToolError(FrametrailError, RuntimeError):
    """An external tool such as FFmpeg is missing or failed."""
