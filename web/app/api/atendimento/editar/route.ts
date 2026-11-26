import { NextResponse } from "next/server";
import { atendenteDoPedido, exigirChat, respostaDeErro } from "@/lib/equipe/acesso";
import { assinar, deveAssinar, nomeDeQuemEnvia } from "@/lib/equipe/assinatura";
import { destinoDoSlug } from "@/lib/equipe/destino";
import { CONTROL_URL } from "@/lib/paths";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const a = await atendenteDoPedido();
    const body = (await req.json().catch(() => ({}))) as { slug?: string; msgId?: string; texto?: string };
    const slug = typeof body.slug === "string" ? body.slug : "";
    exigirChat(a, slug);
    const msgId = typeof body.msgId === "string" ? body.msgId.trim() : "";
    const texto = typeof body.texto === "string" ? body.texto.trim() : "";
    if (!msgId || !texto) {
      return NextResponse.json({ error: "msgId e texto são obrigatórios" }, { status: 400 });
    }
    const jid = await destinoDoSlug(slug);
    if (!jid) return NextResponse.json({ error: "não achei o destino deste chat" }, { status: 409 });
    const assinado = (await deveAssinar(a.usuario.login))
      ? assinar(texto, await nomeDeQuemEnvia(a.usuario.login))
      : texto;
    const res = await fetch(`${CONTROL_URL}/edit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jid, msgId, text: assinado }),
    }).catch(() => null);
    if (!res) return NextResponse.json({ error: "Coletor offline." }, { status: 502 });
    const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
    if (!res.ok || !data.ok) {
      return NextResponse.json({ error: data.error ?? "falha na edição" }, { status: res.status || 502 });
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    return respostaDeErro(e);
  }
}
