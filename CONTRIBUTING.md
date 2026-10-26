# Contributing

## Set up

Follow the install steps in the [README](README.md), then turn on the pre-commit hook once per clone.

```sh
git config core.hooksPath .githooks
```

The hook runs `scripts/private-names.ts --staged`.
It blocks a commit that would add any display name you keep in `apps/web/.env.local` to a tracked file.

## Before you commit

Run the same checks CI runs.

```sh
pnpm engine:lint   # ruff check and ruff format --check
pnpm engine:typecheck   # mypy over the engine
pnpm engine:test   # engine tests, fails under 90 percent coverage
pnpm check         # private names, typecheck, Biome lint and format check
pnpm test:unit     # web screen and helper tests, fails under 95 percent line coverage
pnpm test:recording   # the demo recorder's in-page overlay
pnpm build         # production build of the workbench
```

`pnpm verify` runs the same steps in a fresh clone of HEAD, which catches a file you forgot to commit.

If you changed a screen, start the build with `pnpm start` and run `pnpm test:e2e` against it.

`uv run --project engine ruff format engine` fixes Python formatting.
`pnpm format` fixes TypeScript formatting with Biome.

## Tests

A change to the engine lands with the test that proves it, in the same commit.
Engine tests live in `engine/tests/` and run on the synthetic case from `engine/frametrail/fixture/synthetic.py`, so they need no download.
Add to the synthetic case when a test needs evidence it does not plant yet, and keep it small enough to build in a few seconds.
Tests that need the real CAVIAR footage go in `engine/tests/test_caviar.py`, which skips them until `pnpm engine:fixtures` has run.

A helper in `apps/web/src/lib/` or a screen in `apps/web/src/components/` gets a vitest file next to it, named `<module>.test.ts` or `<module>.test.tsx`.
Screen tests render with Testing Library against the demo case from `apps/web/test/demo.ts`.
A change to a screen gets a check in `apps/web/e2e/routes.test.ts`.

The engine opens evidence read-only and hashes it before and after.
Keep it that way, and never write into a file under `data/local/fixtures/`.

## Commits

One change per commit, with a message in the form `type(scope): subject`.

```
fix(dvr): reject a segment header whose end precedes its start
```

The type is one of `feat`, `fix`, `docs`, `build`, `test`, `refactor`, `style`, `perf`, `ci`, `chore` or `revert`.
The scope names the area, such as `engine`, `web`, `fixture` or `repo`.
The subject is imperative and lowercase, with no trailing period.

Never commit `.env.local`, footage, built fixtures or anything else under `data/local/`.

## Docs

Markdown in this repository puts one sentence on each line.
Keep the README commands in step with `package.json`, and run every command you document.
