export type Task = {
  id: string;
  name: string;
  stars: number; // difficulty, 1-3
  children: Task[];
  link?: string;
  deadline?: string; // YYYY-MM-DD
  notes?: string;
  daily?: boolean; // undefined/true: resets every day. false: long-term / one-off, stays done once checked
  completedOn?: string; // one-off tasks: the day they were checked off
  planned?: string; // one-off tasks: the day you plan to do it. Unfinished ones carry over to later days
};

export type DayItem = { id: string; name: string; path: string; stars: number; bonus?: boolean };

export type DayLog = {
  done: string[]; // task ids checked off that day
  pct?: number;
  total?: number; // number of tasks that counted toward that day
  bonus?: number; // tasks finished that weren't part of the day's plan
  daily?: { done: number; total: number }; // how many of that day's daily tasks were completed
  items?: DayItem[]; // snapshot of what was completed, so history survives edits and deletes
  cats?: { id: string; name: string; pct: number }[]; // per top-level category completion
};

// Tasks completed on a day. `done` can still hold ids of since-deleted tasks (kept so Undo can
// restore them), so counts come from the snapshot of tasks that actually existed.
export const doneCount = (e?: DayLog) => e?.items?.length ?? e?.done.length ?? 0;

export type State = {
  tree: Task[];
  log: Record<string, DayLog>; // keyed by YYYY-MM-DD
};

export type Stats = { total: number; got: number; pct: number };

export const COLORS = ["--c0", "--c1", "--c2", "--c3", "--c4", "--c5"];

// Sub-branches get a slightly different color from their parent: the parent's color is nudged toward
// a neighbouring palette color that differs per sibling, so levels and siblings are distinguishable.
export function shade(parent: string, top: number, sibling: number): string {
  let k = (top + 1 + sibling) % COLORS.length;
  if (k === top % COLORS.length) k = (k + 1) % COLORS.length;
  return `color-mix(in srgb, ${parent} 74%, var(${COLORS[k]}))`;
}

export const uid = () => Math.random().toString(36).slice(2, 10);

export const dayKey = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export const todayKey = () => dayKey(new Date());

export const makeTask = (name: string, children: Task[] = [], stars = 1): Task => ({
  id: uid(),
  name,
  stars,
  children,
});

// Top-level nodes are always categories; deeper nodes are tasks when they have no children.
export const isTask = (n: Task, depth: number) => depth > 0 && n.children.length === 0;

const mk = (total: number, got: number): Stats => ({ total, got, pct: total ? got / total : 0 });

// Progress is difficulty-weighted: a 3-star task counts 3x a 1-star task.
// `hidden` holds one-off tasks finished on an earlier day; they no longer count.
export function stats(n: Task | Task[], done: Set<string>, hidden?: Set<string>): Stats {
  if (Array.isArray(n)) return combine(n.map((c) => stats(c, done, hidden)));
  if (!n.children.length) {
    if (hidden?.has(n.id)) return mk(0, 0);
    return mk(n.stars, done.has(n.id) ? n.stars : 0);
  }
  return combine(n.children.map((c) => stats(c, done, hidden)));
}

function combine(list: Stats[]): Stats {
  return mk(
    list.reduce((a, s) => a + s.total, 0),
    list.reduce((a, s) => a + s.got, 0),
  );
}

export function find(list: Task[], id: string): { node: Task; list: Task[] } | null {
  for (const node of list) {
    if (node.id === id) return { node, list };
    const r = find(node.children, id);
    if (r) return r;
  }
  return null;
}

// Parent of a node; null for top-level nodes (and for unknown ids).
export function parentOf(list: Task[], id: string, parent: Task | null = null): Task | null {
  for (const n of list) {
    if (n.id === id) return parent;
    const r = parentOf(n.children, id, n);
    if (r) return r;
  }
  return null;
}

export const contains = (n: Task, id: string): boolean =>
  n.id === id || n.children.some((c) => contains(c, id));

export type Plan = "daily" | "today" | "carried" | "later" | "backlog";

// Where a task stands: daily tasks always count; one-offs count only once planned (and stay counted,
// as "carried over", until finished); everything else is backlog.
export function planOf(n: Task): Plan {
  if (n.daily !== false) return "daily";
  if (!n.planned) return "backlog";
  const k = todayKey();
  return n.planned === k ? "today" : n.planned < k ? "carried" : "later";
}

// Today's checked set (for display), the tasks that don't count toward today's percentage
// (backlog, planned for later, or already finished on an earlier day), and the bonus count:
// uncounted tasks you finished today anyway.
export function todaySets(s: State) {
  const k = todayKey();
  const own = new Set(s.log[k]?.done ?? []);
  const done = new Set(own);
  const hidden = new Set<string>();
  let bonus = 0;
  const walk = (n: Task, depth: number) => {
    if (!isTask(n, depth)) return n.children.forEach((c) => walk(c, depth + 1));
    if (n.daily !== false) return;
    if (n.completedOn && n.completedOn < k) {
      done.add(n.id);
      hidden.add(n.id);
      return;
    }
    if (!n.planned || n.planned > k) {
      hidden.add(n.id);
      if (own.has(n.id)) bonus++;
    }
  };
  s.tree.forEach((n) => walk(n, 0));
  return { done, hidden, bonus };
}

