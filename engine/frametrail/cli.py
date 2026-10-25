"""frametrail fixtures | analyse [--no-detect]"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from . import log as events
from .errors import FrametrailError

ROOT = Path(__file__).resolve().parents[2]


def main(argv: list[str] | None = None, root: Path = ROOT) -> int:
    p = argparse.ArgumentParser(prog="frametrail")
    sub = p.add_subparsers(dest="cmd", required=True)
    sub.add_parser("fixtures", help="download the footage and build both evidence fixtures")
    a = sub.add_parser("analyse", help="run the case and write data/demo/derived/case.json")
    a.add_argument("--no-detect", action="store_true", help="skip person detection")
    p.add_argument(
        "--log-format",
        choices=["text", "json"],
        default="text",
        help="progress on stderr as text, or as one JSON object per line",
    )
    args = p.parse_args(argv)
    events.configure(args.log_format)
    try:
        if args.cmd == "fixtures":
            from .fixture.build import build

            print(json.dumps(build(root), indent=2))
        else:
            from .analyse import analyse

            case = analyse(root, run_detection=not args.no_detect)
            print(json.dumps(case["stats"], indent=2))
    except FrametrailError as e:
        # The input or the machine is wrong, not the code: say what to fix, no traceback.
        if args.log_format == "json":
            events.event(events.get("cli"), "stopped", 40, error=type(e).__name__, message=str(e))
        else:
            print(f"frametrail: error: {e}", file=sys.stderr)
        return 2
    return 0


if __name__ == "__main__":
    sys.exit(main())
