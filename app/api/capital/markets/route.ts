import { NextResponse } from "next/server";
import { searchMarket } from "@/lib/capital";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const term = searchParams.get("q") || "";
  if (!term) return NextResponse.json({ markets: [] });
  try {
    return NextResponse.json({ markets: await searchMarket(term) });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
