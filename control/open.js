// Open the Control Center database (FC_DB or control/data/factory.db); a new, empty database is seeded with the logic dataset.
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { Store } from "./store.js";
import { seed } from "./seed.js";

export const DEFAULT_DB = fileURLToPath(new URL("./data/factory.db", import.meta.url));
export async function openStore(file = process.env.FC_DB || DEFAULT_DB, { autoSeed = true } = {}) {
  if (file !== ":memory:") mkdirSync(dirname(file), { recursive: true });
  const s = await Store.open(file);
  if (autoSeed && s.stats().records === 0 && s.revision === 0) seed(s);
  return s;
}
