import { NextResponse } from "next/server";
import { ErroHttp, respostaDeErro } from "@/lib/equipe/acesso";
import { definirDisponibilidade, lerDisponibilidade, type StatusDisponibilidade } from "@/lib/equipe/disponibilidade";
import { quemAtendeDoPedido } from "@/lib/equipe/quem";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const quem = await quemAtendeDoPedido();
    const todos = await lerDisponibilidade();
    return NextResponse.json({ status: todos[quem.id] ?? "online", todos });
  } catch (e) {
    return respostaDeErro(e);
  }
}

export async function POST(req: Request) {
  try {
    const quem = await quemAtendeDoPedido();
    const body = (await req.json().catch(() => null)) as { status?: unknown } | null;
    const st = body?.status;
    if (st !== "online" && st !== "ocupado" && st !== "offline") {
      throw new ErroHttp(400, "status deve ser online, ocupado ou offline");
    }
    const todos = await definirDisponibilidade(quem.id, st as StatusDisponibilidade);
    return NextResponse.json({ ok: true, status: st, todos });
  } catch (e) {
    return respostaDeErro(e);
  }
}
