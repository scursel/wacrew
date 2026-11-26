import { NextResponse } from "next/server";
import { CONTROL_URL } from "@/lib/paths";

export const runtime = "nodejs";

interface Body {
  jid?: string;
  msgId?: string;
  participant?: string;
  fromMe?: boolean;
}

async function apagar(req: Request) {
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  if (!body.jid || !body.msgId) {
    return NextResponse.json({ error: "jid e msgId são obrigatórios" }, { status: 400 });
  }
  try {
    const res = await fetch(`${CONTROL_URL}/message`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jid: body.jid,
        msgId: body.msgId,
        participant: body.participant,
        fromMe: body.fromMe ?? true,
      }),
    });
    const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
    if (!res.ok || !data.ok) {
      return NextResponse.json({ error: data.error ?? "falha ao apagar mensagem" }, { status: res.status || 502 });
    }
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Coletor offline." }, { status: 502 });
  }
}

export async function POST(req: Request) {
  return apagar(req);
}

export async function DELETE(req: Request) {
  return apagar(req);
}
