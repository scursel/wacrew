import { NextResponse } from "next/server";
import { buscarMensagens } from "@/lib/busca-mensagens";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const q = url.searchParams.get("q") ?? "";
  const slug = url.searchParams.get("slug")?.trim() || undefined;
  const limit = Number(url.searchParams.get("limit") ?? 30) || 30;
  const offset = Number(url.searchParams.get("offset") ?? 0) || 0;
  return NextResponse.json(await buscarMensagens({ q, slug, limit, offset }));
}
