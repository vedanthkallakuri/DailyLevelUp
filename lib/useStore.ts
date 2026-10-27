"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { State, Task, contains, find, parentOf, seed, snapshotToday, todayKey, uid } from "./tasks";

const KEY = "dailylevelup.v1";
const API = "/api/state";

// The browser copy is only a cache / offline fallback; the server file is the source of truth.
function loadLocal(): State | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const s = JSON.parse(raw);
      if (s && Array.isArray(s.tree)) return s;
    }
  } catch {}
  return null;
}

// Keep today's log entry in sync with the tree.
function withToday(s: State): State {
  return { ...s, log: { ...s.log, [todayKey()]: snapshotToday(s) } };
}

// Undo history for structural changes: enough to put a node back where it was.
type Op =
  | { kind: "delete"; node: Task; parentId: string | null; index: number }
  | { kind: "move"; id: string; parentId: string | null; index: number };

export type Toast = { id: number; msg: string };
export type Sync = "saved" | "saving" | "offline" | "updated";

export function useStore() {
  const [state, setState] = useState<State | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);
  const [sync, setSync] = useState<Sync>("saved");
  const stateRef = useRef<State | null>(null);
  stateRef.current = state;
  const stack = useRef<Op[]>([]);

  // server sync bookkeeping
  const revRef = useRef<number | null>(null); // last server revision we have seen
  const dirty = useRef(false); // local changes not yet on the server
  const flushing = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flush = useCallback(async () => {
    const snapshot = stateRef.current;
    if (flushing.current || !dirty.current || !snapshot) return;
    flushing.current = true;
    dirty.current = false; // edits made while this request is in flight set it again
    setSync("saving");
    let again = false;
    try {
      const res = await fetch(API, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ state: snapshot, baseRev: revRef.current }),
        keepalive: true,
      });
      if (res.status === 409) {
        // another tab or device saved newer data: take theirs rather than overwrite it
        const j = await res.json();
        revRef.current = j.rev;
        dirty.current = false;
        setState(withToday(j.state));
        setSync("updated");
      } else if (!res.ok) {
        throw new Error("save failed");
      } else {
        revRef.current = (await res.json()).rev;
        again = dirty.current;
        setSync(again ? "saving" : "saved");
      }
    } catch {
      dirty.current = true;
      setSync("offline");
    } finally {
      flushing.current = false;
      if (again) setTimeout(() => flush(), 300);
    }
  }, []);

  const scheduleSave = useCallback(() => {
    dirty.current = true;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => flush(), 500);
  }, [flush]);

  // Initial load: the server wins; if it has nothing yet, upload what this browser already had.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const local = loadLocal();
      try {
        const res = await fetch(API, { cache: "no-store" });
        if (!res.ok) throw new Error("load failed");
        const j = await res.json();
        if (cancelled) return;
        revRef.current = j.rev;
        if (j.state) {
          setState(withToday(j.state));
        } else {
          setState(withToday(local ?? seed()));
          scheduleSave(); // first run: migrate localStorage (or the starter tree) to the server
        }
      } catch {
        if (cancelled) return;
        setState(withToday(local ?? seed()));
        dirty.current = true; // retried automatically below
        setSync("offline");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [scheduleSave]);

  // Local cache.
  useEffect(() => {
    if (!state) return;
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch {}
  }, [state]);

  // Retry while offline, save when the tab is hidden, and pick up changes from other devices on return.
  useEffect(() => {
    const retry = setInterval(() => dirty.current && flush(), 10000);
    const onVisibility = async () => {
      if (document.visibilityState === "hidden") return void flush();
      if (dirty.current || flushing.current) return flush();
      try {
        const res = await fetch(API, { cache: "no-store" });
        if (!res.ok) return;
        const j = await res.json();
        if (j.state && j.rev !== revRef.current && !dirty.current) {
          revRef.current = j.rev;
          setState(withToday(j.state));
        }
      } catch {}
    };
    const onHide = () => void flush();
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", onHide);
    return () => {
      clearInterval(retry);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", onHide);
    };
  }, [flush]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 6000);
    return () => clearTimeout(t);
  }, [toast]);

  const update = useCallback(
    (fn: (draft: State) => void) => {
      setState((prev) => {
        if (!prev) return prev;
        const draft = structuredClone(prev);
        fn(draft);
        return withToday(draft);
      });
      scheduleSave();
    },
    [scheduleSave],
  );

  const say = (msg: string) => setToast({ id: Date.now(), msg });
  const listOf = (d: State, parentId: string | null) => (parentId ? find(d.tree, parentId)?.node.children : null) ?? d.tree;

  const setTodayDone = (d: State, fn: (done: Set<string>) => void) => {
    const k = todayKey();
    const done = new Set(d.log[k]?.done ?? []);
    fn(done);
    d.log[k] = { done: [...done] };
  };

  const actions = {
    toggle: (id: string) =>
      update((d) => {
        const hit = find(d.tree, id);
        if (!hit) return;
        const k = todayKey();
        const n = hit.node;
        const oneOff = n.daily === false;
        if (oneOff && n.completedOn && n.completedOn < k) {
          n.completedOn = undefined; // reopen a one-off finished on an earlier day
          return;
        }
        setTodayDone(d, (done) => {
          if (done.delete(id)) {
            if (oneOff) n.completedOn = undefined;
          } else {
            done.add(id);
            if (oneOff) n.completedOn = k;
          }
        });
      }),
    addChild: (parentId: string, name: string) =>
      update((d) => {
        const hit = find(d.tree, parentId);
        if (!hit || !name.trim()) return;
        // a task that becomes a category loses its own check-off
        setTodayDone(d, (done) => done.delete(parentId));
        hit.node.completedOn = undefined;
        hit.node.children.push({ id: uid(), name: name.trim(), stars: 1, children: [] });
      }),
    addTop: (name: string) =>
      update((d) => {
        if (name.trim()) d.tree.push({ id: uid(), name: name.trim(), stars: 1, children: [] });
      }),
    remove: (id: string) => {
      const s = stateRef.current;
      const hit = s && find(s.tree, id);
      if (!s || !hit) return;
      stack.current.push({
        kind: "delete",
        node: structuredClone(hit.node),
        parentId: parentOf(s.tree, id)?.id ?? null,
        index: hit.list.indexOf(hit.node),
      });
      update((d) => {
        const h = find(d.tree, id);
        if (h) h.list.splice(h.list.indexOf(h.node), 1);
      });
      say(`Deleted “${hit.node.name || "Untitled"}”`);
    },
    move: (id: string, targetId: string | null) => {
      const s = stateRef.current;
      const hit = s && find(s.tree, id);
      if (!s || !hit || targetId === id || (targetId && contains(hit.node, targetId))) return;
      const parentId = parentOf(s.tree, id)?.id ?? null;
      if (parentId === targetId) return;
      stack.current.push({ kind: "move", id, parentId, index: hit.list.indexOf(hit.node) });
      update((d) => {
        const h = find(d.tree, id);
        if (!h) return;
        h.list.splice(h.list.indexOf(h.node), 1);
        if (!targetId) return void d.tree.push(h.node);
        const t = find(d.tree, targetId)!.node;
        setTodayDone(d, (done) => done.delete(targetId)); // a task that gains a child becomes a category
        t.completedOn = undefined;
        t.children.push(h.node);
      });
      say(`Moved “${hit.node.name || "Untitled"}”`);
    },
    patch: (id: string, p: Partial<Pick<Task, "name" | "stars" | "link" | "deadline" | "notes" | "planned">>) =>
      update((d) => {
        const hit = find(d.tree, id);
        if (hit) Object.assign(hit.node, p);
      }),
    setDaily: (id: string, daily: boolean) =>
      update((d) => {
        const hit = find(d.tree, id);
        if (!hit) return;
        hit.node.daily = daily;
        const doneToday = (d.log[todayKey()]?.done ?? []).includes(id);
        hit.node.completedOn = !daily && doneToday ? todayKey() : undefined;
      }),
  };

  const undo = useCallback(() => {
    const op = stack.current.pop();
    if (!op) return false;
    update((d) => {
      if (op.kind === "delete") {
        const list = listOf(d, op.parentId);
        list.splice(Math.min(op.index, list.length), 0, op.node);
      } else {
        const h = find(d.tree, op.id);
        if (!h) return;
        h.list.splice(h.list.indexOf(h.node), 1);
        const list = listOf(d, op.parentId);
        list.splice(Math.min(op.index, list.length), 0, h.node);
      }
    });
    setToast(null);
    return true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [update]);

  return { state, actions, toast, undo, dismissToast: () => setToast(null), sync };
}

export type Actions = ReturnType<typeof useStore>["actions"];
