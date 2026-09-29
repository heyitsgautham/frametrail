// Fails if a tracked file contains one of the names kept out of the public
// repository. The names come from apps/web/.env.local, which git ignores: every
// NEXT_PUBLIC_ value, plus PRIVATE_TERMS, separated by "|". With no .env.local
// there is nothing to check. Runs as `pnpm check:names` and in the pre-commit hook
// (`git config core.hooksPath .githooks` once per clone).
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ENV = resolve(ROOT, "apps/web/.env.local");

if (!existsSync(ENV)) {
  console.log("no apps/web/.env.local, nothing to check");
  process.exit(0);
}
process.loadEnvFile(ENV);
const terms = [
  ...Object.entries(process.env)
    .filter(([k]) => k.startsWith("NEXT_PUBLIC_"))
    .map(([, v]) => v),
  ...(process.env.PRIVATE_TERMS ?? "").split("|"),
]
  .map((t) => t?.trim().toLowerCase())
  .filter((t): t is string => !!t);

// Staged content in the hook, what git would add otherwise: tracked files plus untracked
// files that .gitignore does not exclude.
const staged = process.argv.includes("--staged");
const list = staged ? ["ls-files", "--cached"] : ["ls-files", "--cached", "--others", "--exclude-standard"];
const files = execFileSync("git", list, { cwd: ROOT, encoding: "utf8" })
  .split("\n")
  // ponytail: binary files are skipped; the README hero is captured from a neutral build instead.
  .filter((f) => f && !/\.(png|gif|jpe?g|woff2?|parquet|mp4|pdf|gz)$/.test(f));

const hits: string[] = [];
for (const f of new Set(files)) {
  const text = staged
    ? execFileSync("git", ["show", `:${f}`], { cwd: ROOT, encoding: "utf8", maxBuffer: 64 << 20 })
    : existsSync(resolve(ROOT, f))
      ? readFileSync(resolve(ROOT, f), "utf8")
      : "";
  const lower = text.toLowerCase();
  for (const t of terms) if (lower.includes(t) || f.toLowerCase().includes(t)) hits.push(`${f}: "${t}"`);
}
if (hits.length) {
  console.error(`private names in tracked files:\n  ${hits.join("\n  ")}`);
  process.exit(1);
}
console.log(`no private names in ${new Set(files).size} files`);
