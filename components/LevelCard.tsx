"use client";

import { useMemo } from "react";
import { DayLog, todayKey } from "@/lib/tasks";
import { streaks } from "./StatsPanel";

const TITLES = ["Seedling", "Sprout", "Go-Getter", "Streak Keeper", "Task Slayer", "Habit Hero", "Productivity Wizard", "Legend"];
const XP_PER_STAR = 10;

// Each finished task earns 10 XP per difficulty star; unplanned (bonus) tasks earn 50% extra.
function xpOf(e?: DayLog): number {
  if (!e) return 0;
  if (!e.items) return e.done.length * XP_PER_STAR; // days logged before task details were recorded
  return Math.round(e.items.reduce((a, i) => a + i.stars * XP_PER_STAR * (i.bonus ? 1.5 : 1), 0));
}

// Level L starts at 50·L·(L−1) XP: 0, 100, 300, 600, 1000…
const startOf = (level: number) => 50 * level * (level - 1);
const levelOf = (xp: number) => Math.floor((1 + Math.sqrt(1 + xp / 12.5)) / 2);

const R = 38;
const C = 2 * Math.PI * R;

function mood(pct: number, hasTasks: boolean) {
  if (!hasTasks) return "Add some tasks to start earning XP.";
  if (pct >= 1) return "Perfect day. Go touch grass 🌱";
  if (pct >= 0.75) return "Almost there. The finish line smells like victory 🏁";
  if (pct >= 0.5) return "Over halfway. You're on a roll 🎳";
  if (pct > 0) return "Warming up. Keep stacking little wins 🧱";
  return "The couch is winning. Time to fight back 🛋️";
}

// Gamified summary: XP from completed tasks, level, and today's momentum.
export default function LevelCard({ log, pct, hasTasks }: { log: Record<string, DayLog>; pct: number; hasTasks: boolean }) {
  const { xp, today, level, into, span, current } = useMemo(() => {
    const xp = Object.values(log).reduce((a, e) => a + xpOf(e), 0);
    const level = levelOf(xp);
    return {
      xp,
      today: xpOf(log[todayKey()]),
      level,
      into: xp - startOf(level),
      span: startOf(level + 1) - startOf(level),
      current: streaks(log).current,
    };
  }, [log]);

  const frac = Math.min(1, into / span);
  const title = TITLES[Math.min(level - 1, TITLES.length - 1)];

  return (
    <>
      <h2>Level</h2>
      <div className="lvl">
        <div className="lvlring">
          <svg viewBox="0 0 90 90">
            <circle cx="45" cy="45" r={R} fill="none" stroke="var(--line)" strokeWidth="7" />
            <circle
              cx="45" cy="45" r={R} fill="none" stroke="var(--c0)" strokeWidth="7" strokeLinecap="round"
              strokeDasharray={`${C * frac} ${C}`} transform="rotate(-90 45 45)"
              style={{ transition: "stroke-dasharray .5s ease" }}
            />
          </svg>
          <div className="lvlnum">
            <small>LVL</small>
            <b>{level}</b>
          </div>
        </div>
        <div className="lvlinfo">
          <div className="lvltitle">{title}</div>
          <div className="lvlxp">
            {into} / {span} XP
          </div>
          <div className="lvlmeta">
            <span title="XP earned today">⚡ +{today} today</span>
            {current > 0 && <span title="Days in a row at 50% or more">🔥 {current}-day streak</span>}
          </div>
        </div>
      </div>
      <p className="lvlmood">{mood(pct, hasTasks)}</p>
      <p className="lvlhint">
        {span - into} XP to level {level + 1} · {xp} XP total. Each star is worth 10 XP; unplanned bonus tasks earn 50% extra.
      </p>
    </>
  );
}
