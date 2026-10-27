"use client";

import { useState } from "react";
import { COLORS, Task, stats } from "@/lib/tasks";

const pctText = (p: number) => Math.round(p * 100) + "%";

function Bar({ pct, color }: { pct: number; color: string }) {
  return (
    <div className="bar">
      <i style={{ width: pct * 100 + "%", background: `var(${color})` }} />
    </div>
  );
}

type Sets = { done: Set<string>; hidden: Set<string> };

function Sub({ n, color, sets }: { n: Task; color: string; sets: Sets }) {
  const s = stats(n, sets.done, sets.hidden);
  return (
    <div className="sub">
      <div className="pb-head">
        <span className="pb-label">{n.name}</span>
        <Bar pct={s.pct} color={color} />
        <span className="pct">{pctText(s.pct)}</span>
      </div>
      {n.children.length > 0 && (
        <div className="pb-detail" style={{ display: "block" }}>
          {n.children.map((c) => (
            <Sub key={c.id} n={c} color={color} sets={sets} />
          ))}
        </div>
      )}
    </div>
  );
}

// Top-level categories; click a bar to see the nested breakdown.
export default function ProgressBars({ tree, done, hidden, bonus }: { tree: Task[]; done: Set<string>; hidden: Set<string>; bonus: number }) {
  const [open, setOpen] = useState<Set<string>>(new Set());
  if (!tree.length) return <div className="empty">Nothing to track yet.</div>;

  const toggle = (id: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (!next.delete(id)) next.add(id);
      return next;
    });

  const sets = { done, hidden };
  const total = stats(tree, done, hidden);
  return (
    <>
      {tree.map((n, i) => {
        const color = COLORS[i % COLORS.length];
        const s = stats(n, done, hidden);
        return (
          <div key={n.id} className={"pb" + (open.has(n.id) ? " open" : "")}>
            <div className="pb-head" onClick={() => toggle(n.id)}>
              <span className="pb-label">{n.name}</span>
              <Bar pct={s.pct} color={color} />
              <span className="pct">{pctText(s.pct)}</span>
            </div>
            {n.children.length > 0 && (
              <div className="pb-detail">
                {n.children.map((c) => (
                  <Sub key={c.id} n={c} color={color} sets={sets} />
                ))}
              </div>
            )}
          </div>
        );
      })}
      <div className="total">
        <span>Overall today</span>
        <b>
          {pctText(total.pct)}
          {bonus > 0 && <span className="bonus" title="Tasks you finished that weren't planned for today"> +{bonus} bonus</span>}
        </b>
      </div>
    </>
  );
}
