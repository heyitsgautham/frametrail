# Security

## Reporting a problem

Email heyitsgautham@gmail.com with what you found, the commit or release it applies to, and the steps to reproduce it.
Please do not open a public issue for a vulnerability until it is fixed.

Only the latest release and `main` get fixes.

## What FrameTrail protects

FrameTrail handles seized evidence, so the security that matters most is that the evidence and the analysis cannot change without it showing.

| Risk | What the code does | Where |
|---|---|---|
| The analysis alters the evidence | Sources are hashed with MD5 and SHA-256, made read-only, read, then hashed again, and the case records whether both digests still match | `engine/frametrail/intake.py`, `analyse.py` |
| Someone edits the custody log afterwards | Each event's SHA-256 covers the previous hash, and the Custody screen recomputes every hash in the browser | `engine/frametrail/custody.py`, `apps/web/src/components/custody/custody.tsx` |
| A damaged or hostile evidence file crashes or stalls the parser | A damaged master sector or index falls back to its backup copy, block walks stop at the end of the image, and anything left unreadable raises `EvidenceFormatError`, which the CLI prints before exiting 2 | `engine/frametrail/dvr.py`, `carve.py`, `dhav.py`, `errors.py` |
| A wrong `case.json` reaches the screens | The workbench checks it against a zod schema on every read and shows the failing fields instead of the screens | `apps/web/src/lib/case-schema.ts` |
| A clip request reads outside the clips folder | The route resolves the path and answers 404 for anything outside `data/local/clips` or anything that is not a regular file | `apps/web/src/app/clips/[...path]/route.ts` |
| The workbench talks to the internet | A content security policy allows only the app's own origin, and the browser checks fail on any request elsewhere | `apps/web/next.config.ts`, `apps/web/e2e/routes.test.ts` |

The workbench has no login.
It is meant to run on the examiner's own machine, on localhost or a closed lab network, and should not be exposed to the internet.

## Checks on every push

CI runs `pip-audit` over the engine's locked dependencies, `pnpm audit --audit-level=high` over the web app's, and gitleaks over the full git history.
Dependabot proposes updates to npm, uv and GitHub Actions dependencies every week.
