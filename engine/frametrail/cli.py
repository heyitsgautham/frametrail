"""frametrail fixtures | analyse [--no-detect]"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def main() -> None:
    p = argparse.ArgumentParser(prog="frametrail")
    sub = p.add_subparsers(dest="cmd", required=True)
    sub.add_parser("fixtures", help="download the footage and build both evidence fixtures")
    a = sub.add_parser("analyse", help="run the case and write data/demo/derived/case.json")
    a.add_argument("--no-detect", action="store_true", help="skip person detection")
    args = p.parse_args()
    if args.cmd == "fixtures":
        from .fixture.build import build

        print(json.dumps(build(ROOT), indent=2))
    else:
        from .analyse import analyse

        case = analyse(ROOT, run_detection=not args.no_detect)
        print(json.dumps(case["stats"], indent=2))


if __name__ == "__main__":
    main()
