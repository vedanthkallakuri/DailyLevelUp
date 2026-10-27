"use client";

import { useMemo, useState } from "react";
import type { Actions } from "@/lib/useStore";
import { COLORS, FlatTask, deadlineLook, find, flattenTasks, planOf, todayKey } from "@/lib/tasks";
import PlanChip from "./PlanChip";
import { EditPanel, href, shortDate } from "./TaskTree";

type Row = FlatTask;
type Scope = "all" | "today" | "backlog";

// Counts toward today's score: daily tasks and tasks planned for today (or carried over), unless already finished earlier.
const inToday = (r: Row) =>
  ["daily", "today", "carried"].includes(planOf(r.n)) && !(r.n.daily === false && r.n.completedOn && r.n.completedOn < todayKey());
type Key = "done" | "name" | "category" | "stars" | "deadline" | "repeat";
type Sort = { key: Key; dir: 1 | -1 } | null;

const COLS: { key: Key; label: string }[] = [
  { key: "done", label: "" },
  { key: "name", label: "Task" },
  { key: "category", label: "Category" },
  { key: "stars", label: "Difficulty" },
  { key: "deadline", label: "Deadline" },
  { key: "repeat", label: "Repeats" },
];

const text = (a: string, b: string) => a.localeCompare(b, undefined, { sensitivity: "base", numeric: true });

function compare(a: Row, b: Row, { key, dir }: NonNullable<Sort>): number {
  if (key === "deadline") {
    // tasks without a deadline always sink to the bottom
    if (!a.n.deadline && !b.n.deadline) return text(a.n.name, b.n.name);
    if (!a.n.deadline) return 1;
    if (!b.n.deadline) return -1;
  }
  let r = 0;
  if (key === "done") r = Number(a.checked) - Number(b.checked);
  else if (key === "name") r = text(a.n.name, b.n.name);
  else if (key === "category") r = text(a.path.join(" › "), b.path.join(" › "));
  else if (key === "stars") r = a.n.stars - b.n.stars;
  else if (key === "deadline") r = text(a.n.deadline!, b.n.deadline!);
  else if (key === "repeat") r = Number(a.n.daily !== false) - Number(b.n.daily !== false);
  return r * dir || text(a.n.name, b.n.name);
}

// Flat spreadsheet-style list of every task; click a column header to sort.
export default function ListView({ tree, done, actions }: { tree: import("@/lib/tasks").Task[]; done: Set<string>; actions: Actions }) {
  const [sort, setSort] = useState<Sort>(null);
  const [query, setQuery] = useState("");
  const [hideDone, setHideDone] = useState(false);
  const [scope, setScope] = useState<Scope>("all");
  const [editing, setEditing] = useState<string | null>(null);

  const all = useMemo(() => flattenTasks(tree, done), [tree, done]);
  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = all.filter(
      (r) =>
        (!hideDone || !r.checked) &&
        (scope === "all" || (scope === "today") === inToday(r)) &&
        (!q || (r.n.name + " " + r.path.join(" ")).toLowerCase().includes(q)),
    );
    return sort ? [...list].sort((a, b) => compare(a, b, sort)) : list;
  }, [all, sort, query, hideDone, scope]);

  const clickHeader = (key: Key) =>
    setSort((s) => (s?.key === key ? (s.dir === 1 ? { key, dir: -1 } : null) : { key, dir: 1 }));

  const editNode = editing ? find(tree, editing)?.node : undefined;

  return (
    <>
      <div className="ltools">
        <input
          className="lsearch"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search tasks or categories…"
          aria-label="Search tasks"
        />
        <div className="seg" role="group" aria-label="Show">
          {(["all", "today", "backlog"] as Scope[]).map((s) => (
            <button key={s} className={scope === s ? "on" : ""} onClick={() => setScope(s)}>
              {s === "all" ? "All" : s === "today" ? "Today" : "Backlog"}
            </button>
          ))}
        </div>
        <label className="lhide">
          <input type="checkbox" checked={hideDone} onChange={(e) => setHideDone(e.target.checked)} />
          Hide completed
        </label>
        <span className="lcount">
          {rows.length === all.length ? `${all.length} tasks` : `${rows.length} of ${all.length} tasks`}
        </span>
      </div>

      <div className="lwrap">
        <div className="ltable" role="table">
          <div className="lrow lhead" role="row">
            {COLS.map((c) => {
              const active = sort?.key === c.key;
              return (
                <button
                  key={c.key}
                  role="columnheader"
                  aria-sort={active ? (sort!.dir === 1 ? "ascending" : "descending") : "none"}
                  className={"lh" + (active ? " on" : "") + (c.key === "done" ? " lcheck" : "")}
                  onClick={() => clickHeader(c.key)}
                  title={c.key === "done" ? "Sort by completed" : `Sort by ${c.label.toLowerCase()}`}
                >
                  {c.label || "✓"}
                  <span className="sortmark">{active ? (sort!.dir === 1 ? "▲" : "▼") : ""}</span>
                </button>
              );
            })}
            <span />
          </div>

          {rows.length === 0 && <div className="empty lempty">{all.length ? "No tasks match." : "No tasks yet. Add some in Tree or Table view."}</div>}

          {rows.map(({ n, path, top, checked }) => {
            const look = deadlineLook(n.deadline, checked);
            const color = `var(${COLORS[top % COLORS.length]})`;
            return (
              <div
                key={n.id}
                role="row"
                className={
                  "lrow" + (checked ? " done" : "") + (look?.overdue ? " overdue" : "") +
                  (!checked && !inToday({ n, path, top, checked }) ? " dim" : "")
                }
                style={{ "--tc": color, backgroundImage: look?.glow } as React.CSSProperties}
              >
                <span className="lcheck">
                  <input type="checkbox" checked={checked} onChange={() => actions.toggle(n.id)} />
                </span>
                <span className="lname">
                  <span className="tname" title="Click to edit" onClick={() => setEditing(n.id)}>
                    {n.name || "Untitled"}
                  </span>
                  {n.link && (
                    <a href={href(n.link)} target="_blank" rel="noreferrer" title={n.link}>
                      🔗
                    </a>
                  )}
                  <PlanChip n={n} checked={checked} actions={actions} />
                </span>
                <span className="lcat" title={path.join(" › ")}>
                  <i className="cdot" style={{ background: color }} />
                  {path.join(" › ")}
                </span>
                <span className="stars" title="Difficulty">
                  {[1, 2, 3].map((i) => (
                    <button key={i} className={i <= n.stars ? "on" : ""} onClick={() => actions.patch(n.id, { stars: i })}>
                      ★
                    </button>
                  ))}
                </span>
                <span className="ldue" title={look?.text} style={look?.hot ? { color: `hsl(${look.hue} 78% 40%)`, fontWeight: 600 } : undefined}>
                  {n.deadline ? shortDate(n.deadline) : <span className="dash">–</span>}
                  {look?.icon && (
                    <span className={`fuse ${look.stage}`} style={{ fontSize: look.size }}>
                      {look.icon}
                    </span>
                  )}
                </span>
                <span className="lrep">{n.daily === false ? "Long-term" : "Daily"}</span>
                <button className="icon del hdel" title="Delete" onClick={() => actions.remove(n.id)}>
                  ×
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {editNode && <EditPanel key={editNode.id} n={editNode} task actions={actions} onClose={() => setEditing(null)} />}
    </>
  );
}
