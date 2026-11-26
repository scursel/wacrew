import { NextResponse } from "next/server";
import { respostaDeErro } from "@/lib/equipe/acesso";
import { lerNotificacoesAgente, marcarNotificacoesLidas } from "@/lib/equipe/notificacoes-internas";
import { quemAtendeDoPedido } from "@/lib/equipe/quem";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const quem = await quemAtendeDoPedido();
    const itens = await lerNotificacoesAgente(quem.id);
    return NextResponse.json({ itens });
  } catch (e) {
    return respostaDeErro(e);
  }
}

export async function POST() {
  try {
    const quem = await quemAtendeDoPedido();
    await marcarNotificacoesLidas(quem.id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return respostaDeErro(e);
  }
}
