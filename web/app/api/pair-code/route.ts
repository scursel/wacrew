import { NextResponse } from "next/server";
import { CONTROL_URL } from "@/lib/paths";

export const runtime = "nodejs";

export async function POST(req: Request) {
  let body: { number?: unknown };
  try {
    body = (await req.json()) as { number?: unknown };
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const number = typeof body.number === "string" ? body.number.replace(/\D/g, "") : "";
  if (!number) {
    return NextResponse.json({ error: "Informe o número com DDI." }, { status: 400 });
  }

  try {
    const res = await fetch(`${CONTROL_URL}/pair-code`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ number }),
    });
    const data = (await res.json()) as { ok?: boolean; code?: string; error?: string };
    if (!res.ok || !data.ok) {
      return NextResponse.json({ error: data.error ?? "falha ao gerar código" }, { status: res.status || 502 });
    }
    return NextResponse.json({ ok: true, code: data.code });
  } catch {
    return NextResponse.json(
      { error: "Coletor offline — inicie o coletor para gerar o código." },
      { status: 502 },
    );
  }
}
