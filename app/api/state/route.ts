import { NextResponse } from "next/server";
import { readStored, saveStored } from "@/lib/server/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { "cache-control": "no-store" };
const MAX_BYTES = 5_000_000;

export async function GET() {
  try {
    const stored = await readStored();
    return NextResponse.json({ rev: stored?.rev ?? 0, state: stored?.state ?? null }, { headers: NO_STORE });
  } catch {
    return NextResponse.json({ error: "Could not read saved data" }, { status: 500, headers: NO_STORE });
  }
}

export async function PUT(req: Request) {
  const text = await req.text();
  if (text.length > MAX_BYTES) return NextResponse.json({ error: "Too large" }, { status: 413 });

  let body: { state?: { tree?: unknown; log?: unknown }; baseRev?: unknown };
  try {
    body = JSON.parse(text);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const s = body.state;
  if (!s || !Array.isArray(s.tree) || typeof s.log !== "object" || s.log === null) {
    return NextResponse.json({ error: "Invalid state" }, { status: 400 });
  }
  const baseRev = typeof body.baseRev === "number" ? body.baseRev : null;

  try {
    const res = await saveStored(s, baseRev);
    if (!res.ok) return NextResponse.json({ conflict: true, rev: res.rev, state: res.state }, { status: 409, headers: NO_STORE });
    return NextResponse.json({ rev: res.rev }, { headers: NO_STORE });
  } catch {
    return NextResponse.json({ error: "Could not save" }, { status: 500, headers: NO_STORE });
  }
}
