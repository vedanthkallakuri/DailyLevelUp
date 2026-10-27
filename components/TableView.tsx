"use client";

import { useEffect, useRef, useState } from "react";
import type { Actions } from "@/lib/useStore";
import { COLORS, Task, contains, deadlineLook, find, isTask, parentOf, planOf, shade, stats } from "@/lib/tasks";
import PlanChip from "./PlanChip";
import { EditPanel, depthOf, href, shortDate } from "./TaskTree";

type Ctx = {
  done: Set<string>;
  hidden: Set<string>;
  actions: Actions;
  collapsed: Set<string>;
  toggleCollapsed: (id: string) => void;
  adding: string | null;
  setAdding: (id: string | null) => void;
  edit: (id: string) => void;
  overId: string | null;
  dragStart: (id: string) => void;
  dragEnd: () => void;
  dropProps: (id: string) => React.HTMLAttributes<HTMLElement>;
};

const TOP = "top-level";
const colorOf = (i: number) => `var(${COLORS[i % COLORS.length]})`;

// Counts the tasks under a node (unweighted) for the "3/5" label.
function count(n: Task, done: Set<string>, hidden: Set<string>): { got: number; total: number } {
  if (!n.children.length) return hidden.has(n.id) ? { got: 0, total: 0 } : { got: done.has(n.id) ? 1 : 0, total: 1 };
  return n.children.reduce(
    (a, c) => {
      const r = count(c, done, hidden);
      return { got: a.got + r.got, total: a.total + r.total };
    },
    { got: 0, total: 0 },
  );
}