export type FlatTask = { n: Task; path: string[]; top: number; checked: boolean };

// Every task as a flat row, remembering the category path above it.
export function flattenTasks(tree: Task[], done: Set<string>): FlatTask[] {
  const out: FlatTask[] = [];
  const walk = (n: Task, depth: number, path: string[], top: number) => {
    if (isTask(n, depth)) return void out.push({ n, path, top, checked: done.has(n.id) });
    n.children.forEach((c) => walk(c, depth + 1, [...path, n.name], top));
  };
  tree.forEach((n, i) => walk(n, 0, [], i));
  return out;
}

// True when there are unfinished long-term tasks, i.e. there's something to plan.
export const needsPlanning = (tree: Task[]) =>
  flattenTasks(tree, new Set()).some(({ n }) => n.daily === false && !n.completedOn);

// Snapshot of today for the log: percentage, counted tasks, what was completed, per-category pct.
export function snapshotToday(s: State): DayLog {
  const k = todayKey();
  const own = s.log[k]?.done ?? [];
  const { done, hidden } = todaySets(s);
  const items: DayItem[] = [];
  let total = 0;
  let dailyTotal = 0;
  let dailyDone = 0;
  const walk = (n: Task, depth: number, path: string[]) => {
    if (!isTask(n, depth)) return n.children.forEach((c) => walk(c, depth + 1, [...path, n.name]));
    const counted = !hidden.has(n.id);
    if (counted) total++;
    if (n.daily !== false) {
      dailyTotal++;
      if (own.includes(n.id)) dailyDone++;
    }
    if (own.includes(n.id)) items.push({ id: n.id, name: n.name, path: path.join(" › "), stars: n.stars, bonus: counted ? undefined : true });
  };
  s.tree.forEach((n) => walk(n, 0, []));
  return {
    done: own,
    pct: stats(s.tree, done, hidden).pct,
    total,
    bonus: items.filter((i) => i.bonus).length,
    daily: { done: dailyDone, total: dailyTotal },
    items,
    cats: s.tree.map((n) => ({ id: n.id, name: n.name, pct: stats(n, done, hidden).pct })),
  };
}

// 0 (calm) .. 1 (due now or overdue): how hot a deadline should look.
export function heatOf(deadline: string) {
  const ms = new Date(deadline + "T00:00").getTime() - new Date(todayKey() + "T00:00").getTime();
  const daysLeft = Math.round(ms / 864e5);
  const t = daysLeft <= 0 ? 1 : Math.pow(Math.max(0, Math.min(1, (10 - daysLeft) / 10)), 1.4);
  return { t, daysLeft };
}

// How a task with a deadline should look: glow gradient, badge hue, and tooltip text.
export function deadlineLook(deadline: string | undefined, checked: boolean) {
  if (!deadline || checked) return null;
  const { t, daysLeft } = heatOf(deadline);
  const hue = Math.round(46 - 46 * t); // amber -> red
  const hot = t > 0;
  const text =
    daysLeft < 0 ? `Overdue by ${-daysLeft} day${daysLeft === -1 ? "" : "s"}`
      : daysLeft === 0 ? "Due today" : `Due in ${daysLeft} day${daysLeft === 1 ? "" : "s"}`;
  // The mood escalates as the date closes in: hourglass -> flame -> big flame -> lit firecracker -> boom.
  const stage = daysLeft < 0 ? "boom" : daysLeft === 0 ? "bomb" : daysLeft <= 2 ? "fire" : daysLeft <= 5 ? "warm" : daysLeft <= 10 ? "far" : "none";
  const icon = { boom: "💥", bomb: "🧨", fire: "🔥", warm: "🔥", far: "⏳", none: "" }[stage];
  return {
    hue,
    hot,
    overdue: daysLeft < 0,
    text,
    stage,
    icon,
    size: Math.round(14 + 14 * t), // the emoji grows as the deadline nears
    glow: hot ? `linear-gradient(90deg, hsla(${hue} 95% 55% / ${0.14 + 0.5 * t}), hsla(${hue} 95% 55% / 0))` : undefined,
  };
}

export const seed = (): State => ({
  log: {},
  tree: [
    makeTask("Health", [makeTask("Gym"), makeTask("Diet"), makeTask("Tennis")]),
    makeTask("Work", [
      makeTask("PhD", [makeTask("Email prof"), makeTask("SOP")]),
      makeTask("Job App", [makeTask("Apply to 10 jobs", [], 2), makeTask("Leetcode", [], 2)]),
    ]),
    makeTask("Music", [makeTask("Singing"), makeTask("Bansuri", [makeTask("Practice 15 min")])]),
  ],
});
