"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { Actions } from "@/lib/useStore";
import { COLORS, Task, contains, deadlineLook, find, isTask, parentOf, planOf, shade, todayKey } from "@/lib/tasks";
import PlanChip from "./PlanChip";

type Edge = { from: string; to: string; color: string };
type Joint = { id: string; color: string; count: number; folded: boolean };
type Path = { d: string; color: string };
type Dot = Joint & { x: number; y: number };

type Ctx = {
  done: Set<string>;
  extras: Record<string, number>;
  actions: Actions;
  collapsed: Set<string>;
  adding: string | null;
  startAdd: (id: string) => void;
  stopAdd: () => void;
  edit: (id: string) => void;
  reg: (id: string) => (el: HTMLElement | null) => void;
  overId: string | null;
  dragStart: (id: string) => void;
  dragEnd: () => void;
  dropProps: (id: string) => React.HTMLAttributes<HTMLElement>;
};

const ROOT = "root";
const MIN_GAP = 28;
const MAX_GAP = 360;
const colorOf = (i: number) => `var(${COLORS[i % COLORS.length]})`;
export const href = (l: string) => (/^https?:\/\//i.test(l) ? l : "https://" + l);
export const shortDate = (d: string) =>
  new Date(d + "T00:00").toLocaleDateString(undefined, { month: "short", day: "numeric" });

// Every parent -> child link, plus a joint wherever a node has children.
function collect(tree: Task[], collapsed: Set<string>, adding: string | null) {
  const edges: Edge[] = [];
  const joints: Joint[] = [];
  // each edge takes the color of the node it leads to, shaded a little differently from its parent
  const walk = (n: Task, color: string, top: number) => {
    const folded = collapsed.has(n.id) && n.children.length > 0;
    if (n.children.length || adding === n.id) joints.push({ id: n.id, color, count: n.children.length, folded });
    if (folded) return;
    n.children.forEach((c, j) => {
      const cc = shade(color, top, j);
      edges.push({ from: n.id, to: c.id, color: cc });
      walk(c, cc, top);
    });
    if (adding === n.id) edges.push({ from: n.id, to: "add:" + n.id, color: shade(color, top, n.children.length) });
  };
  tree.forEach((n, i) => {
    edges.push({ from: ROOT, to: n.id, color: colorOf(i) });
    walk(n, colorOf(i), i);
  });
  if (tree.length || adding === ROOT) joints.push({ id: ROOT, color: "var(--muted)", count: tree.length, folded: false });
  if (adding === ROOT) edges.push({ from: ROOT, to: "add:" + ROOT, color: "var(--muted)" });
  return { edges, joints };
}

export default function TaskTree({ tree, done, actions }: { tree: Task[]; done: Set<string>; actions: Actions }) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [adding, setAdding] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const [paths, setPaths] = useState<Path[]>([]);
  const [dots, setDots] = useState<Dot[]>([]);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [extras, setExtras] = useState<Record<string, number>>({});
  const extrasRef = useRef<Record<string, number>>({});
  const [gap, setGap] = useState(56);
  const gapRef = useRef(56);
  const settle = useRef(0); // consecutive layout corrections; a safety stop against render loops
  const drawn = useRef("");
  const wrap = useRef<HTMLDivElement>(null);
  const refs = useRef(new Map<string, HTMLElement>());

  const { edges, joints } = useMemo(() => collect(tree, collapsed, adding), [tree, collapsed, adding]);

  const toggleCollapsed = (id: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (!next.delete(id)) next.add(id);
      return next;
    });

  // Measure node positions: pick the connector length that fills the width, align task checkboxes
  // into one column, then draw connectors and joints.
  useLayoutEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const measure = () => {
      const base = el.getBoundingClientRect();

      // Row widths don't depend on the gap or the alignment offsets, so the whole layout can be
      // computed directly: pick the largest gap that fits the width, then the per-task offsets
      // that line every checkbox up. This settles in a single extra render.
      const p = el.parentElement!;
      const cs = getComputedStyle(p);
      const avail = p.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight) - 8;
      const width = (id: string) => refs.current.get(id)?.offsetWidth ?? 0;
      const cbOffset = (id: string) => {
        const row = refs.current.get(id);
        const cb = row?.querySelector("input[type=checkbox]");
        return row && cb ? cb.getBoundingClientRect().left - row.getBoundingClientRect().left : 0;
      };

      const solve = (g: number) => {
        let right = 0;
        const taskLeft = new Map<string, number>(); // task id -> left edge without alignment offset
        const visit = (n: Task, depth: number, left: number) => {
          const w = width(n.id);
          if (isTask(n, depth)) {
            taskLeft.set(n.id, left);
            return;
          }
          right = Math.max(right, left + w);
          if (!collapsed.has(n.id)) n.children.forEach((c) => visit(c, depth + 1, left + w + g));
          if (adding === n.id) right = Math.max(right, left + w + g + width("add:" + n.id));
        };
        const rootW = width(ROOT);
        right = rootW;
        tree.forEach((n) => visit(n, 0, rootW + g));
        if (adding === ROOT) right = Math.max(right, rootW + g + width("add:" + ROOT));

        const col = Math.max(0, ...[...taskLeft].map(([id, left]) => left + cbOffset(id)));
        const offsets: Record<string, number> = {};
        taskLeft.forEach((left, id) => {
          const off = Math.round(col - cbOffset(id) - left);
          offsets[id] = off;
          const end = left + off + width(id);
          right = Math.max(right, end);
          if (adding === id) right = Math.max(right, end + g + width("add:" + id));
        });
        return { right, offsets };
      };

      let lo = MIN_GAP, hi = MAX_GAP;
      while (hi - lo > 1) {
        const mid = Math.floor((lo + hi) / 2);
        if (solve(mid).right <= avail) lo = mid;
        else hi = mid;
      }
      const bestGap = solve(hi).right <= avail ? hi : lo;
      const wanted = solve(bestGap).offsets;

      const sameExtras =
        Object.keys(wanted).length === Object.keys(extrasRef.current).length &&
        Object.entries(wanted).every(([id, v]) => extrasRef.current[id] === v);
      if ((bestGap !== gapRef.current || !sameExtras) && settle.current < 4) {
        settle.current++;
        gapRef.current = bestGap;
        extrasRef.current = wanted;
        setGap(bestGap);
        setExtras(wanted);
        return; // layout changed; the next pass draws the connectors
      }
      settle.current = 0;

      const nextPaths: Path[] = [];
      for (const e of edges) {
        const a = refs.current.get(e.from);
        const b = refs.current.get(e.to);
        if (!a || !b) continue;
        const ra = a.getBoundingClientRect();
        const rb = b.getBoundingClientRect();
        const x1 = ra.right - base.left, y1 = ra.bottom - base.top - 0.75;
        const x2 = rb.left - base.left, y2 = rb.bottom - base.top - 0.75;
        const mx = (x1 + x2) / 2;
        nextPaths.push({ d: `M${x1} ${y1} C${mx} ${y1} ${mx} ${y2} ${x2} ${y2}`, color: e.color });
      }
      const nextDots: Dot[] = [];
      for (const j of joints) {
        const r = refs.current.get(j.id)?.getBoundingClientRect();
        if (r) nextDots.push({ ...j, x: r.right - base.left, y: r.bottom - base.top - 0.75 });
      }
      const nextSize = { w: el.scrollWidth, h: el.scrollHeight };
      const sig = JSON.stringify([nextPaths, nextDots, nextSize]);
      if (sig === drawn.current) return; // nothing moved: skip the re-render
      drawn.current = sig;
      setPaths(nextPaths);
      setDots(nextDots);
      setSize(nextSize);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    if (el.parentElement) ro.observe(el.parentElement);
    return () => ro.disconnect();
  }, [edges, joints, collapsed, adding, extras, gap, tree, done]);

  // A drop is valid on any row except the dragged node, its own subtree, or its current parent.
  const canDrop = (target: string) => {
    if (!dragId || target === dragId) return false;
    const hit = find(tree, dragId);
    if (!hit) return false;
    const targetId = target === ROOT ? null : target;
    if (targetId && contains(hit.node, targetId)) return false;
    return (parentOf(tree, dragId)?.id ?? null) !== targetId;
  };

  const ctx: Ctx = {
    done,
    extras,
    actions,
    collapsed,
    adding,
    startAdd: (id) => {
      setCollapsed((prev) => {
        if (!prev.has(id)) return prev;
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      setAdding(id);
    },
    stopAdd: () => setAdding(null),
    edit: setEditing,
    reg: (id) => (el) => {
      if (el) refs.current.set(id, el);
      else refs.current.delete(id);
    },
    overId,
    dragStart: setDragId,
    dragEnd: () => {
      setDragId(null);
      setOverId(null);
    },
    dropProps: (id) => ({
      onDragOver: (e) => {
        if (!canDrop(id)) return;
        e.preventDefault();
        setOverId(id);
      },
      onDragLeave: () => setOverId((o) => (o === id ? null : o)),
      onDrop: (e) => {
        e.preventDefault();
        if (canDrop(id)) actions.move(dragId!, id === ROOT ? null : id);
        setDragId(null);
        setOverId(null);
      },
    }),
  };

  const editNode = editing ? find(tree, editing)?.node : undefined;

  return (
    <>
      <div className="hscroll">
        <div className="htree" ref={wrap} style={{ "--gap": gap + "px" } as React.CSSProperties}>
          <svg className="hlinks" width={size.w} height={size.h}>
            {paths.map((p, i) => (
              <path key={i} d={p.d} style={{ stroke: p.color }} />
            ))}
            {dots.map((d) => (
              <g
                key={d.id}
                className={d.id === ROOT ? "joint" : "joint click"}
                onClick={d.id === ROOT ? undefined : () => toggleCollapsed(d.id)}
              >
                <title>{d.id === ROOT ? "" : d.folded ? "Expand" : "Collapse"}</title>
                <circle
                  cx={d.x} cy={d.y} r={d.folded ? 10 : 6} strokeWidth="2"
                  style={{ fill: d.folded ? "var(--card)" : d.color, stroke: d.color }}
                />
                {d.folded && (
                  <text x={d.x} y={d.y + 4} textAnchor="middle" fontSize="11" style={{ fill: d.color }}>
                    {d.count}
                  </text>
                )}
              </g>
            ))}
          </svg>
          <div className="hnode">
            <div
              className={"hrow root" + (overId === ROOT ? " drop" : "")}
              ref={ctx.reg(ROOT)}
              title="Drop here to make a task top-level"
              {...ctx.dropProps(ROOT)}
            >
              <span className="rootdot" />
              <button className="icon" title="Add a top-level category" onClick={() => ctx.startAdd(ROOT)}>+</button>
            </div>
            {(tree.length > 0 || adding === ROOT) && (
              <div className="hchildren">
                {tree.map((n, i) => (
                  <Item key={n.id} n={n} depth={0} color={colorOf(i)} top={i} ctx={ctx} />
                ))}
                {adding === ROOT && <AddRow id={ROOT} color="var(--muted)" ctx={ctx} onAdd={actions.addTop} />}
              </div>
            )}
          </div>
        </div>
      </div>
      {editNode && (
        <EditPanel
          key={editNode.id}
          n={editNode}
          task={isTask(editNode, depthOf(tree, editNode.id))}
          actions={actions}
          onClose={() => setEditing(null)}
        />
      )}
    </>
  );
}

export function depthOf(tree: Task[], id: string, depth = 0): number {
  for (const n of tree) {
    if (n.id === id) return depth;
    const d = depthOf(n.children, id, depth + 1);
    if (d >= 0) return d;
  }
  return -1;
}

function Item({ n, depth, color, top, ctx }: { n: Task; depth: number; color: string; top: number; ctx: Ctx }) {
  const { done, actions, collapsed, adding, startAdd } = ctx;
  const task = isTask(n, depth);
  const checked = done.has(n.id);
  const plan = task ? planOf(n) : "daily";
  const dim = task && !checked && (plan === "backlog" || plan === "later"); // not part of today's plan
  const showKids = n.children.length > 0 && !collapsed.has(n.id);

  // Deadline heat: the closer the date, the warmer (amber -> red) the glow behind the row.
  const look = deadlineLook(n.deadline, checked);
  const hue = look?.hue ?? 0;
  const hot = !!look?.hot;
  const overdue = !!look?.overdue;
  const glow = look?.glow;
  const dueText = look?.text;

  return (
    <div className="hnode">
      <div
        className={
          `hrow${task ? " task" : " cat"}${depth === 0 ? " top" : ""}${task && checked ? " done" : ""}` +
          `${overdue ? " overdue" : ""}${dim ? " dim" : ""}${ctx.overId === n.id ? " drop" : ""}`
        }
        style={
          {
            borderBottomColor: color,
            marginLeft: task ? ctx.extras[n.id] ?? 0 : 0,
            backgroundImage: glow,
            "--tc": color,
          } as React.CSSProperties
        }
        ref={ctx.reg(n.id)}
        draggable
        onDragStart={(e) => {
          e.dataTransfer.setData("text/plain", n.id);
          e.dataTransfer.effectAllowed = "move";
          ctx.dragStart(n.id);
        }}
        onDragEnd={ctx.dragEnd}
        {...ctx.dropProps(n.id)}
      >
        <span className="hname" title="Click to edit, drag onto another row to move" onClick={() => ctx.edit(n.id)}>
          {n.name || "Untitled"}
        </span>
        {task && <input type="checkbox" checked={checked} onChange={() => actions.toggle(n.id)} />}
        <button
          className="icon"
          title={task ? "Add a sub-task (turns this into a category)" : "Add task or sub-category"}
          onClick={() => startAdd(n.id)}
        >
          +
        </button>
        {task && (
          <span className="stars" title="Difficulty">
            {[1, 2, 3].map((i) => (
              <button key={i} className={i <= n.stars ? "on" : ""} onClick={() => actions.patch(n.id, { stars: i })}>
                ★
              </button>
            ))}
          </span>
        )}
        {task && <PlanChip n={n} checked={checked} actions={actions} />}
        {n.deadline && (
          <span className="badge" style={hot ? { color: `hsl(${hue} 78% 40%)`, fontWeight: 600 } : undefined} title={dueText}>
            {shortDate(n.deadline)}
          </span>
        )}
        {look?.icon && (
          <span className={`fuse ${look.stage}`} style={{ fontSize: look.size }} title={look.text}>
            {look.icon}
          </span>
        )}
        {n.link && (
          <a className="badge" href={href(n.link)} target="_blank" rel="noreferrer" title={n.link}>
            🔗
          </a>
        )}
        <button className="icon del hdel" title="Delete" onClick={() => actions.remove(n.id)}>
          ×
        </button>
      </div>
      {(showKids || adding === n.id) && (
        <div className="hchildren">
          {showKids &&
            n.children.map((c, j) => <Item key={c.id} n={c} depth={depth + 1} color={shade(color, top, j)} top={top} ctx={ctx} />)}
          {adding === n.id && (
            <AddRow id={n.id} color={shade(color, top, n.children.length)} ctx={ctx} onAdd={(v) => actions.addChild(n.id, v)} />
          )}
        </div>
      )}
    </div>
  );
}

function AddRow({ id, color, ctx, onAdd }: { id: string; color: string; ctx: Ctx; onAdd: (v: string) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  const [v, setV] = useState("");
  useEffect(() => ref.current?.focus(), []);
  return (
    <div className="hnode">
      <div className="hrow addrow" style={{ borderBottomColor: color }} ref={ctx.reg("add:" + id)}>
        <input
          ref={ref}
          value={v}
          placeholder="Name, Enter to save"
          onChange={(e) => setV(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && v.trim()) {
              onAdd(v);
              ctx.stopAdd();
            }
            if (e.key === "Escape") ctx.stopAdd();
          }}
          onBlur={() => !v.trim() && ctx.stopAdd()}
        />
      </div>
    </div>
  );
}

// Side drawer; edits save as you type.
export function EditPanel({ n, task, actions, onClose }: { n: Task; task: boolean; actions: Actions; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const daily = n.daily !== false;

  return (
    <div className="backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <aside className="drawer">
        <div className="drawer-head">
          <h3>{task ? "Task" : "Category"}</h3>
          <button className="icon" title="Close" onClick={onClose}>×</button>
        </div>

        <label>
          Title
          <input autoFocus value={n.name} onChange={(e) => actions.patch(n.id, { name: e.target.value })} />
        </label>

        {task && (
          <label>
            Difficulty
            <span className="stars big">
              {[1, 2, 3].map((i) => (
                <button key={i} className={i <= n.stars ? "on" : ""} onClick={() => actions.patch(n.id, { stars: i })}>
                  ★
                </button>
              ))}
            </span>
          </label>
        )}

        {task && (
          <div className="field">
            Schedule
            <span className="seg wide">
              <button className={daily ? "on" : ""} onClick={() => actions.setDaily(n.id, true)}>Every day</button>
              <button className={!daily ? "on" : ""} onClick={() => actions.setDaily(n.id, false)}>Long-term / one-off</button>
            </span>
            <small className="hint">
              {daily
                ? "Counts toward your score every day and comes back unchecked."
                : "Stays in the backlog until you plan it for a day. Once planned, it counts until you finish it."}
            </small>
          </div>
        )}

        {task && !daily && (
          <label>
            Do on
            <span className="inline">
              <input type="date" value={n.planned ?? ""} onChange={(e) => actions.patch(n.id, { planned: e.target.value })} />
              <button className="link" onClick={() => actions.patch(n.id, { planned: todayKey() })}>Today</button>
              {n.planned && (
                <button className="link" onClick={() => actions.patch(n.id, { planned: "" })}>
                  Backlog
                </button>
              )}
            </span>
          </label>
        )}

        <label>
          Deadline
          <span className="inline">
            <input type="date" value={n.deadline ?? ""} onChange={(e) => actions.patch(n.id, { deadline: e.target.value })} />
            {n.deadline && (
              <button className="link" onClick={() => actions.patch(n.id, { deadline: "" })}>
                Clear
              </button>
            )}
          </span>
        </label>

        <label>
          Link
          <span className="inline">
            <input
              placeholder="https://…"
              value={n.link ?? ""}
              onChange={(e) => actions.patch(n.id, { link: e.target.value })}
            />
            {n.link && (
              <a className="link" href={href(n.link)} target="_blank" rel="noreferrer">
                Open
              </a>
            )}
          </span>
        </label>

        <label>
          Notes
          <textarea rows={6} value={n.notes ?? ""} onChange={(e) => actions.patch(n.id, { notes: e.target.value })} />
        </label>

        <div className="drawer-foot">
          <button
            className="danger"
            onClick={() => {
              actions.remove(n.id);
              onClose();
            }}
          >
            Delete {task ? "task" : "category"}
          </button>
          <button className="primary" onClick={onClose}>Done</button>
        </div>
      </aside>
    </div>
  );
}
