import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

// Load .env from the working directory, not from the package folder.
// With a global install the package folder is read-only, so a .env there
// would never be the user's own.
export function loadEnv(dir = process.cwd()) {
  const PATH = join(dir, ".env");
  if (!existsSync(PATH)) return;
  for (const raw of readFileSync(PATH, "utf8").split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq < 1) continue;
    const name = line.slice(0, eq).trim();
    const value = line.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
    process.env[name] ??= value;
  }
}
