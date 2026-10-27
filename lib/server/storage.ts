import { promises as fs } from "node:fs";
import path from "node:path";

// All data lives in one JSON file on the machine running the app (override the folder with DATA_DIR).
const DIR = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(process.cwd(), "data");
const FILE = path.join(DIR, "state.json");
const BACKUPS = path.join(DIR, "backups");
const KEEP_BACKUPS = 14;

export type Stored = { rev: number; savedAt: string; state: unknown };

const parse = (raw: string): Stored => {
  const s = JSON.parse(raw);
  if (!s || typeof s.rev !== "number" || !s.state) throw new Error("bad file");
  return s;
};

// Reads the live file; if it is corrupt, falls back to the newest backup instead of losing everything.
export async function readStored(): Promise<Stored | null> {
  try {
    return parse(await fs.readFile(FILE, "utf8"));
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return null;
  }
  const names = (await fs.readdir(BACKUPS).catch(() => [] as string[])).filter((n) => n.endsWith(".json")).sort().reverse();
  for (const name of names) {
    try {
      return parse(await fs.readFile(path.join(BACKUPS, name), "utf8"));
    } catch {}
  }
  throw new Error("state file is unreadable and no backup could be restored");
}

// Copies the previous version once per day (so a backup is yesterday's final state) and prunes old ones.
async function backup() {
  const day = new Date().toISOString().slice(0, 10);
  const target = path.join(BACKUPS, `state-${day}.json`);
  try {
    await fs.access(target);
    return;
  } catch {}
  try {
    await fs.mkdir(BACKUPS, { recursive: true });
    await fs.copyFile(FILE, target);
    const all = (await fs.readdir(BACKUPS)).filter((n) => n.startsWith("state-")).sort();
    for (const old of all.slice(0, Math.max(0, all.length - KEEP_BACKUPS))) await fs.unlink(path.join(BACKUPS, old));
  } catch {}
}

export type SaveResult = { ok: true; rev: number } | { ok: false; rev: number; state: unknown };

// Writes are serialized so two requests can't interleave.
let chain: Promise<unknown> = Promise.resolve();

export function saveStored(state: unknown, baseRev: number | null): Promise<SaveResult> {
  const run = chain.then(() => doSave(state, baseRev));
  chain = run.catch(() => {});
  return run;
}

async function doSave(state: unknown, baseRev: number | null): Promise<SaveResult> {
  const cur = await readStored();
  // Optimistic concurrency: a client that last saw an older revision must not overwrite newer data.
  if (cur && baseRev !== cur.rev) return { ok: false, rev: cur.rev, state: cur.state };

  const next: Stored = { rev: (cur?.rev ?? 0) + 1, savedAt: new Date().toISOString(), state };
  await fs.mkdir(DIR, { recursive: true });
  if (cur) await backup();
  const tmp = FILE + ".tmp";
  await fs.writeFile(tmp, JSON.stringify(next));
  await fs.rename(tmp, FILE); // atomic: the file is never left half-written
  return { ok: true, rev: next.rev };
}
