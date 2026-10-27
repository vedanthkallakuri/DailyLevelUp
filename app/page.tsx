"use client";

import { useEffect, useRef, useState } from "react";
import LevelCard from "@/components/LevelCard";
import ListView from "@/components/ListView";
import Logo from "@/components/Logo";
import MonthCalendar from "@/components/MonthCalendar";
import ProgressBars from "@/components/ProgressBars";
import StatsPanel from "@/components/StatsPanel";
import TableView from "@/components/TableView";
import TaskTree from "@/components/TaskTree";
import PlanDay from "@/components/PlanDay";
import { needsPlanning, todayKey, todaySets } from "@/lib/tasks";
import { useStore } from "@/lib/useStore";

type View = "tree" | "table" | "list";
const PLAN_KEY = "dailylevelup.planned-on";

export default function Home() {
  const { state, actions, toast, undo, dismissToast, sync } = useStore();
  const [dateLabel, setDateLabel] = useState("");
  const [showStats, setShowStats] = useState(false);
  const [showPlan, setShowPlan] = useState(false);
  const [view, setView] = useState<View>("tree");

  // Offer the "plan your day" step once per day, if there are long-term tasks to plan.
  const planChecked = useRef(false);
  useEffect(() => {
    if (!state || planChecked.current) return;
    planChecked.current = true;
    try {
      if (localStorage.getItem(PLAN_KEY) !== todayKey() && needsPlanning(state.tree)) setShowPlan(true);
    } catch {}
  }, [state]);
  const closePlan = () => {
    setShowPlan(false);
    try {
      localStorage.setItem(PLAN_KEY, todayKey());
    } catch {}
  };

  // remember the last chosen view (a per-browser convenience; fine if storage is unavailable)
  useEffect(() => {
    try {
      const v = localStorage.getItem("dailylevelup.view");
      if (v === "table" || v === "list") setView(v);
    } catch {}
  }, []);
  const chooseView = (v: View) => {
    setView(v);
    try {
      localStorage.setItem("dailylevelup.view", v);
    } catch {}
  };

  // light/dark: a saved choice wins, otherwise the system setting (see the script in layout.tsx)
  const [theme, setTheme] = useState<"light" | "dark">("light");
  useEffect(() => {
    const t = document.documentElement.dataset.theme;
    setTheme(t === "dark" || t === "light" ? t : matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
  }, []);
  const toggleTheme = () => {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem("dailylevelup.theme", next);
    } catch {}
  };

  useEffect(() => {
    setDateLabel(new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" }));
  }, []);

  // Ctrl/Cmd+Z undoes the last delete or move (text fields keep their own undo).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.shiftKey || e.key.toLowerCase() !== "z") return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable) && (t as HTMLInputElement).type !== "checkbox") return;
      if (undo()) e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [undo]);

  if (!state) return null; // localStorage is only available after mount
  const { done, hidden, bonus } = todaySets(state);

  return (
    <>
      <header>
        <div className="brand">
          <Logo />
          <h1>DailyLevelUp</h1>
        </div>
        <span className="date">{dateLabel}</span>
        <span className={`sync ${sync}`} role="status" title="Your data is saved to a file on the machine running this app">
          {{ saved: "Saved ✓", saving: "Saving…", offline: "Offline · saved in this browser, will retry", updated: "Loaded newer data" }[sync]}
        </span>
        <div className="seg viewseg" role="group" aria-label="View">
          <button className={view === "tree" ? "on" : ""} onClick={() => chooseView("tree")}>Tree</button>
          <button className={view === "table" ? "on" : ""} onClick={() => chooseView("table")}>Table</button>
          <button className={view === "list" ? "on" : ""} onClick={() => chooseView("list")}>List</button>
        </div>
        <button className="planbtn" title="Choose today's long-term tasks" onClick={() => setShowPlan(true)}>
          Plan day
        </button>
        <button
          className="statsbtn"
          title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
          aria-label="Toggle light and dark mode"
          onClick={toggleTheme}
        >
          {theme === "dark" ? (
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
              <circle cx="12" cy="12" r="4" />
              <path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M5.6 18.4L7 17M17 7l1.4-1.4" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z" />
            </svg>
          )}
        </button>
        <button className="statsbtn" title="Stats and trends" aria-label="Open stats" onClick={() => setShowStats(true)}>
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
            <path d="M5 20V12M12 20V5M19 20v-5" />
          </svg>
        </button>
      </header>
      <main>
        <section className="card">
          <h2>Tasks</h2>
          {view === "tree" ? (
            <TaskTree tree={state.tree} done={done} actions={actions} />
          ) : view === "table" ? (
            <TableView tree={state.tree} done={done} hidden={hidden} actions={actions} />
          ) : (
            <ListView tree={state.tree} done={done} actions={actions} />
          )}
        </section>
        <div className="bottom">
          <section className="card">
            <MonthCalendar log={state.log} />
          </section>
          <section className="card">
            <h2>Today&apos;s progress</h2>
            <ProgressBars tree={state.tree} done={done} hidden={hidden} bonus={bonus} />
          </section>
          <section className="card">
            <LevelCard log={state.log} pct={state.log[todayKey()]?.pct ?? 0} hasTasks={state.tree.length > 0} />
          </section>
        </div>
      </main>
      {showPlan && <PlanDay tree={state.tree} actions={actions} onClose={closePlan} />}
      {showStats && <StatsPanel log={state.log} tree={state.tree} onClose={() => setShowStats(false)} />}
      {toast && (
        <div className="toast" key={toast.id} role="status">
          <span>{toast.msg}</span>
          <button onClick={undo}>Undo</button>
          <button className="x" aria-label="Dismiss" onClick={dismissToast}>×</button>
        </div>
      )}
    </>
  );
}
