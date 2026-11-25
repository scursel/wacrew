import { NextResponse } from "next/server";
import { atendenteDoPedido, exigirChat, irmaosLiberados, respostaDeErro } from "@/lib/equipe/acesso";
import { janelaDaConversa } from "@/lib/equipe/conversa";
import { ultimoAtendimento } from "@/lib/ultimo-atendimento";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const LIMITE_PADRAO = 150;
const LIMITE_MAX = 500;

export async function GET(req: Request) {
  try {
    const a = await atendenteDoPedido();
    const url = new URL(req.url);
    const slug = url.searchParams.get("slug") ?? "";
    exigirChat(a, slug);
    const before = url.searchParams.get("before") ?? undefined;
    if (before && !/^[\w=+/-]{1,128}$/.test(before)) {
      return NextResponse.json({ error: "before inválido" }, { status: 400 });
    }
    const pedido = Number(url.searchParams.get("limit"));
    const limit = Number.isFinite(pedido) && pedido > 0 ? Math.min(pedido, LIMITE_MAX) : LIMITE_PADRAO;
    // DM partida em telefone × LID: os irmãos liberados entram fundidos na mesma janela.
    const slugs = await irmaosLiberados(a, slug);
    const mensagens = janelaDaConversa(slugs, { limit, before });
    if (!before && url.searchParams.get("ultimoAtendimento") === "1") {
      const [messages, atendimento] = await Promise.all([mensagens, ultimoAtendimento(slugs)]);
      return NextResponse.json({ messages, ultimoAtendimento: atendimento });
    }
    return NextResponse.json(await mensagens);
  } catch (e) {
    return respostaDeErro(e);
  }
}
