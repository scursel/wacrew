import { NextResponse } from "next/server";
import { buscarMensagens } from "@/lib/busca-mensagens";
import { atendenteDoPedido, exigirChat, respostaDeErro } from "@/lib/equipe/acesso";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const a = await atendenteDoPedido();
    const url = new URL(req.url);
    const q = url.searchParams.get("q") ?? "";
    const slug = url.searchParams.get("slug")?.trim() || undefined;
    if (slug) exigirChat(a, slug);
    const limit = Number(url.searchParams.get("limit") ?? 30) || 30;
    const offset = Number(url.searchParams.get("offset") ?? 0) || 0;
    return NextResponse.json(await buscarMensagens({ q, slug, allowedSlugs: a.chats, limit, offset }));
  } catch (e) {
    return respostaDeErro(e);
  }
}
