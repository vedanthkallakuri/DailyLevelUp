"use client";

import { useEffect, useMemo, useState } from "react";
import { COLORS, DayLog, Task, dayKey, doneCount } from "@/lib/tasks";

const GOOD_DAY = 0.5; // a day counts toward a streak at 50% or more

type Point = { key: string; date: Date; pct: number | null; done: number; dd: number; dt: number }; // dd/dt: daily tasks done / total

const pctText = (p: number) => Math.round(p * 100) + "%";
const label = (d: Date) => d.toLocaleDateString(undefined, { month: "short", day: "numeric" });

function lastDays(log: Record<string, DayLog>, n: number): Point[] {
  const out: Point[] = [];
  const now = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
    const key = dayKey(date);
    const e = log[key];
    out.push({ key, date, pct: e?.pct ?? null, done: doneCount(e), dd: e?.daily?.done ?? 0, dt: e?.daily?.total ?? 0 });
  }
  return out;
}

// Consecutive "good" days ending today (or yesterday, if today isn't good yet), and the best run overall.
export function streaks(log: Record<string, DayLog>) {
  const keys = Object.keys(log).sort();
  if (!keys.length) return { current: 0, best: 0 };
  const good = (k: string) => (log[k]?.pct ?? 0) >= GOOD_DAY;
  let best = 0, run = 0;
  const first = new Date(keys[0] + "T00:00");
  const now = new Date();
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  for (let d = first; d <= end; d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)) {
    run = good(dayKey(d)) ? run + 1 : 0;
    best = Math.max(best, run);
  }
  let current = 0;
  let d = end;
  if (!good(dayKey(d))) d = new Date(d.getFullYear(), d.getMonth(), d.getDate() - 1);
  while (good(dayKey(d))) {
    current++;
    d = new Date(d.getFullYear(), d.getMonth(), d.getDate() - 1);
  }
  return { current, best };
}

