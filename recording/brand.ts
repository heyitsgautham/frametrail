import { existsSync } from "node:fs";
import path from "node:path";

// The names the takes show. They live in apps/web/.env.local, which git ignores, so the
// public repository carries only the neutral names in apps/web/src/lib/brand.ts. The env
// file is read before that module loads, so the takes and the app agree.
const env = path.join(import.meta.dirname, "../apps/web/.env.local");
// With the private names set, generated text goes to the ignored out/ folder, and the
// README's hero is not rewritten, so nothing tracked picks the names up.
export const PRIVATE_BUILD = existsSync(env);
if (PRIVATE_BUILD) process.loadEnvFile(env);
export const VOICEOVER = path.join(import.meta.dirname, PRIVATE_BUILD ? "out/voiceover.md" : "voiceover.md");

export const { BRAND, orgLine } = await import("../apps/web/src/lib/brand");

// How the reader says the product's name, when .env.local sets one. Empty otherwise.
export const PRODUCT_SAY = process.env.PRODUCT_SAY ?? "";
