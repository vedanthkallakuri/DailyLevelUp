"use client";

import { useEffect } from "react";
import type { Actions } from "@/lib/useStore";
import { FlatTask, deadlineLook, flattenTasks, todayKey } from "@/lib/tasks";

const fmt = (d: string) => new Date(d + "T00:00").toLocaleDateString(undefined, { month: "short", day: "numeric" });

// Morning planning: choose which long-term tasks count for today. Daily tasks are always in.
export default function PlanDay({ tree, actions, onClose }: { tree: import("@/lib/tasks").Task[]; actions: Actions; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const today = todayKey();
  const all = flattenTasks(tree, new Set());
  const open = all.filter((r) => r.n.daily === false && !r.n.completedOn);
  const planned = open.filter((r) => r.n.planned && r.n.planned <= today);
  const backlog = open
    .filter((r) => !r.n.planned || r.n.planned > today)
    .sort((a, b) => (a.n.deadline && b.n.deadline ? a.n.deadline.localeCompare(b.n.deadline) : a.n.deadline ? -1 : b.n.deadline ? 1 : 0));
  const dailyCount = all.filter((r) => r.n.daily !== false).length;
  const date = new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });

  return (
    <div className="backdrop center" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal plan">
        <div className="drawer-head">
          <h3>Plan your day · {date}</h3>
          <button className="icon" title="Close" onClick={onClose}>×</button>
        </div>

        <p className="plansum">
          <b>{dailyCount + planned.length}</b> task{dailyCount + planned.length === 1 ? "" : "s"} count today: {dailyCount} daily
          {planned.length > 0 && ` + ${planned.length} planned`}. Anything else you finish is a bonus.
        </p>

        <section>
          <h4>Planned for today</h4>
          {planned.length === 0 ? (
            <p className="empty">Nothing planned yet. Add something from your backlog below.</p>
          ) : (
            planned.map((r) => <PlanRow key={r.n.id} r={r} label="Remove" onClick={() => actions.patch(r.n.id, { planned: "" })} carried={r.n.planned! < today} />)
          )}
        </section>

        <section>
          <h4>Backlog</h4>
          {backlog.length === 0 ? (
            <p className="empty">Your backlog is empty. Mark a task as “Long-term / one-off” in its edit panel to put it here.</p>
          ) : (
            backlog.map((r) => (
              <PlanRow key={r.n.id} r={r} label="Add to today" primary onClick={() => actions.patch(r.n.id, { planned: today })} />
            ))
          )}
        </section>

        <div className="drawer-foot">
          <span />
          <button className="primary" onClick={onClose}>Done</button>
        </div>
      </div>
    </div>
  );
}

function PlanRow({ r, label, onClick, primary, carried }: { r: FlatTask; label: string; onClick: () => void; primary?: boolean; carried?: boolean }) {
  const { n, path } = r;
  const look = deadlineLook(n.deadline, false);
  const soon = !!look && ["warm", "fire", "bomb", "boom"].includes(look.stage);
  return (
    <div className="pdrow">
      <span className="pdname">
        {n.name || "Untitled"}
        <small>{path.join(" › ")}</small>
      </span>
      {carried && <span className="soon carried">↪ Carried over</span>}
      {soon && <span className="soon">Due soon</span>}
      {n.deadline && (
        <span className="pddue" style={look?.hot ? { color: `hsl(${look.hue} 78% 40%)`, fontWeight: 600 } : undefined} title={look?.text}>
          {fmt(n.deadline)}
          {look?.icon && (
            <span className={`fuse ${look.stage}`} style={{ fontSize: look.size }}>
              {look.icon}
            </span>
          )}
        </span>
      )}
      <span className="stars" aria-label={`${n.stars} star difficulty`}>
        {[1, 2, 3].map((i) => (
          <button key={i} className={i <= n.stars ? "on" : ""} tabIndex={-1} style={{ pointerEvents: "none" }}>
            ★
          </button>
        ))}
      </span>
      <button className={"pdbtn" + (primary ? " primary" : "")} onClick={onClick}>
        {label}
      </button>
    </div>
  );
}