export default function StatsPanel({ log, tree, onClose }: { log: Record<string, DayLog>; tree: Task[]; onClose: () => void }) {
  const [range, setRange] = useState<7 | 30>(7);
  const [view, setView] = useState<"chart" | "table">("chart");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const pts = useMemo(() => lastDays(log, range), [log, range]);
  const tracked = pts.filter((p) => p.pct != null);
  const avg = tracked.length ? tracked.reduce((a, p) => a + (p.pct as number), 0) / tracked.length : 0;
  const totalDone = pts.reduce((a, p) => a + p.done, 0);
  const dailyDone = pts.reduce((a, p) => a + p.dd, 0);
  const dailyTotal = pts.reduce((a, p) => a + p.dt, 0);
  const best = tracked.reduce<Point | null>((b, p) => (!b || (p.pct as number) > (b.pct as number) ? p : b), null);
  const { current, best: bestStreak } = useMemo(() => streaks(log), [log]);

  // per-category average completion over the range, in tree order so colors match the graph
  const cats = useMemo(() => {
    return tree.map((n, i) => {
      const vals = pts.map((p) => log[p.key]?.cats?.find((c) => c.id === n.id)?.pct).filter((v): v is number => v != null);
      return { id: n.id, name: n.name, color: COLORS[i % COLORS.length], avg: vals.length ? vals.reduce((a, v) => a + v, 0) / vals.length : null };
    });
  }, [tree, pts, log]);

  return (
    <div className="backdrop center" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal stats">
        <div className="drawer-head">
          <h3>Stats</h3>
          <div className="statsctl">
            <div className="seg">
              <button className={range === 7 ? "on" : ""} onClick={() => setRange(7)}>7 days</button>
              <button className={range === 30 ? "on" : ""} onClick={() => setRange(30)}>30 days</button>
            </div>
            <div className="seg">
              <button className={view === "chart" ? "on" : ""} onClick={() => setView("chart")}>Chart</button>
              <button className={view === "table" ? "on" : ""} onClick={() => setView("table")}>Table</button>
            </div>
            <button className="icon" title="Close" onClick={onClose}>×</button>
          </div>
        </div>

        <div className="tiles">
          <Tile k="Current streak" v={`${current} day${current === 1 ? "" : "s"}`} sub={`days at ${pctText(GOOD_DAY)}+`} />
          <Tile k="Best streak" v={`${bestStreak} day${bestStreak === 1 ? "" : "s"}`} />
          <Tile
            k={`Daily tasks · ${range}d`}
            v={dailyTotal ? pctText(dailyDone / dailyTotal) : "–"}
            sub={dailyTotal ? `${dailyDone} of ${dailyTotal} completed` : "recorded from today on"}
          />
          <Tile k={`Average · ${range}d`} v={tracked.length ? pctText(avg) : "–"} />
          <Tile k="Tasks done" v={String(totalDone)} sub={best ? `best day ${label(best.date)} · ${pctText(best.pct as number)}` : undefined} />
        </div>

        {view === "chart" ? <LineChart pts={pts} /> : <DataTable pts={pts} />}

        <h4 className="substats">By category · average over {range} days</h4>
        {cats.length === 0 ? (
          <p className="empty">No categories yet.</p>
        ) : (
          <div className="catbars">
            {cats.map((c) => (
              <div key={c.id} className="pb-head">
                <span className="pb-label">{c.name}</span>
                <div className="bar">
                  <i style={{ width: (c.avg ?? 0) * 100 + "%", background: `var(${c.color})` }} />
                </div>
                <span className="pct">{c.avg == null ? "–" : pctText(c.avg)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function Tile({ k, v, sub }: { k: string; v: string; sub?: string }) {
  return (
    <div className="tile">
      <div className="tk">{k}</div>
      <div className="tv">{v}</div>
      {sub && <div className="ts">{sub}</div>}
    </div>
  );
}

const W = 760, H = 220, PAD = { l: 36, r: 12, t: 14, b: 26 };

// Completion % per day. Days with no record leave a gap in the line.
function LineChart({ pts }: { pts: Point[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const x = (i: number) => PAD.l + (pts.length === 1 ? 0 : (i / (pts.length - 1)) * (W - PAD.l - PAD.r));
  const y = (p: number) => PAD.t + (1 - p) * (H - PAD.t - PAD.b);

  // split into runs of consecutive tracked days
  const runs: { i: number; p: number }[][] = [];
  pts.forEach((pt, i) => {
    if (pt.pct == null) return;
    const last = runs[runs.length - 1];
    if (last && last[last.length - 1].i === i - 1) last.push({ i, p: pt.pct });
    else runs.push([{ i, p: pt.pct }]);
  });
  const line = (run: { i: number; p: number }[]) => run.map((q, k) => `${k ? "L" : "M"}${x(q.i)} ${y(q.p)}`).join(" ");
  const area = (run: { i: number; p: number }[]) =>
    `${line(run)} L${x(run[run.length - 1].i)} ${y(0)} L${x(run[0].i)} ${y(0)} Z`;

  const tickEvery = pts.length > 10 ? 5 : 1;
  const hp = hover != null ? pts[hover] : null;

  return (
    <div className="chartwrap">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="chart"
        role="img"
        aria-label="Daily completion percentage"
        onMouseLeave={() => setHover(null)}
        onMouseMove={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          const px = ((e.clientX - r.left) / r.width) * W;
          const i = Math.round(((px - PAD.l) / (W - PAD.l - PAD.r)) * (pts.length - 1));
          setHover(Math.max(0, Math.min(pts.length - 1, i)));
        }}
      >
        <defs>
          <linearGradient id="areaFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="var(--c1)" stopOpacity=".22" />
            <stop offset="1" stopColor="var(--c1)" stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0, 0.5, 1].map((g) => (
          <g key={g}>
            <line x1={PAD.l} x2={W - PAD.r} y1={y(g)} y2={y(g)} stroke="var(--line)" strokeWidth="1" />
            <text x={PAD.l - 8} y={y(g) + 4} textAnchor="end" fontSize="11" fill="var(--muted)">{g * 100}%</text>
          </g>
        ))}
        {pts.map((p, i) =>
          i % tickEvery === 0 || i === pts.length - 1 ? (
            <text key={p.key} x={x(i)} y={H - 6} textAnchor="middle" fontSize="11" fill="var(--muted)">{label(p.date)}</text>
          ) : null,
        )}
        {runs.map((run, k) => (
          <g key={k}>
            {run.length > 1 && <path d={area(run)} fill="url(#areaFill)" />}
            <path d={line(run)} fill="none" stroke="var(--c1)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
          </g>
        ))}
        {pts.length <= 31 &&
          pts.map((p, i) =>
            p.pct == null ? null : <circle key={p.key} cx={x(i)} cy={y(p.pct)} r="3" fill="var(--card)" stroke="var(--c1)" strokeWidth="2" />,
          )}
        {hp && hover != null && (
          <g>
            <line x1={x(hover)} x2={x(hover)} y1={PAD.t} y2={H - PAD.b} stroke="var(--line2)" strokeWidth="1" />
            {hp.pct != null && <circle cx={x(hover)} cy={y(hp.pct)} r="5" fill="var(--c1)" stroke="var(--card)" strokeWidth="2" />}
          </g>
        )}
      </svg>
      {hp && hover != null && (
        <div className="tip" style={{ left: `${(x(hover) / W) * 100}%` }}>
          <b>{label(hp.date)}</b>
          <span>{hp.pct == null ? "No data" : `${pctText(hp.pct)} · ${hp.done} done`}</span>
          {hp.dt > 0 && <span>Daily tasks {hp.dd}/{hp.dt} ({pctText(hp.dd / hp.dt)})</span>}
        </div>
      )}
    </div>
  );
}

function DataTable({ pts }: { pts: Point[] }) {
  return (
    <div className="tablewrap">
      <table>
        <thead>
          <tr><th>Date</th><th>Completion</th><th>Tasks done</th><th>Daily tasks</th></tr>
        </thead>
        <tbody>
          {[...pts].reverse().map((p) => (
            <tr key={p.key}>
              <td>{label(p.date)}</td>
              <td>{p.pct == null ? "–" : pctText(p.pct)}</td>
              <td>{p.pct == null ? "–" : p.done}</td>
              <td>{p.dt ? `${p.dd}/${p.dt} · ${pctText(p.dd / p.dt)}` : "–"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
