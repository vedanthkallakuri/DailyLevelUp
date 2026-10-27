"use client";

import { useEffect, useState } from "react";
import { DayLog, dayKey, doneCount, todayKey } from "@/lib/tasks";

const R = 16;
const C = 2 * Math.PI * R;

// Month grid; each day gets a ring filled by that day's completion percentage. Click a day for details.
export default function MonthCalendar({ log }: { log: Record<string, DayLog> }) {
  const [month, setMonth] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const [selected, setSelected] = useState<string | null>(null);
  const y = month.getFullYear();
  const m = month.getMonth();
  const today = todayKey();
  const lead = new Date(y, m, 1).getDay();
  const days = new Date(y, m + 1, 0).getDate();
  const shift = (n: number) => setMonth(new Date(y, m + n, 1));

  return (
    <>
      <div className="calhead">
        <h2>{month.toLocaleDateString(undefined, { month: "long", year: "numeric" })}</h2>
        <div className="nav">
          <button className="icon" title="Previous month" onClick={() => shift(-1)}>‹</button>
          <button className="icon" title="Next month" onClick={() => shift(1)}>›</button>
        </div>
      </div>
      <div className="grid">
        {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
          <div key={i} className="dow">{d}</div>
        ))}
        {Array.from({ length: lead }, (_, i) => <div key={"b" + i} />)}
        {Array.from({ length: days }, (_, i) => {
          const d = i + 1;
          const k = dayKey(new Date(y, m, d));
          const pct = log[k]?.pct;
          return (
            <button
              key={k}
              className={"day" + (k === today ? " today" : "") + (k > today ? " future" : "")}
              title={pct != null ? `${Math.round(pct * 100)}% complete` : "No data"}
              onClick={() => setSelected(k)}
            >
              <svg viewBox="0 0 40 40">
                <circle cx="20" cy="20" r={R} fill="none" stroke="var(--line)" strokeWidth="4" />
                <circle
                  cx="20" cy="20" r={R} fill="none" stroke="var(--good)" strokeWidth="4" strokeLinecap="round"
                  strokeDasharray={`${C * (pct ?? 0)} ${C}`} transform="rotate(-90 20 20)"
                />
              </svg>
              <span>{d}</span>
            </button>
          );
        })}
      </div>
      {selected && <DayDetail day={selected} entry={log[selected]} onClose={() => setSelected(null)} />}
    </>
  );
}

function DayDetail({ day, entry, onClose }: { day: string; entry?: DayLog; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const date = new Date(day + "T00:00").toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });
  const items = entry?.items ?? [];
  // group completed tasks by their category path
  const groups = new Map<string, string[]>();
  items.forEach((it) => groups.set(it.path, [...(groups.get(it.path) ?? []), it.name + (it.bonus ? " · bonus" : "")]));

  return (
    <div className="backdrop center" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="drawer-head">
          <h3>{date}</h3>
          <button className="icon" title="Close" onClick={onClose}>×</button>
        </div>
        {!entry || entry.pct == null ? (
          <p className="empty">Nothing was recorded for this day.</p>
        ) : (
          <>
            <div className="daysum">
              <b>{Math.round(entry.pct * 100)}%</b>
              <span>
                {doneCount(entry)}
                {entry.total != null ? ` of ${entry.total}` : ""} task{doneCount(entry) === 1 ? "" : "s"} done
                {entry.bonus ? ` · +${entry.bonus} bonus` : ""}
                {entry.daily && entry.daily.total > 0 ? ` · daily ${entry.daily.done}/${entry.daily.total}` : ""}
              </span>
            </div>
            {entry.items ? (
              items.length ? (
                [...groups].map(([path, names]) => (
                  <div key={path} className="daygroup">
                    <div className="daypath">{path || "Uncategorized"}</div>
                    {names.map((n, i) => (
                      <div key={i} className="dayitem">
                        <span className="tick">✓</span>
                        {n}
                      </div>
                    ))}
                  </div>
                ))
              ) : (
                <p className="empty">No tasks were completed.</p>
              )
            ) : (
              <p className="empty">This day was logged before task details were recorded.</p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
