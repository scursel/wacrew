import { NextResponse } from "next/server";
import { CONTROL_URL } from "@/lib/paths";

export const runtime = "nodejs";

/**
 * Ações de controle da conexão principal do WhatsApp:
 * - `reconectar`: reinicia o socket do coletor mantendo a sessão (útil em quedas/travamentos).
 * - `novo_qr`: encerra a sessão atual, arquiva credenciais antigas e gera um QR novo.
 */
export async function POST(req: Request) {
  let body: { acao?: unknown };
  try {
    body = (await req.json()) as { acao?: unknown };
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const acao = body.acao === "reconectar" || body.acao === "novo_qr" ? body.acao : null;
  if (!acao) {
    return NextResponse.json({ error: "Ação inválida (use reconectar ou novo_qr)." }, { status: 400 });
  }

  const rota = acao === "reconectar" ? "/reconnect" : "/reset-session";

  try {
    const res = await fetch(`${CONTROL_URL}${rota}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
      signal: AbortSignal.timeout(10_000),
    });
    const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
    if (!res.ok || !data.ok) {
      return NextResponse.json(
        { error: data.error ?? "O coletor não conseguiu completar a ação." },
        { status: res.status || 502 },
      );
    }
    return NextResponse.json({ ok: true, acao });
  } catch {
    return NextResponse.json(
      { error: "Coletor offline — não foi possível falar com o serviço do WhatsApp." },
      { status: 502 },
    );
  }
}