// Clean outline view of the same hierarchy: indented rows with aligned due / difficulty columns.
export default function TableView({
  tree,
  done,
  hidden,
  actions,
}: {
  tree: Task[];
  done: Set<string>;
  hidden: Set<string>;
  actions: Actions;
}) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [adding, setAdding] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const [newCat, setNewCat] = useState("");

  // A drop is valid on any row except the dragged node, its own subtree, or its current parent.
  const canDrop = (target: string) => {
    if (!dragId || target === dragId) return false;
    const hit = find(tree, dragId);
    if (!hit) return false;
    const targetId = target === TOP ? null : target;
    if (targetId && contains(hit.node, targetId)) return false;
    return (parentOf(tree, dragId)?.id ?? null) !== targetId;
  };

  const ctx: Ctx = {
    done,
    hidden,
    actions,
    collapsed,
    toggleCollapsed: (id) =>
      setCollapsed((prev) => {
        const next = new Set(prev);
        if (!next.delete(id)) next.add(id);
        return next;
      }),
    adding,
    setAdding,
    edit: setEditing,
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
        if (canDrop(id)) actions.move(dragId!, id === TOP ? null : id);
        setDragId(null);
        setOverId(null);
      },
    }),
  };

  const editNode = editing ? find(tree, editing)?.node : undefined;

  return (
    <>
      <div className="tview">
        <div className="thead">
          <span className="tfill">Task</span>
          <span className="tmeta">
            <span className="tdue">Due</span>
            <span className="tlink" />
            <span className="tstars">Difficulty</span>
          </span>
          <span className="tact" />
        </div>

        {tree.length === 0 && <div className="empty">No categories yet. Add one below.</div>}
        {tree.map((n, i) => (
          <Row key={n.id} n={n} depth={0} color={colorOf(i)} top={i} ctx={ctx} />
        ))}

        {dragId && (
          <div className={"tdroproot" + (overId === TOP ? " drop" : "")} {...ctx.dropProps(TOP)}>
            Drop here to move to the top level
          </div>
        )}

        <form
          className="taddtop"
          onSubmit={(e) => {
            e.preventDefault();
            actions.addTop(newCat);
            setNewCat("");
          }}
        >
          <input value={newCat} onChange={(e) => setNewCat(e.target.value)} placeholder="New category…" />
          <button disabled={!newCat.trim()}>Add</button>
        </form>
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

function Row({ n, depth, color, top, ctx }: { n: Task; depth: number; color: string; top: number; ctx: Ctx }) {
  const { done, hidden, actions, collapsed, adding } = ctx;
  const task = isTask(n, depth);
  const checked = done.has(n.id);
  const plan = task ? planOf(n) : "daily";
  const dim = task && !checked && (plan === "backlog" || plan === "later"); // not part of today's plan
  const open = !collapsed.has(n.id);
  const look = deadlineLook(n.deadline, checked);
  const c = task ? null : count(n, done, hidden);
  const pct = task ? 0 : stats(n, done, hidden).pct;

  return (
    <div className="tnode">
      <div
        className={
          `trow${task ? " task" : " cat"}${depth === 0 ? " top" : ""}${task && checked ? " done" : ""}` +
          `${look?.overdue ? " overdue" : ""}${dim ? " dim" : ""}${ctx.overId === n.id ? " drop" : ""}`
        }
        style={{ "--tc": color, backgroundImage: look?.glow } as React.CSSProperties}
        draggable
        onDragStart={(e) => {
          e.dataTransfer.setData("text/plain", n.id);
          e.dataTransfer.effectAllowed = "move";
          ctx.dragStart(n.id);
        }}
        onDragEnd={ctx.dragEnd}
        {...ctx.dropProps(n.id)}
      >
        <span className="tfill">
          {task ? (
            <input type="checkbox" checked={checked} onChange={() => actions.toggle(n.id)} />
          ) : (
            <button
              className="tcaret"
              aria-label={open ? "Collapse" : "Expand"}
              onClick={() => ctx.toggleCollapsed(n.id)}
              style={{ visibility: n.children.length ? "visible" : "hidden" }}
            >
              {open ? "▾" : "▸"}
            </button>
          )}
          <span className="tname" title="Click to edit, drag onto another row to move" onClick={() => ctx.edit(n.id)}>
            {n.name || "Untitled"}
          </span>
          {task && <PlanChip n={n} checked={checked} actions={actions} />}
        </span>

        <span className="tmeta">
          {task ? (
            <>
              <span
                className="tdue"
                title={look?.text}
                style={look?.hot ? { color: `hsl(${look.hue} 78% 40%)`, fontWeight: 600 } : undefined}
              >
                {n.deadline ? shortDate(n.deadline) : ""}
                {look?.icon && (
                  <span className={`fuse ${look.stage}`} style={{ fontSize: look.size }}>
                    {look.icon}
                  </span>
                )}
              </span>
              <span className="tlink">
                {n.link && (
                  <a href={href(n.link)} target="_blank" rel="noreferrer" title={n.link}>
                    🔗
                  </a>
                )}
              </span>
              <span className="stars tstars" title="Difficulty">
                {[1, 2, 3].map((i) => (
                  <button key={i} className={i <= n.stars ? "on" : ""} onClick={() => actions.patch(n.id, { stars: i })}>
                    ★
                  </button>
                ))}
              </span>
            </>
          ) : (
            c && (
              <span className="tprog" title={`${Math.round(pct * 100)}% of today's weighted progress`}>
                <span>{c.got}/{c.total}</span>
                <span className="mini">
                  <i style={{ width: pct * 100 + "%" }} />
                </span>
              </span>
            )
          )}
        </span>

        <span className="tact">
          <button
            className="icon"
            title={task ? "Add a sub-task (turns this into a category)" : "Add task or sub-category"}
            onClick={() => {
              if (collapsed.has(n.id)) ctx.toggleCollapsed(n.id);
              ctx.setAdding(n.id);
            }}
          >
            +
          </button>
          <button className="icon del hdel" title="Delete" onClick={() => actions.remove(n.id)}>
            ×
          </button>
        </span>
      </div>

      {((n.children.length > 0 && open) || adding === n.id) && (
        <div className="tkids" style={{ "--tc": color } as React.CSSProperties}>
          {open && n.children.map((k, j) => <Row key={k.id} n={k} depth={depth + 1} color={shade(color, top, j)} top={top} ctx={ctx} />)}
          {adding === n.id && <AddInline onAdd={(v) => actions.addChild(n.id, v)} onDone={() => ctx.setAdding(null)} />}
        </div>
      )}
    </div>
  );
}

function AddInline({ onAdd, onDone }: { onAdd: (v: string) => void; onDone: () => void }) {
  const ref = useRef<HTMLInputElement>(null);
  const [v, setV] = useState("");
  useEffect(() => ref.current?.focus(), []);
  return (
    <div className="trow taddrow">
      <input
        ref={ref}
        value={v}
        placeholder="Name, Enter to save"
        onChange={(e) => setV(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && v.trim()) {
            onAdd(v);
            onDone();
          }
          if (e.key === "Escape") onDone();
        }}
        onBlur={() => !v.trim() && onDone()}
      />
    </div>
  );
}
