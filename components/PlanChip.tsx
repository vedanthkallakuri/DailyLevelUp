"use client";

import type { Actions } from "@/lib/useStore";
import { Task, planOf, todayKey } from "@/lib/tasks";

const fmt = (d: string) => new Date(d + "T00:00").toLocaleDateString(undefined, { month: "short", day: "numeric" });

// Daily tasks get a small ↻ mark. Long-term tasks get a "Today" button that plans them for today;
// click it again to send the task back to the backlog.
export default function PlanChip({ n, checked, actions }: { n: Task; checked: boolean; actions: Actions }) {
  const plan = planOf(n);
  if (plan === "daily") return <span className="dailymark" title="Daily task: comes back every day">↻</span>;
  if (checked) return null;

  const counted = plan === "today" || plan === "carried";
  const label = plan === "carried" ? "↪ Carried" : counted ? "Today" : plan === "later" ? `Later · ${fmt(n.planned!)}` : "+ Today";
  const title = counted
    ? plan === "carried" ? "Carried over from an earlier day. Click to move back to the backlog" : "Planned for today. Click to move back to the backlog"
    : "Click to plan this for today";

  return (
    <button
      className={`chip ${plan}${counted ? " on" : ""}`}
      title={title}
      onClick={() => actions.patch(n.id, { planned: counted ? "" : todayKey() })}
    >
      {label}
    </button>
  );
}
